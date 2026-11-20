import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

// LAN-21 (20/11/2026). Setting por llamada de Fran: automatismos.
// 1) Grabaciones de las llamadas: el panel sube el audio al bucket privado «llamadas» y lo apunta en setting_llamadas.
//    Aquí se firma un enlace de 1 hora y se manda a Fireflies (uploadAudio) con «Setting #código» en el título.
//    OJO: este archivo es la primera versión. En n8n (workflow TNBj88fdzs6zd2ae) se añadió después el interruptor
//    ajustes.setting_transcripcion: con «openai» (por defecto, Fireflies uploadAudio pide plan Pro) el audio se descarga,
//    se transcribe con OpenAI gpt-4o-transcribe, Claude saca los 10 datos y rpc setting_transcripcion_guardar los guarda.
//    La versión publicada en n8n es la buena.
// 2) WhatsApp automáticos de la cola setting_mensajes: «te he intentado llamar», recordatorio 1 h antes de la videollamada
//    y repesca (OPT-34). Dentro de las 24 h, texto libre. Fuera, plantilla aprobada. Si no hay plantilla, borrador para Fran.

const SB = { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } };
const URL_SB = 'https://lhtequkigdilfldnugco.supabase.co';

const cadaMinutoA = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Cada minuto (grabaciones)', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } } } });
const cadaMinutoB = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Cada minuto (WhatsApp)', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } } } });

const grabaciones = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.2,
  config: {
    name: 'Grabaciones pendientes (Supabase)',
    parameters: { method: 'POST', url: URL_SB + '/rest/v1/rpc/setting_grabaciones_reclamar', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '{}', options: { timeout: 20000 } },
    credentials: SB
  },
  output: [{ id: 5, ruta: 'lead/123.wav', titulo: 'Setting #1ce361ab Prueba', inicio: '2026-11-20T13:54:38Z' }]
});

const firmar = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.2,
  config: {
    name: 'Enlace firmado de 1 hora',
    onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: expr("{{ 'https://lhtequkigdilfldnugco.supabase.co/storage/v1/object/sign/llamadas/' + $json.ruta }}"),
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '{"expiresIn":3600}',
      options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } } },
    credentials: SB
  },
  output: [{ statusCode: 200, body: { signedURL: '/object/sign/llamadas/lead/123.wav?token=abc' } }]
});

const PREP_FF = `
const g = $('Grabaciones pendientes (Supabase)').item.json;
const r = $json || {};
const s = (r.body && (r.body.signedURL || r.body.signedUrl)) || '';
const url = s ? (s.startsWith('http') ? s : 'https://lhtequkigdilfldnugco.supabase.co/storage/v1' + s) : '';
const fecha = new Date(g.inicio || Date.now()).toISOString().replace(/\\.\\d+Z$/, 'Z');
const query = 'mutation($input: AudioUploadInput) { uploadAudio(input: $input) { success title message } }';
const variables = { input: { url, title: g.titulo, webhook: 'https://n8n.orozcoimport.es/webhook/fireflies-llamadas', custom_language: 'es',
  bypass_size_check: true, client_reference_id: 'setting-' + g.id, meeting_date: fecha } };
return { json: { id: g.id, url, error_firma: url ? null : ('firma ' + (r.statusCode || '') + ' ' + JSON.stringify(r.body || {}).slice(0, 200)), peticion: { query, variables } } };
`;
const prepFireflies = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar subida a Fireflies', parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: PREP_FF } }, output: [{ id: 5, url: 'https://x', peticion: {} }] });

const subirFireflies = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.2,
  config: {
    name: 'Subir a Fireflies (uploadAudio)',
    onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: 'https://api.fireflies.ai/graphql', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.peticion) }}'),
      options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } } },
    credentials: { httpHeaderAuth: { id: 'HDc7kYZiYc2FfVox', name: 'Fireflies Orozco' } }
  },
  output: [{ statusCode: 200, body: { data: { uploadAudio: { success: true } } } }]
});

const EVAL_FF = `
const p = $('Preparar subida a Fireflies').item.json;
const r = $json || {};
const b = r.body || {};
const ok = !p.error_firma && !!(b.data && b.data.uploadAudio && b.data.uploadAudio.success);
const err = p.error_firma || (b.errors ? JSON.stringify(b.errors).slice(0, 400) : (ok ? null : 'http ' + r.statusCode));
return { json: { p_id: p.id, p_ok: ok, p_error: err } };
`;
const evalFireflies = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Evaluar subida', parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: EVAL_FF } }, output: [{ p_id: 5, p_ok: true, p_error: null }] });

const apuntarGrab = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.2,
  config: {
    name: 'Apuntar grabación (Supabase)',
    retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
    parameters: { method: 'POST', url: URL_SB + '/rest/v1/rpc/setting_grabacion_resultado', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json) }}'), options: { timeout: 20000 } },
    credentials: SB
  },
  output: [{}]
});

const mensajes = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.2,
  config: {
    name: 'WhatsApp pendientes (Supabase)',
    parameters: { method: 'POST', url: URL_SB + '/rest/v1/rpc/setting_mensajes_reclamar', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '{}', options: { timeout: 20000 } },
    credentials: SB
  },
  output: [{ id: 1, tipo: 'intento_llamada', lead_id: 'x', nombre: 'Ana', telefono: '34600000000', dentro_24h: false, texto: 'Hola Ana, te he intentado llamar, cuándo te viene bien que hablemos?', plantilla: 'intento_llamada', variables: ['Ana'] }]
});

const MONTAR = `
const m = $json;
let tel = String(m.telefono || '').replace(/\\D/g, '');
if (tel.startsWith('00')) tel = tel.slice(2);
if (/^[6789]\\d{8}$/.test(tel)) tel = '34' + tel;
const enviar = !!tel && (m.dentro_24h === true || !!m.plantilla);
const payload360 = m.dentro_24h === true || !m.plantilla
  ? { messaging_product: 'whatsapp', recipient_type: 'individual', to: tel, type: 'text', text: { body: m.texto, preview_url: true } }
  : { messaging_product: 'whatsapp', recipient_type: 'individual', to: tel, type: 'template',
      template: { name: m.plantilla, language: { code: 'es' }, components: [{ type: 'body', parameters: (m.variables || []).map(v => ({ type: 'text', text: String(v) })) }] } };
return { json: { ...m, telefono: tel, enviar, plantilla_usada: m.dentro_24h === true ? null : (m.plantilla || null), payload360 } };
`;
const montar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Montar WhatsApp', parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: MONTAR } }, output: [{ id: 1, enviar: true, payload360: {} }] });

const seEnvia = ifElse({
  version: 2.2,
  config: { name: '¿Se puede enviar?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: expr('{{ $json.enviar }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } }
});

const enviar360 = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.2,
  config: {
    name: 'Enviar por WhatsApp (360dialog)',
    onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: 'https://waba-v2.360dialog.io/messages', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.payload360) }}'),
      options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } } },
    credentials: { httpHeaderAuth: { id: '2ZJyODPumg4VWDpC', name: '360dialog Orozco' } }
  },
  output: [{ statusCode: 200, body: { messages: [{ id: 'wamid.x' }] } }]
});

const EVAL_WA = `
const m = $('Montar WhatsApp').item.json;
const r = $json || {};
const b = (r.body && typeof r.body === 'object') ? r.body : {};
const wamid = b.messages && b.messages[0] && b.messages[0].id;
const ok = r.statusCode >= 200 && r.statusCode < 300 && !!wamid;
let error = null;
if (!ok) { const e = b.error || (b.errors && b.errors[0]) || {}; error = 'http_' + r.statusCode + (e.code ? ':' + e.code : '') + (e.message || e.title ? ' ' + String(e.message || e.title).slice(0, 200) : ''); }
return { json: { p: { id: m.id, ok, wamid: wamid ? String(wamid) : null, error, texto: m.texto, plantilla: m.plantilla_usada } } };
`;
const evalWa = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Evaluar envío', parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: EVAL_WA } }, output: [{ p: {} }] });

const SIN = `
const m = $json;
return { json: { p: { id: m.id, ok: false, error: m.telefono ? 'sin_plantilla' : 'sin_telefono', texto: m.texto } } };
`;
const sinPlantilla = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Sin plantilla: borrador para Fran', parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: SIN } }, output: [{ p: {} }] });

const apuntarWa = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.2,
  config: {
    name: 'Apuntar en el panel (Supabase)',
    retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
    parameters: { method: 'POST', url: URL_SB + '/rest/v1/rpc/setting_mensaje_resultado', authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ p: $json.p }) }}'), options: { timeout: 20000 } },
    credentials: SB
  },
  output: [{ ok: true }]
});

export default workflow('setting-automatismos', 'Setting · Grabaciones a Fireflies y WhatsApp automáticos (LAN-21)')
  .add(cadaMinutoA).to(grabaciones).to(firmar).to(prepFireflies).to(subirFireflies).to(evalFireflies).to(apuntarGrab)
  .add(cadaMinutoB).to(mensajes).to(montar).to(seEnvia.onTrue(enviar360.to(evalWa.to(apuntarWa))).onFalse(sinPlantilla.to(apuntarWa)));
