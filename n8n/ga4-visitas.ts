import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

// Trae cada 30 minutos las sesiones de GA4 (propiedad 529364740) por día, página de entrada y origen/campaña,
// y las guarda en visitas_diarias para el embudo del panel.
const SUPABASE = 'https://lhtequkigdilfldnugco.supabase.co';
const PROPIEDAD = '529364740';

const CUERPO = {
  dateRanges: [{ startDate: '2026-01-01', endDate: 'today' }],
  dimensions: [{ name: 'date' }, { name: 'landingPage' }, { name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }, { name: 'sessionManualAdContent' }],
  metrics: [{ name: 'sessions' }],
  limit: 100000
};

const MAPEAR_JS = `
const limpia = (v) => (!v || v === '(not set)' || v === '(none)') ? '' : String(v).slice(0, 200);
const acc = {};
for (const it of $input.all()) {
  for (const r of (it.json.rows || [])) {
    const d = r.dimensionValues.map((x) => x.value);
    const fecha = d[0].slice(0, 4) + '-' + d[0].slice(4, 6) + '-' + d[0].slice(6, 8);
    const pagina = (limpia(d[1]) || '/').split('?')[0].slice(0, 300);
    const fila = { fecha, pagina, utm_source: limpia(d[2]), utm_medium: limpia(d[3]), utm_campaign: limpia(d[4]), utm_content: limpia(d[5]), visitas: 0 };
    const k = [fila.fecha, fila.pagina, fila.utm_source, fila.utm_medium, fila.utm_campaign, fila.utm_content].join('|');
    (acc[k] ||= fila).visitas += Number(r.metricValues[0].value || 0);
  }
}
const filas = Object.values(acc);
if (!filas.length) return [];
return [{ json: { total: filas.length, filas } }];
`;

const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Ejecutar ahora', position: [240, 200] }, output: [{}] });
const cada = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.2,
  config: { name: 'Cada 30 minutos', position: [240, 400], parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 30 }] } } },
  output: [{}]
});

const pedir = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Pedir visitas a GA4',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      method: 'POST',
      url: `https://analyticsdata.googleapis.com/v1beta/properties/${PROPIEDAD}:runReport`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleAnalyticsOAuth2',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: JSON.stringify(CUERPO),
      options: { timeout: 60000 }
    },
    credentials: { googleAnalyticsOAuth2: { id: 'bONnRMYrWIaa3ipS', name: 'GA4 Orozco' } }
  },
  output: [{ rows: [] }]
});

const mapear = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar filas', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: MAPEAR_JS } },
  output: [{ total: 0, filas: [] }]
});

const guardar = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Guardar en visitas_diarias',
    parameters: {
      method: 'POST',
      url: `${SUPABASE}/rest/v1/visitas_diarias`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Prefer', value: 'resolution=merge-duplicates,return=minimal' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.filas) }}'),
      options: { timeout: 60000 }
    },
    credentials: { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } }
  },
  output: [{}]
});

const nota = sticky('## GA4 → panel\nCada 30 minutos trae las sesiones de GA4 por día, página de entrada y origen/campaña (desde enero de 2026) y las guarda en **visitas_diarias**. Solo lee.', [manual, cada], { color: 4 });

export default workflow('ga4-visitas', 'GA4 → panel (visitas cada 30 min)')
  .add(manual).to(pedir)
  .add(cada).to(pedir)
  .add(pedir).to(mapear).to(guardar)
  .add(nota);
