import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

// IEDMT · tablas del BOE → Supabase.
// Descarga la orden anual de precios medios de Hacienda (anexo I, turismos y todo terreno) y la carga en
// iedmt_vehiculos para la calculadora del impuesto de matriculación de la web.
// Cada enero: cambiar BOE_ID y ANIO en «Orden del año» por los de la orden nueva y ejecutar a mano.
// 2026: Orden HAC/1501/2025, BOE-A-2025-26357.

const REST = 'https://lhtequkigdilfldnugco.supabase.co/rest/v1';
const cred = { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } };

const inicio = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Ejecutar a mano' } });

const orden = node({ type: 'n8n-nodes-base.set', version: 3.4, config: { name: 'Orden del año',
  parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [
    { id: 'boe', name: 'BOE_ID', value: 'BOE-A-2025-26357', type: 'string' },
    { id: 'anio', name: 'ANIO', value: 2026, type: 'number' }
  ] } } } });

const leer = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Leer tablas del BOE',
  parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const { BOE_ID, ANIO } = $('Orden del año').first().json;
const x = await this.helpers.httpRequest({ url: 'https://www.boe.es/diario_boe/xml.php?id=' + BOE_ID, encoding: 'text', timeout: 180000 });
const a = x.indexOf('Marca: ');
const b = x.indexOf('Precios medios de autocaravanas');
if (a < 0 || b < 0) throw new Error('No encuentro el anexo I de turismos en ' + BOE_ID);
const tur = x.slice(a, b);
const ent = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const num = (s) => { s = (s || '').trim(); if (!s) return null; const n = Number(s.replace(/\\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
// Cada tabla empieza por «Marca: X»; las filas tienen el modelo y 9 celdas
const re = /Marca: ([^<]+)<|<td class="cuerpo_tabla_izq">([^<]*)<\\/td>((?:\\s*<td[^>]*>[^<]*<\\/td>){9})/g;
let m, marca = null; const filas = [];
while ((m = re.exec(tur))) {
  if (m[1]) { marca = ent(m[1]); continue; }
  const t = [...m[3].matchAll(/<td[^>]*>([^<]*)<\\/td>/g)].map((z) => z[1].trim());
  const valor = num(t[8]);
  if (!marca || !valor) continue;
  filas.push({ anio: ANIO, marca, modelo: ent(m[2]), inicio: num(t[0]), fin: num(t[1]), cc: num(t[2]), cil: num(t[3]),
    motor: t[4] || null, kw: num(t[5]), cvf: num(t[6]), cv: num(t[7]), valor });
}
if (filas.length < 30000) throw new Error('Solo ' + filas.length + ' filas: revisar el formato del BOE');
const lotes = [];
for (let i = 0; i < filas.length; i += 2000) lotes.push({ json: { anio: ANIO, n: filas.length, filas: filas.slice(i, i + 2000) } });
return lotes;` } } });

const borrar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.3, config: { name: 'Borrar la carga anterior del año',
  parameters: { method: 'DELETE', url: expr(`${REST}/iedmt_vehiculos?anio=eq.{{ $json.ANIO }}`), authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: 'return=minimal' }] }, options: { timeout: 120000 } },
  credentials: cred } });

const insertar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.3, config: { name: 'Insertar lote',
  parameters: { method: 'POST', url: `${REST}/iedmt_vehiculos`, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: 'return=minimal' }] },
    sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json.filas) }}'),
    options: { timeout: 120000, batching: { batch: { batchSize: 1, batchInterval: 300 } } } },
  credentials: cred, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 } });

const resumen = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resumen',
  parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const l = $('Leer tablas del BOE').all();
return [{ json: { lotes: l.length, filas: l[0].json.n, anio: l[0].json.anio } }];` } } });

export default workflow('iedmt-boe', 'IEDMT · tablas del BOE → Supabase')
  .add(inicio).to(orden).to(borrar).to(leer).to(insertar).to(resumen);
