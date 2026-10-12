import { workflow, node, trigger, sticky, ifElse, expr } from '@n8n/workflow-sdk';

const NORMALIZAR_JS = `
const b = $json.body || $json;
const h = $json.headers || {};
const t = (v) => (v === undefined || v === null) ? '' : String(v).trim();
const cut = (s, n) => s.length > n ? s.slice(0, n) : s;

const nombre = cut(t(b.name || b.nombre), 120);
const email = cut(t(b.email).toLowerCase(), 200);
const telOriginal = cut(t(b.phone || b.telefono), 40);
let tel = telOriginal.replace(/[^0-9+]/g, '');
if (tel.indexOf('00') === 0) tel = '+' + tel.slice(2);
if (/^[6789][0-9]{8}$/.test(tel)) tel = '+34' + tel;
else if (/^34[6789][0-9]{8}$/.test(tel)) tel = '+' + tel;

const cp = cut(t(b.postal || b.codigo_postal).replace(/[^0-9]/g, ''), 5);
const situacion = cut(t(b.stage || b.situacion), 120);
const modelo = cut(t(b.vehicle || b.modelo), 500);
const presupuesto = cut(t(b.budget || b.presupuesto), 60);
const urlAnuncio = cut(t(b.link || b.url_anuncio), 500);
const mensaje = cut(t(b.message || b.mensaje), 4000);
const utmSource = cut(t(b.utm_source), 100);
const utmMedium = cut(t(b.utm_medium), 100);
const utmCampaign = cut(t(b.utm_campaign), 150);
const utmContent = cut(t(b.utm_content), 150);
const utmTerm = cut(t(b.utm_term), 150);
const gclid = cut(t(b.gclid), 300);
const fbclid = cut(t(b.fbclid), 300);
const experimento = cut(t(b.experimento), 60);
const pagina = cut(t(b.pagina || h.referer || h.origin), 300);
const honeypot = t(b.website);

const src = utmSource.toLowerCase();
const med = utmMedium.toLowerCase();
let canal = 'Directo';
if (med === 'cpc' || gclid) canal = 'Google Ads';
else if (med === 'paid_social' || fbclid) canal = 'Meta Ads';
else if (src === 'instagram') canal = 'Instagram';
else if (src === 'tiktok') canal = 'TikTok';
else if (src === 'facebook' || src === 'meta') canal = 'Meta Ads';
else if (med === 'organic') canal = 'Google Orgánico';

const emailOk = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email);
const telOk = /^\\+?[0-9]{9,15}$/.test(tel);
const valido = !honeypot && nombre.length > 0 && (emailOk || telOk);
const motivo = honeypot ? 'spam' : (!nombre ? 'sin nombre' : (!(emailOk || telOk) ? 'sin email ni teléfono válidos' : ''));

const rt = (s) => ({ rich_text: s ? [{ type: 'text', text: { content: cut(s, 1990) } }] : [] });
const notion = {
  'Nombre': { title: [{ type: 'text', text: { content: nombre || 'Sin nombre' } }] },
  'Email': rt(emailOk ? email : ''),
  'Telefono': { phone_number: telOk ? tel : (telOriginal || null) },
  'Situación': rt(situacion),
  'Modelo': rt(modelo),
  'Rango de Presupuesto': rt(presupuesto),
  'URL del Anuncio': rt(urlAnuncio),
  'Notas': rt(mensaje),
  'Canal': rt(canal),
  'UTM Source': rt(utmSource),
  'UTM Medium': rt(utmMedium),
  'UTM Campaign': rt(utmCampaign),
  'UTM Content': rt(utmContent),
  'Experimento': rt(experimento)
};
if (cp) notion['Código Postal'] = { number: Number(cp) };

const ORIGEN = ['Canal', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Content', 'Experimento'];
const notionUpdate = {};
Object.keys(notion).forEach((k) => {
  if (ORIGEN.indexOf(k) !== -1) return;
  const v = notion[k];
  const vacio = (v.rich_text && v.rich_text.length === 0) || v.phone_number === null;
  if (!vacio) notionUpdate[k] = v;
});

const notionFiltro = { or: [] };
if (emailOk) notionFiltro.or.push({ property: 'Email', rich_text: { equals: email } });
if (telOk) notionFiltro.or.push({ property: 'Telefono', phone_number: { equals: tel } });
if (telOriginal && telOriginal !== tel) notionFiltro.or.push({ property: 'Telefono', phone_number: { equals: telOriginal } });

const brevo = {
  email: email,
  listIds: [8],
  updateEnabled: true,
  attributes: {
    NOMBRE: nombre, TELEFONO: tel || telOriginal, CODIGO_POSTAL: cp, PERFIL: situacion,
    VEHICULO: modelo, PRESUPUESTO: presupuesto, LINK_ANUNCIO: urlAnuncio, MENSAJE: cut(mensaje, 1000),
    CANAL: canal, UTM_SOURCE: utmSource, UTM_MEDIUM: utmMedium, UTM_CAMPAIGN: utmCampaign, UTM_CONTENT: utmContent
  }
};

const supabase = {
  nombre, email: emailOk ? email : '', telefono: telOk ? tel : telOriginal, codigo_postal: cp, situacion, modelo,
  presupuesto, url_anuncio: urlAnuncio, mensaje, canal, utm_source: utmSource, utm_medium: utmMedium,
  utm_campaign: utmCampaign, utm_content: utmContent, utm_term: utmTerm, gclid, fbclid,
  pagina_origen: pagina, experimento
};

const primerNombre = nombre.split(' ')[0] || '';
const textoWa = 'Hola ' + primerNombre + ', soy Fran de Orozco Import. Acabo de recibir tu solicitud' +
  (modelo ? ' sobre ' + cut(modelo, 80) : '') + '. ¿Te viene bien que te llame unos minutos para verlo juntos?';
const whatsapp = telOk ? 'https://wa.me/' + tel.replace('+', '') + '?text=' + encodeURIComponent(textoWa) : '';

return { json: { valido, motivo, nombre, email, emailOk, tel, telOk, telOriginal, canal, modelo, presupuesto,
  situacion, mensaje, urlAnuncio, utmCampaign, pagina, gclid: gclid ? 'sí' : 'no', whatsapp,
  supabase, notion, notionUpdate, notionFiltro, brevo } };
`;

const EMAIL_JS = `
const n = $('Normalizar lead').item.json;
const r = $('Guardar en Supabase').item.json || {};
const nuevo = r.nuevo !== false;
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fila = (k, v) => v ? '<tr><td style="padding:6px 12px 6px 0;color:#64748B;white-space:nowrap;vertical-align:top">' + k + '</td><td style="padding:6px 0;color:#0F172A">' + esc(v).replace(/\\n/g, '<br>') + '</td></tr>' : '';
const btn = (href, txt, color) => href ? '<a href="' + href + '" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border-radius:8px;background:' + color + ';color:#fff;text-decoration:none;font-weight:600">' + txt + '</a>' : '';
const html = '<div style="font-family:Arial,sans-serif;max-width:560px">' +
  '<h2 style="color:#0F172A;margin:0 0 4px">' + (nuevo ? 'Nuevo lead' : 'Lead que vuelve a escribir') + ': ' + esc(n.nombre) + '</h2>' +
  '<p style="color:#64748B;margin:0 0 16px">' + esc(n.canal) + (n.utmCampaign ? ' · ' + esc(n.utmCampaign) : '') + '</p>' +
  btn(r.id ? 'https://panel.orozcoimport.es/#/hoy?lead=' + r.id : '', 'Abrir en el panel', '#0F172A') + btn(n.telOk ? 'tel:' + n.tel : '', 'Llamar', '#2563EB') + btn(n.whatsapp, 'WhatsApp', '#16A34A') +
  '<table style="border-collapse:collapse;margin-top:12px;font-size:14px">' +
  fila('Teléfono', n.tel || n.telOriginal) + fila('Email', n.email) + fila('En qué punto está', n.situacion) +
  fila('Coche', n.modelo) + fila('Presupuesto', n.presupuesto) + fila('Anuncio', n.urlAnuncio) + fila('Mensaje', n.mensaje) +
  fila('Página', n.pagina) + fila('gclid', n.gclid) + '</table></div>';
return { json: {
  sender: { name: 'Orozco Import Leads', email: 'orozcoimport66@gmail.com' },
  to: [{ email: 'orozcoimport66@gmail.com' }],
  replyTo: n.emailOk ? { email: n.email, name: n.nombre } : { email: 'orozcoimport66@gmail.com' },
  subject: (nuevo ? '🔥NUEVO LEAD🔥 ' : '🔁 Vuelve a escribir: ') + n.nombre + (n.modelo ? ' · ' + n.modelo.slice(0, 40) : ''),
  htmlContent: html
} };
`;

const SUPABASE = 'https://lhtequkigdilfldnugco.supabase.co';
const NOTION_DB = '35df9751-4dd0-80ee-b9ad-cd4529f95d02';

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.2,
  config: {
    name: 'Formulario web',
    parameters: {
      httpMethod: 'POST',
      path: 'captacion',
      responseMode: 'responseNode',
      options: {
        allowedOrigins: 'https://orozcoimport.es,https://www.orozcoimport.es,https://pre.orozcoimport.es',
        ignoreBots: true
      }
    }
  },
  output: [{ headers: { referer: 'https://orozcoimport.es/landing/' }, body: { name: 'Ana Prueba', phone: '600 111 222', email: 'ana@example.com', postal: '41001', stage: 'Sé exactamente qué coche quiero', vehicle: 'BMW 320d', budget: '25.000€ — 30.000€', message: '', link: '', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'sem_may_26', utm_content: '', gclid: 'abc' } }]
});

const normalizar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Normalizar lead', parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: NORMALIZAR_JS } },
  output: [{ valido: true, motivo: '', nombre: 'Ana Prueba', email: 'ana@example.com', emailOk: true, tel: '+34600111222', telOk: true, telOriginal: '600 111 222', canal: 'Google Ads', modelo: 'BMW 320d', presupuesto: '25.000€ — 30.000€', situacion: 'Sé exactamente qué coche quiero', mensaje: '', urlAnuncio: '', utmCampaign: 'sem_may_26', pagina: 'https://orozcoimport.es/landing/', gclid: 'sí', whatsapp: 'https://wa.me/34600111222', supabase: { nombre: 'Ana Prueba' }, notion: {}, notionFiltro: { or: [] }, brevo: { email: 'ana@example.com' } }]
});

const esValido = ifElse({
  version: 2.3,
  config: {
    name: '¿Datos válidos?',
    parameters: {
      conditions: {
        combinator: 'and',
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.valido }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }]
      }
    }
  }
});

const guardarSupabase = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Guardar en Supabase',
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    parameters: {
      method: 'POST',
      url: `${SUPABASE}/rest/v1/rpc/registrar_lead`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p: $json.supabase }) }}'),
      options: { timeout: 15000 }
    },
    credentials: { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } }
  },
  output: [{ id: '00000000-0000-0000-0000-000000000000', nuevo: true }]
});

const responderOk = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Responder OK',
    parameters: { respondWith: 'json', responseBody: '{"ok":true}', options: { responseCode: 200 } }
  },
  output: [{ id: '00000000-0000-0000-0000-000000000000', nuevo: true }]
});

const responderError = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Responder error',
    parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify({ ok: false, motivo: $json.motivo }) }}'), options: { responseCode: 400 } }
  }
});

const brevoContacto = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Contacto en Brevo',
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: 'POST',
      url: 'https://api.brevo.com/v3/contacts',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'sendInBlueApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify($('Normalizar lead').item.json.brevo) }}"),
      options: { timeout: 15000 }
    },
    credentials: { sendInBlueApi: { id: 'atf70WrWVultMUsY', name: 'Brevo account' } }
  },
  output: [{ id: 123 }]
});

const prepararEmail = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar aviso', parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: EMAIL_JS } },
  output: [{ subject: '🔥NUEVO LEAD🔥 Ana Prueba', htmlContent: '<p>...</p>' }]
});

const enviarAviso = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Enviar aviso a Fran',
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: 'POST',
      url: 'https://api.brevo.com/v3/smtp/email',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'sendInBlueApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json) }}'),
      options: { timeout: 15000 }
    },
    credentials: { sendInBlueApi: { id: 'atf70WrWVultMUsY', name: 'Brevo account' } }
  },
  output: [{ messageId: '<abc@smtp-relay.brevo.com>' }]
});

const buscarNotion = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Buscar en Notion',
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: 'POST',
      url: `https://api.notion.com/v1/databases/${NOTION_DB}/query`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'notionApi',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ page_size: 1, filter: $('Normalizar lead').item.json.notionFiltro }) }}"),
      options: { timeout: 15000 }
    },
    credentials: { notionApi: { id: '6eiqjvgfITkHEx5s', name: 'Notion account' } }
  },
  output: [{ object: 'list', results: [] }]
});

const existeEnNotion = ifElse({
  version: 2.3,
  config: {
    name: '¿Ya está en Notion?',
    parameters: {
      conditions: {
        combinator: 'and',
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr('{{ ($json.results || []).length }}'), rightValue: 0, operator: { type: 'number', operation: 'gt' } }]
      }
    }
  }
});

const actualizarNotion = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Actualizar ficha Notion',
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: 'PATCH',
      url: expr('https://api.notion.com/v1/pages/{{ $json.results[0].id }}'),
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'notionApi',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ properties: $('Normalizar lead').item.json.notionUpdate }) }}"),
      options: { timeout: 15000 }
    },
    credentials: { notionApi: { id: '6eiqjvgfITkHEx5s', name: 'Notion account' } }
  },
  output: [{ object: 'page', id: 'pagina-existente' }]
});

const crearNotion = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Crear ficha Notion',
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: 'POST',
      url: 'https://api.notion.com/v1/pages',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'notionApi',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Notion-Version', value: '2022-06-28' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ parent: { database_id: '" + NOTION_DB + "' }, properties: Object.assign({}, $('Normalizar lead').item.json.notion, { 'Estado': { status: { name: 'Nuevo Lead' } }, 'Fecha de Entrada': { date: { start: $now.setZone('Europe/Madrid').toISODate() } } }) }) }}"),
      options: { timeout: 15000 }
    },
    credentials: { notionApi: { id: '6eiqjvgfITkHEx5s', name: 'Notion account' } }
  },
  output: [{ object: 'page', id: 'pagina-nueva' }]
});

const vincularNotion = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Vincular ficha en Supabase',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: `${SUPABASE}/rest/v1/rpc/vincular_notion`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ p_lead: $('Guardar en Supabase').item.json.id, p_page: $json.id }) }}"),
      options: { timeout: 15000 }
    },
    credentials: { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } }
  },
  output: [{}]
});

const esNuevo = ifElse({
  version: 2.3,
  config: {
    name: '¿Lead nuevo?',
    parameters: {
      conditions: {
        combinator: 'and',
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr("{{ $('Guardar en Supabase').item.json.nuevo === true }}"), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }]
      }
    }
  }
});

// Prepara el mensaje de primer contacto con IA (subflujo «IA · Generar mensaje de primer contacto»)
const mensajeIA = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Preparar mensaje IA',
    onError: 'continueRegularOutput',
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: 'Kr7sYCIgRhWHuEkv' },
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: { lead_id: expr("{{ $('Guardar en Supabase').item.json.id }}") },
        matchingColumns: [],
        schema: [{ id: 'lead_id', displayName: 'lead_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }],
        attemptToConvertTypes: false
      },
      options: { waitForSubWorkflow: false }
    }
  },
  output: [{}]
});

const nota = sticky('## Captación de leads\nFormulario web → validar → **Supabase** (fuente de verdad) → responder a la web → en paralelo: **Brevo** (lista 8), **Notion** (crear/actualizar por email o teléfono) y **aviso por email** a Fran.\nEl estado de una ficha existente en Notion no se toca.', [webhook, normalizar], { color: 5 });

export default workflow('captacion', 'Captación de leads (web)')
  .add(webhook)
  .to(normalizar)
  .to(esValido
    .onTrue(guardarSupabase.to(responderOk))
    .onFalse(responderError))
  .add(responderOk)
  .to(brevoContacto)
  .add(responderOk)
  .to(prepararEmail.to(enviarAviso))
  .add(responderOk)
  .to(esNuevo.onTrue(mensajeIA))
  .add(responderOk)
  .to(buscarNotion.to(existeEnNotion
    .onTrue(actualizarNotion.to(vincularNotion))
    .onFalse(crearNotion.to(vincularNotion))))
  .add(nota)
  .group('Validación', [normalizar], { description: 'Limpia los datos del formulario, calcula el canal y descarta spam o envíos sin contacto' })
  .group('Notion', [buscarNotion, existeEnNotion, actualizarNotion, crearNotion, vincularNotion], { description: 'Crea o actualiza la ficha del Pipeline (sin tocar el estado) y guarda su id en Supabase' });
