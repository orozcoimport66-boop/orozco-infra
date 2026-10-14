import { workflow, node, trigger, switchCase, expr } from '@n8n/workflow-sdk';

// Monitor semanal de visibilidad en asistentes de IA.
// Fuente legible. El SDK de n8n no admite funciones ni concatenaciones: lo desplegado es la versión expandida.
// Cada lunes pregunta las preguntas activas (Supabase ia_preguntas) a cada IA con búsqueda web, 3 veces,
// extrae las empresas recomendadas con Claude Haiku y guarda en ia_respuestas (rpc ia_guardar).

const PREPARAR_JS = `
// Motores activos. Gemini necesita la facturación del proyecto de Google Cloud para buscar en Google;
// Perplexity, su credencial.
const MOTORES = ['chatgpt', 'claude'];
const REPS = 3;
const PRUEBA = false; // true: solo 1 pregunta y 1 repetición
const semana = DateTime.now().setZone('Europe/Madrid').startOf('week').toISODate();
const out = [];
let preguntas = $input.all().map((i) => i.json).filter((p) => p && p.id);
if (PRUEBA) preguntas = preguntas.slice(0, 1);
for (const p of preguntas) for (const motor of MOTORES) for (let r = 1; r <= (PRUEBA ? 1 : REPS); r++) {
  out.push({ json: { semana, pregunta_id: p.id, pregunta: p.texto, motor, repeticion: r } });
}
return out;
`;

const NORMALIZAR_JS = `
const t = $('Preparar consultas').item.json;
const j = $json || {};
let texto = '', modelo = '', error = '';
let fuentes = [];
const dom = (u) => { try { return new URL(u).hostname.replace(/^www\\./, ''); } catch (e) { return ''; } };
const limpia = (u) => String(u || '').replace(/[?&]utm_source=openai$/, '');
const fallo = j.error && typeof j.error === 'object' && (j.error.message || j.error.description) && !j.output && !j.content && !j.candidates;
if (fallo) {
  error = String(j.error.description || j.error.message).slice(0, 500);
} else if (t.motor === 'chatgpt') {
  modelo = j.model || '';
  for (const o of j.output || []) if (o.type === 'message') for (const c of o.content || []) {
    texto += c.text || '';
    for (const a of c.annotations || []) if (a.url) fuentes.push({ url: limpia(a.url), titulo: a.title || '' });
  }
} else if (t.motor === 'claude') {
  modelo = j.model || '';
  const resultados = [];
  for (const b of j.content || []) {
    if (b.type === 'text') {
      texto += b.text || '';
      for (const c of b.citations || []) if (c.url) fuentes.push({ url: c.url, titulo: c.title || '' });
    }
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.url) resultados.push({ url: r.url, titulo: r.title || '' });
  }
  if (!fuentes.length) fuentes = resultados;
} else if (t.motor === 'gemini') {
  modelo = j.modelVersion || '';
  const c = (j.candidates || [])[0] || {};
  texto = ((c.content || {}).parts || []).map((p) => p.text || '').join('');
  for (const g of ((c.groundingMetadata || {}).groundingChunks || [])) if (g.web) {
    fuentes.push({ url: g.web.uri, titulo: g.web.title || '', dominio: String(g.web.title || '').replace(/^www\\./, '') });
  }
}
const vistos = new Set();
fuentes = fuentes.filter((f) => { if (vistos.has(f.url)) return false; vistos.add(f.url); return true; })
  .map((f) => ({ ...f, dominio: f.dominio || dom(f.url) })).slice(0, 30);
if (!texto && !error) error = 'Respuesta vacía';
return { json: { ...t, modelo, texto: texto.slice(0, 20000), fuentes, error } };
`;

const GUARDAR_JS = `
const n = $('Normalizar respuesta').item.json;
let empresas = [];
try {
  const txt = ($json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const m = txt.match(/\\{[\\s\\S]*\\}/);
  if (m) empresas = (JSON.parse(m[0]).empresas || []).map((e) => String(e).trim()).filter(Boolean).slice(0, 25);
} catch (e) { empresas = []; }
if (!n.texto) empresas = [];
return { json: { p: { semana: n.semana, pregunta_id: n.pregunta_id, motor: n.motor, modelo: n.modelo, repeticion: n.repeticion,
  texto: n.texto, fuentes: n.fuentes, empresas, error: n.error } } };
`;

const CONTEXTO = 'El usuario está en Sevilla (España).';
const SISTEMA_EXTRAER = 'Lees la respuesta de un asistente de IA a alguien de España que quiere importar un coche de Alemania. ' +
  'Extrae SOLO las empresas o profesionales que ofrecen al usuario el servicio de importarle o traerle el coche, o de gestionarle la importación o la matriculación ' +
  '(importadores, concesionarios o compraventas que importan, gestorías especializadas, empresas de transporte de coches), en el orden en que aparecen por primera vez. ' +
  'NO incluyas: portales de anuncios (mobile.de, AutoScout24, Coches.net…), organismos o entidades de inspección (DGT, Hacienda, TÜV, DEKRA, ADAC, ITV), ' +
  'aseguradoras, bancos, medios o blogs citados como fuente, ni marcas o modelos de coche. Usa el nombre comercial tal cual aparece. ' +
  'Responde solo con JSON: {"empresas": ["..."]}. Si no hay ninguna: {"empresas": []}.';

const UBICACION_OAI = { type: 'approximate', country: 'ES', city: 'Sevilla', region: 'Andalucía' };
const UBICACION_CLAUDE = { type: 'approximate', country: 'ES', city: 'Sevilla', region: 'Andalucía', timezone: 'Europe/Madrid' };

const lunes = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.3,
  config: { name: 'Cada lunes', parameters: { rule: { interval: [{ field: 'weeks', weeksInterval: 1, triggerAtDay: [1], triggerAtHour: 6, triggerAtMinute: 0 }] } } }
});
const probar = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Probar ahora' } });

const leerPreguntas = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.3,
  config: {
    name: 'Preguntas activas',
    parameters: {
      method: 'POST', url: 'https://lhtequkigdilfldnugco.supabase.co/rest/v1/rpc/ia_preguntas_activas',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '{}', options: { timeout: 30000 }
    },
    credentials: { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 5000
  }
});

const preparar = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Preparar consultas', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: PREPARAR_JS } }
});

const regla = (k) => ({
  outputKey: k,
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: expr('{{ $json.motor }}'), operator: { type: 'string', operation: 'equals' }, rightValue: k }],
    combinator: 'and'
  }
});
const porMotor = switchCase({
  version: 3.2,
  config: { name: 'Según la IA', parameters: { rules: { values: [regla('chatgpt'), regla('claude'), regla('gemini')] } } }
});

const lote = { batch: { batchSize: 1, batchInterval: 1500 } };

const chatgpt = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.3,
  config: {
    name: 'Preguntar a ChatGPT',
    parameters: {
      method: 'POST', url: 'https://api.openai.com/v1/responses',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ model: "gpt-5.4-mini", instructions: ' + JSON.stringify(CONTEXTO) + ', tools: [{ type: "web_search", user_location: ' + JSON.stringify(UBICACION_OAI) + ' }], input: $json.pregunta }) }}'),
      options: { timeout: 240000, ...lote }
    },
    credentials: { openAiApi: { id: 'ExZlZwg98YMMsQeH', name: 'OpenAI Orozco' } },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput'
  }
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.3,
  config: {
    name: 'Preguntar a Claude',
    parameters: {
      method: 'POST', url: 'https://api.anthropic.com/v1/messages',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
      sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 2500, system: ' + JSON.stringify(CONTEXTO) + ', messages: [{ role: "user", content: $json.pregunta }], tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3, user_location: ' + JSON.stringify(UBICACION_CLAUDE) + ' }] }) }}'),
      options: { timeout: 240000, ...lote }
    },
    credentials: { anthropicApi: { id: '8QYoQrbw7qrwAoSI', name: 'Anthropic Orozco' } },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput'
  }
});

const gemini = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.3,
  config: {
    name: 'Preguntar a Gemini',
    parameters: {
      method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi',
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ systemInstruction: { parts: [{ text: ' + JSON.stringify(CONTEXTO) + ' }] }, contents: [{ role: "user", parts: [{ text: $json.pregunta }] }], tools: [{ google_search: {} }] }) }}'),
      options: { timeout: 240000, ...lote }
    },
    credentials: { googlePalmApi: { id: 'UGh4GsTaNVWLiCJy', name: 'Gemini Orozco' } },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput'
  }
});

const normalizar = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Normalizar respuesta', parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: NORMALIZAR_JS } }
});

const extraer = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.3,
  config: {
    name: 'Extraer empresas',
    parameters: {
      method: 'POST', url: 'https://api.anthropic.com/v1/messages',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
      sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
      sendBody: true, contentType: 'json', specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 600, system: ' + JSON.stringify(SISTEMA_EXTRAER) + ', messages: [{ role: "user", content: "Respuesta:\\n\\"\\"\\"\\n" + ($json.texto || "(sin respuesta)") + "\\n\\"\\"\\"" }] }) }}'),
      options: { timeout: 60000, ...lote }
    },
    credentials: { anthropicApi: { id: '8QYoQrbw7qrwAoSI', name: 'Anthropic Orozco' } },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, onError: 'continueRegularOutput'
  }
});

const preparaGuardado = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Preparar guardado', parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: GUARDAR_JS } }
});

const guardar = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.3,
  config: {
    name: 'Guardar en Supabase',
    parameters: {
      method: 'POST', url: 'https://lhtequkigdilfldnugco.supabase.co/rest/v1/rpc/ia_guardar',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ p: $json.p }) }}'),
      options: { timeout: 30000 }
    },
    credentials: { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, onError: 'continueRegularOutput'
  }
});


export default workflow('monitor-ia', 'Monitor de visibilidad en IA')
  .add(lunes).to(leerPreguntas)
  .add(probar).to(leerPreguntas)
  .add(leerPreguntas).to(preparar).to(porMotor
    .onCase(0, chatgpt.to(normalizar))
    .onCase(1, claude.to(normalizar))
    .onCase(2, gemini.to(normalizar)))
  .add(normalizar).to(extraer).to(preparaGuardado).to(guardar);
