import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

// Trae cada mañana impresiones, clics, coste y conversiones por campaña y día de Google Ads
// (cuenta 843-351-4574, acceso directo) y los guarda en ads_diario para el panel de marketing.
const SUPABASE = 'https://lhtequkigdilfldnugco.supabase.co';
const CUENTA = '8433514574';
const VERSION = 'v24';
const DESDE = '2026-01-01';

const QUERY = `SELECT segments.date, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${DESDE}' AND (hoy, se calcula en n8n) AND metrics.impressions > 0`;

const MAPEAR_JS = `
// EXP1 fue el 50 % de SEM_MAY_26: misma campaña, contenido exp1_formulario_hero. El «anuncio» = utm_content de cada campaña.
const normaliza = (nombre) => {
  const n = String(nombre || '');
  if (/^SEM_MAY_26 EXP1/i.test(n)) return { campana: 'SEM_MAY_26', anuncio: 'exp1_formulario_hero' };
  if (/^SEM_MAY_26$/i.test(n)) return { campana: 'SEM_MAY_26', anuncio: 'anuncio_general' };
  if (/^GTI_SEP_26$/i.test(n)) return { campana: 'GTI_SEP_26', anuncio: 'anuncio_gti' };
  return { campana: n, anuncio: '' };
};
const filas = [];
const ahora = new Date().toISOString();
for (const it of $input.all()) {
  for (const r of (it.json.results || [])) {
    const c = normaliza(r.campaign.name);
    filas.push({
      fecha: r.segments.date,
      plataforma: 'google',
      campana_id: String(r.campaign.id),
      campana: c.campana,
      grupo: '',
      anuncio: c.anuncio,
      impresiones: Number(r.metrics.impressions || 0),
      clics: Number(r.metrics.clicks || 0),
      coste: Math.round(Number(r.metrics.costMicros || 0) / 10000) / 100,
      conversiones: Number(r.metrics.conversions || 0),
      actualizado: ahora
    });
  }
}
if (!filas.length) return [];
return [{ json: { total: filas.length, filas } }];
`;

const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Ejecutar ahora', position: [240, 200] }, output: [{}] });
const diario = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.2,
  config: { name: 'Cada 30 minutos', position: [240, 400], parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 30 }] } } },
  output: [{}]
});

const pedir = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Pedir datos a Google Ads',
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
      jsonBody: JSON.stringify({ query: QUERY }),
      options: {
        timeout: 60000,
        pagination: {
          pagination: {
            paginationMode: 'updateAParameterInEachRequest',
            parameters: { parameters: [{ type: 'body', name: 'pageToken', value: expr('{{ $response.body.nextPageToken }}') }] },
            paginationCompleteWhen: 'other',
            completeExpression: expr('{{ !$response.body.nextPageToken }}'),
            limitPagesFetched: true,
            maxRequests: 20
          }
        }
      }
    },
    credentials: { googleAdsOAuth2Api: { id: 'vL68DJsWa5csHHKF', name: 'Google Ads Orozco' } }
  },
  output: [{ results: [] }]
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
    name: 'Guardar en ads_diario',
    parameters: {
      method: 'POST',
      url: `${SUPABASE}/rest/v1/ads_diario`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Prefer', value: 'resolution=merge-duplicates,return=minimal' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.filas) }}'),
      options: { timeout: 30000 }
    },
    credentials: { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } }
  },
  output: [{}]
});

const nota = sticky('## Google Ads → panel\nCada mañana trae impresiones, clics, coste y conversiones por campaña y día (desde enero de 2026) y los guarda en **ads_diario**. Repetible: actualiza lo ya guardado. Solo lee, no toca las campañas.', [manual, diario], { color: 4 });

export default workflow('google-ads-costes', 'Google Ads → panel (costes diarios)')
  .add(manual).to(pedir)
  .add(diario).to(pedir)
  .add(pedir).to(mapear).to(guardar)
  .add(nota);
