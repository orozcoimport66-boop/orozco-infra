import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

// Cada noche trae de Microsoft Clarity las métricas de comportamiento de las últimas 24 h por página
// (sesiones, scroll, tiempo, clics de frustración…) y las guarda en clarity_diario. Clarity permite 10 consultas al día.
const SUPABASE = 'https://lhtequkigdilfldnugco.supabase.co';

const MAPEAR_JS = `
const fecha = $now.setZone('Europe/Madrid').toISODate();
const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
// /landing/ para orozcoimport.es; otros dominios (p. ej. pre.) conservan el dominio delante
const ruta = (u) => {
  const s = String(u || '/').split('#')[0].split('?')[0];
  const m = s.match(/^https?:\\/\\/([^\\/]+)(\\/.*)?$/i);
  if (!m) return s || '/';
  const host = m[1].toLowerCase().replace(/^www\\./, '');
  const path = m[2] || '/';
  return host === 'orozcoimport.es' ? path : host + path;
};
const acc = {};
for (const it of $input.all()) {
  const lista = Array.isArray(it.json) ? it.json : (it.json.data || [it.json]);
  for (const m of lista) {
    for (const r of (m.information || [])) {
      const pagina = ruta(r.URL || r.Url || r.url).slice(0, 300) || '/';
      const k = pagina + '|' + m.metricName;
      const peso = num(r.sessionsCount) ?? num(r.totalSessionCount) ?? 1;
      const a = acc[k] || (acc[k] = { fecha, pagina, metrica: m.metricName, valores: {}, _peso: 0 });
      for (const [campo, v] of Object.entries(r)) {
        if (/^url$/i.test(campo)) continue;
        const n = num(v);
        if (n === null) { a.valores[campo] = v; continue; }
        if (/count|sessions|views|subtotal/i.test(campo) && !/percentage/i.test(campo)) a.valores[campo] = (a.valores[campo] || 0) + n;
        else a.valores[campo] = ((a.valores[campo] || 0) * a._peso + n * peso) / (a._peso + peso);
      }
      a._peso += peso;
    }
  }
}
const filas = Object.values(acc).map(({ _peso, ...f }) => ({ ...f, actualizado: new Date().toISOString() }));
if (!filas.length) return [];
return [{ json: { total: filas.length, filas } }];
`;

const manual = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Ejecutar ahora', position: [240, 200] }, output: [{}] });
const noche = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.2,
  config: { name: 'Cada noche 23:50', position: [240, 400], parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 23, triggerAtMinute: 50 }] } } },
  output: [{}]
});

const pedir = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Pedir datos a Clarity',
    parameters: {
      method: 'GET',
      url: 'https://www.clarity.ms/export-data/api/v1/project-live-insights',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendQuery: true,
      queryParameters: { parameters: [{ name: 'numOfDays', value: '1' }, { name: 'dimension1', value: 'URL' }] },
      options: { timeout: 60000 }
    },
    credentials: { httpHeaderAuth: { id: '6kQ4NcohafGvuz9L', name: 'Clarity Orozco' } }
  },
  output: [{ metricName: 'Traffic', information: [] }]
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
    name: 'Guardar en clarity_diario',
    parameters: {
      method: 'POST',
      url: `${SUPABASE}/rest/v1/clarity_diario`,
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

const nota = sticky('## Clarity → panel\nCada noche trae las métricas de comportamiento de las últimas 24 h por página y las guarda en **clarity_diario**. Clarity permite 10 consultas al día: no ejecutar a mano más de lo necesario.', [manual, noche], { color: 4 });

export default workflow('clarity-diario', 'Clarity → panel (cada noche)')
  .add(manual).to(pedir)
  .add(noche).to(pedir)
  .add(pedir).to(mapear).to(guardar)
  .add(nota);
