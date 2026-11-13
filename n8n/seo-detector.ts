import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

// Detector de temas SEO: cada lunes guarda en seo_senales las búsquedas y preguntas reales de la semana.
// Fuentes: términos de búsqueda de Google Ads (90 días), Planificador de palabras clave (volumen en España),
// Search Console y monitor de IA (desde Supabase, función seo_cargar_internas).
// Claude agrupa las señales en seo_temas y propone la guía de la semana.

const SUPA = 'https://lhtequkigdilfldnugco.supabase.co/rest/v1';
const ADS = 'https://googleads.googleapis.com/v24/customers/8433514574';
const credAds = { googleAdsOAuth2Api: { id: 'vL68DJsWa5csHHKF', name: 'Google Ads Orozco' } };
const credSupa = { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } };

// Semillas del Planificador (máx. 20): temas del servicio, no solo de compra
const SEMILLAS = [
  'importar coche alemania', 'traer coche de alemania', 'comprar coche en alemania', 'coche importado',
  'impuesto matriculacion coche importado', 'itv coche importado', 'modelo 576', 'cuanto cuesta importar un coche',
  'matricular coche aleman', 'mobile.de', 'garantia coche importado', 'estafa coche alemania',
  'coches segunda mano alemania', 'transporte coche alemania españa', 'iva coche importado',
  'importar bmw de alemania', 'importar mercedes de alemania', 'importar audi de alemania', 'golf gti alemania', 'homologar coche aleman'
];

const lunes = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Cada lunes 7:30', position: [240, 300],
  parameters: { rule: { interval: [{ field: 'weeks', weeksInterval: 1, triggerAtDay: [1], triggerAtHour: 7, triggerAtMinute: 30 }] } } }, output: [{}] });
const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Ejecutar ahora', position: [240, 120] }, output: [{}] });

const semana = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Semana', parameters: { mode: 'runOnceForAllItems', language: 'javaScript',
  jsCode: "const hoy = $now.setZone('Europe/Madrid');\nreturn [{ json: { semana: hoy.startOf('week').toISODate(), desde: hoy.minus({ days: 90 }).toISODate(), hasta: hoy.minus({ days: 1 }).toISODate() } }];" } }, output: [{ semana: '2026-11-09' }] });

const adsTerminos = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Términos de búsqueda de Ads', executeOnce: true, onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: `${ADS}/googleAds:search`, authentication: 'predefinedCredentialType', nodeCredentialType: 'googleAdsOAuth2Api',
    sendBody: true, contentType: 'json', specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ query: \"SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.conversions FROM search_term_view WHERE segments.date BETWEEN '\" + $('Semana').first().json.desde + \"' AND '\" + $('Semana').first().json.hasta + \"' AND metrics.impressions > 0\" }) }}"),
    options: { timeout: 120000, pagination: { pagination: { paginationMode: 'updateAParameterInEachRequest', parameters: { parameters: [{ type: 'body', name: 'pageToken', value: '={{ $response.body.nextPageToken }}' }] }, paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.nextPageToken }}', limitPagesFetched: true, maxRequests: 20 } } } },
  credentials: credAds, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 }, output: [{ results: [] }] });

const prepAds = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar Ads', parameters: { mode: 'runOnceForAllItems', language: 'javaScript',
  jsCode: "const semana = $('Semana').first().json.semana;\nconst acc = {};\nfor (const it of $input.all()) for (const r of (it.json.results || [])) {\n  const q = String((r.searchTermView || {}).searchTerm || '').trim().toLowerCase(); if (!q) continue;\n  const m = r.metrics || {}; const a = acc[q] || (acc[q] = { semana, fuente: 'ads_terminos', consulta: q, impresiones: 0, clics: 0, conversiones: 0 });\n  a.impresiones += Number(m.impressions || 0); a.clics += Number(m.clicks || 0); a.conversiones += Number(m.conversions || 0);\n}\nconst filas = Object.values(acc);\nreturn [{ json: { filas, n: filas.length } }];" } }, output: [{ filas: [], n: 0 }] });

const guardarAds = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Guardar Ads', executeOnce: true,
  parameters: { method: 'POST', url: `${SUPA}/seo_senales?on_conflict=semana,fuente,consulta`, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: 'resolution=merge-duplicates,return=minimal' }] },
    sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.filas) }}'), options: { timeout: 120000 } },
  credentials: credSupa, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 }, output: [{}] });

const planificador = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Planificador de palabras clave', executeOnce: true, onError: 'continueRegularOutput',
  parameters: { method: 'POST', url: `${ADS}:generateKeywordIdeas`, authentication: 'predefinedCredentialType', nodeCredentialType: 'googleAdsOAuth2Api',
    sendBody: true, contentType: 'json', specifyBody: 'json',
    jsonBody: JSON.stringify({ language: 'languageConstants/1003', geoTargetConstants: ['geoTargetConstants/2724'], keywordPlanNetwork: 'GOOGLE_SEARCH', includeAdultKeywords: false, pageSize: 1000, keywordSeed: { keywords: SEMILLAS } }),
    options: { timeout: 120000 } },
  credentials: credAds, retryOnFail: true, maxTries: 3, waitBetweenTries: 10000 }, output: [{ results: [] }] });

const prepPlan = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar Planificador', parameters: { mode: 'runOnceForAllItems', language: 'javaScript',
  jsCode: "const semana = $('Semana').first().json.semana;\nconst filas = [];\nconst vistos = new Set();\nfor (const it of $input.all()) {\n  if (it.json.error) return [{ json: { filas: [], n: 0, error: JSON.stringify(it.json.error).slice(0, 500) } }];\n  for (const r of (it.json.results || [])) {\n    const q = String(r.text || '').trim().toLowerCase(); if (!q || vistos.has(q)) continue; vistos.add(q);\n    const m = r.keywordIdeaMetrics || {};\n    filas.push({ semana, fuente: 'planificador', consulta: q, volumen_mensual: m.avgMonthlySearches == null ? null : Number(m.avgMonthlySearches), competencia: m.competition || null,\n      extra: { pujas: { baja: m.lowTopOfPageBidMicros ? Number(m.lowTopOfPageBidMicros) / 1e6 : null, alta: m.highTopOfPageBidMicros ? Number(m.highTopOfPageBidMicros) / 1e6 : null } } });\n  }\n}\nreturn [{ json: { filas, n: filas.length } }];" } }, output: [{ filas: [], n: 0 }] });

const guardarPlan = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Guardar Planificador', executeOnce: true,
  parameters: { method: 'POST', url: `${SUPA}/seo_senales?on_conflict=semana,fuente,consulta`, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: 'resolution=merge-duplicates,return=minimal' }] },
    sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.filas) }}'), options: { timeout: 120000 } },
  credentials: credSupa, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 }, output: [{}] });

const internas = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Search Console y monitor IA', executeOnce: true,
  parameters: { method: 'POST', url: `${SUPA}/rpc/seo_cargar_internas`, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
    sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr("{{ JSON.stringify({ p_semana: $('Semana').first().json.semana }) }}"), options: { timeout: 60000 } },
  credentials: credSupa, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 }, output: [{ search_console: 0, monitor_ia: 0 }] });

const nota = sticky('## Detector de temas SEO\nCada lunes guarda en **seo_senales** las búsquedas reales de la semana:\n- Términos de búsqueda de Google Ads (90 días)\n- Planificador de palabras clave (volumen mensual en España, 20 semillas)\n- Search Console y monitor de IA (función seo_cargar_internas)\n\nEl martes Claude agrupa las señales en **seo_temas** y propone la guía de la semana a Javi.\nSi Ads o el Planificador fallan, el resto se guarda igual.', [lunes, manual], { color: 4 });

export default workflow('seo-detector', 'SEO → detector de temas (cada lunes)')
  .add(lunes).to(semana)
  .add(manual).to(semana)
  .add(semana).to(adsTerminos).to(prepAds).to(guardarAds).to(planificador).to(prepPlan).to(guardarPlan).to(internas)
  .add(nota);
