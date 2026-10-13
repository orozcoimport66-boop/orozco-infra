import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

// Red de seguridad del Lab: cada noche busca cambios en Google Ads (historial de cambios) y commits de la web
// de los últimos 3 días. Si ese día no hay ya una entrada en el Lab para esa área, crea una "por clasificar"
// y deja a Javi una tarea para clasificarla. Solo lee Google Ads y GitHub; no cambia nada en ellos.
const SUPABASE = 'https://lhtequkigdilfldnugco.supabase.co';
const CUENTA = '8433514574';
const VERSION = 'v24';
const REPO = 'orozcoimport66-boop/orozco-infra';

const ADS_BODY = `{{ JSON.stringify({ query: "SELECT change_event.change_date_time, change_event.change_resource_type, change_event.resource_change_operation, change_event.changed_fields, change_event.user_email, change_event.client_type, campaign.name FROM change_event WHERE change_event.change_date_time >= '" + $now.setZone('Europe/Madrid').minus({ days: 3 }).toFormat('yyyy-MM-dd') + "' AND change_event.change_date_time <= '" + $now.setZone('Europe/Madrid').plus({ days: 1 }).toFormat('yyyy-MM-dd') + "' ORDER BY change_event.change_date_time DESC LIMIT 1000" }) }}`;

const AGRUPAR_ADS_JS = `
// Un registro por día (todas las campañas juntas): así un mismo día de cambios no se parte en varias entradas
const TIPOS = { CAMPAIGN: 'Campaña', AD_GROUP: 'Grupo', AD_GROUP_AD: 'Anuncio', AD_GROUP_CRITERION: 'Keyword/segmentación', CAMPAIGN_CRITERION: 'Segmentación de campaña', CAMPAIGN_BUDGET: 'Presupuesto', AD: 'Anuncio', ASSET: 'Recurso', CUSTOMER_ASSET: 'Recurso de cuenta', CAMPAIGN_ASSET: 'Recurso de campaña', AD_GROUP_ASSET: 'Recurso de grupo', SHARED_SET: 'Lista compartida', CAMPAIGN_SHARED_SET: 'Lista compartida de campaña' };
const OPS = { CREATE: 'creado', UPDATE: 'modificado', REMOVE: 'eliminado' };
const grupos = {};
for (const it of $input.all()) {
  for (const r of (it.json.results || [])) {
    const ce = r.changeEvent || {};
    const fecha = String(ce.changeDateTime || '').slice(0, 10);
    if (!fecha) continue;
    const camp = (r.campaign && r.campaign.name) || 'cuenta';
    const g = grupos[fecha] || (grupos[fecha] = { fecha, camps: new Set(), lineas: [] });
    g.camps.add(camp);
    const campos = String(ce.changedFields || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4).join(', ');
    g.lineas.push(String(ce.changeDateTime).slice(11, 16) + ' · ' + camp + ' · ' + (TIPOS[ce.changeResourceType] || ce.changeResourceType || '?') + ' ' + (OPS[ce.resourceChangeOperation] || '') + (campos ? ': ' + campos : '') + (ce.userEmail ? ' · ' + ce.userEmail : ''));
  }
}
return Object.values(grupos).map((g) => ({ json: {
  p_origen: 'ads', p_fecha: g.fecha, p_ref: 'ads:' + g.fecha,
  p_titulo: 'Cambios en Google Ads (' + g.lineas.length + '): ' + Array.from(g.camps).join(', '),
  p_detalle: 'Detectado automáticamente en el historial de cambios de Google Ads:\\n' + g.lineas.slice(0, 40).join('\\n'),
  p_enlace: 'https://ads.google.com/aw/changehistory'
} }));
`;

const AGRUPAR_GIT_JS = `
const grupos = {};
for (const it of $input.all()) {
  const c = it.json;
  if (!c || !c.sha || !c.commit) continue;
  const fecha = new Date(c.commit.committer.date).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  const msg = String(c.commit.message || '').split('\\n')[0];
  const g = grupos[fecha] || (grupos[fecha] = { fecha, msgs: [] });
  g.msgs.push(msg);
}
return Object.values(grupos).map((g) => ({ json: {
  p_origen: 'git', p_fecha: g.fecha, p_ref: 'git:' + g.fecha,
  p_titulo: 'Cambios en la web (' + g.msgs.length + '): ' + g.msgs[g.msgs.length - 1].slice(0, 90),
  p_detalle: 'Detectado automáticamente en los commits de la web:\\n' + g.msgs.map((m) => '· ' + m).join('\\n'),
  p_enlace: 'https://github.com/${REPO}/commits/main/sites/orozcoimport.es'
} }));
`;

const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Ejecutar ahora', position: [240, 200] }, output: [{}] });
const noche = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.2,
  config: { name: 'Cada noche 23:30', position: [240, 420], parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 23, triggerAtMinute: 30 }] } } },
  output: [{}]
});

const pedirAds = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Historial de cambios de Google Ads',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      method: 'POST',
      url: `https://googleads.googleapis.com/${VERSION}/customers/${CUENTA}/googleAds:search`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleAdsOAuth2Api',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr(ADS_BODY),
      options: { timeout: 60000 }
    },
    credentials: { googleAdsOAuth2Api: { id: 'vL68DJsWa5csHHKF', name: 'Google Ads Orozco' } }
  },
  output: [{ results: [] }]
});

const agruparAds = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Agrupar cambios de Ads por día', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: AGRUPAR_ADS_JS } },
  output: [{ p_origen: 'ads', p_fecha: '2026-10-13', p_ref: 'ads:2026-10-13:X', p_titulo: '', p_detalle: '', p_enlace: '' }]
});

const pedirGit = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Commits de la web',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      method: 'GET',
      url: `https://api.github.com/repos/${REPO}/commits`,
      sendQuery: true,
      queryParameters: { parameters: [
        { name: 'path', value: 'sites/orozcoimport.es' },
        { name: 'per_page', value: '100' },
        { name: 'since', value: expr("{{ $now.minus({ days: 3 }).toUTC().toISO() }}") }
      ] },
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'User-Agent', value: 'orozco-n8n' }, { name: 'Accept', value: 'application/vnd.github+json' }] },
      options: { timeout: 30000 }
    }
  },
  output: [{ sha: 'abc', commit: { message: 'x', committer: { date: '2026-10-13T10:00:00Z' } } }]
});

const agruparGit = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Agrupar commits por día', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: AGRUPAR_GIT_JS } },
  output: [{ p_origen: 'git', p_fecha: '2026-10-13', p_ref: 'git:2026-10-13', p_titulo: '', p_detalle: '', p_enlace: '' }]
});

const registrarAds = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Registrar cambios de Ads en el Lab',
    parameters: {
      method: 'POST',
      url: `${SUPABASE}/rest/v1/rpc/lab_detectar`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_origen: $json.p_origen, p_fecha: $json.p_fecha, p_ref: $json.p_ref, p_titulo: $json.p_titulo, p_detalle: $json.p_detalle, p_enlace: $json.p_enlace }) }}'),
      options: { timeout: 30000 }
    },
    credentials: { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } }
  },
  output: [{}]
});

const registrarGit = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Registrar cambios de la web en el Lab',
    parameters: {
      method: 'POST',
      url: `${SUPABASE}/rest/v1/rpc/lab_detectar`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_origen: $json.p_origen, p_fecha: $json.p_fecha, p_ref: $json.p_ref, p_titulo: $json.p_titulo, p_detalle: $json.p_detalle, p_enlace: $json.p_enlace }) }}'),
      options: { timeout: 30000 }
    },
    credentials: { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } }
  },
  output: [{}]
});

const nota = sticky('## Red de seguridad del Lab\nCada noche revisa el **historial de cambios de Google Ads** y los **commits de la web** (últimos 3 días). Si ese día no hay ya una entrada del Lab en esa área, crea una **por clasificar** y una tarea en la agenda de Javi. Solo lee; no toca campañas ni web.', [manual, noche], { color: 4 });

export default workflow('lab-red-seguridad', 'Lab → red de seguridad (cambios sin registrar)')
  .add(manual).to(pedirAds)
  .add(noche).to(pedirAds)
  .add(manual).to(pedirGit)
  .add(noche).to(pedirGit)
  .add(pedirAds).to(agruparAds).to(registrarAds)
  .add(pedirGit).to(agruparGit).to(registrarGit)
  .add(nota);
