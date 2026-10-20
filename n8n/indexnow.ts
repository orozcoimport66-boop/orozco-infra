import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

// Avisa a IndexNow (Bing, y por tanto ChatGPT, más Yandex, Seznam y Naver) de las URLs de orozcoimport.es que han cambiado.
// Cada mañana: las URLs del sitemap con lastmod de los últimos 2 días. A mano: todas las URLs del sitemap.
// La clave es pública por diseño: está en https://orozcoimport.es/<clave>.txt
const KEY = 'd371df4880ac04c2bec8ae7b1e3f61bf';

const PREPARAR_JS = `
const xml = String($input.first().json.data || '');
const urls = [];
for (const b of xml.split('<url>').slice(1)) {
  const loc = (b.match(/<loc>\\s*([^<]+?)\\s*<\\/loc>/) || [])[1];
  const lastmod = (b.match(/<lastmod>\\s*([^<]+?)\\s*<\\/lastmod>/) || [])[1] || '';
  if (loc && /^https:\\/\\/orozcoimport\\.es\\//.test(loc)) urls.push({ loc, lastmod: lastmod.slice(0, 10) });
}
const manual = $execution.mode !== 'production';
const desde = $now.setZone('Europe/Madrid').minus({ days: 2 }).toISODate();
const lista = manual ? urls : urls.filter((u) => u.lastmod >= desde);
if (!lista.length) return [];
return [{ json: { host: 'orozcoimport.es', key: '${KEY}', keyLocation: 'https://orozcoimport.es/${KEY}.txt', urlList: lista.map((u) => u.loc) } }];
`;

const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Avisar todo el sitemap', position: [240, 200] }, output: [{}] });
const manana = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.2,
  config: { name: 'Cada mañana 7:20', position: [240, 400], parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 7, triggerAtMinute: 20 }] } } },
  output: [{}]
});

const sitemap = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Leer sitemap',
    parameters: { method: 'GET', url: 'https://orozcoimport.es/sitemap.xml', options: { timeout: 30000, response: { response: { responseFormat: 'text' } } } },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 5000
  },
  output: [{ data: '<urlset></urlset>' }]
});

const preparar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'URLs a avisar', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: PREPARAR_JS } },
  output: [{ host: 'orozcoimport.es', key: KEY, keyLocation: '', urlList: [] }]
});

const avisar = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Avisar a IndexNow',
    parameters: {
      method: 'POST',
      url: 'https://api.indexnow.org/indexnow',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json) }}'),
      options: { timeout: 30000, response: { response: { fullResponse: true, neverError: false } } }
    },
    retryOnFail: true, maxTries: 3, waitBetweenTries: 10000
  },
  output: [{ statusCode: 200 }]
});

const nota = sticky('## IndexNow\nCada mañana avisa a Bing (y a Yandex, Seznam y Naver) de las URLs del sitemap con **lastmod** de los últimos 2 días. Para que funcione, al publicar un cambio en la web hay que actualizar su lastmod en el sitemap.\n\nEjecutado a mano avisa de **todas** las URLs del sitemap (úsalo tras publicaciones grandes, no a diario).\n\nRespuesta 200 o 202 = aviso aceptado.', [manual, manana], { color: 4 });

export default workflow('indexnow', 'IndexNow → avisar a Bing de cambios en la web')
  .add(manual).to(sitemap)
  .add(manana).to(sitemap)
  .add(sitemap).to(preparar).to(avisar)
  .add(nota);
