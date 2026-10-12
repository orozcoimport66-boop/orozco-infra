import { workflow, node, trigger, sticky, expr } from '@n8n/workflow-sdk';

// Copia todo el Pipeline de Notion a la tabla notion_import de Supabase (se puede ejecutar varias veces).
const SUPABASE = 'https://lhtequkigdilfldnugco.supabase.co';
const NOTION_DB = '35df9751-4dd0-80ee-b9ad-cd4529f95d02';

const APLANAR_JS = `
const plano = (p) => {
  if (!p) return null;
  switch (p.type) {
    case 'title': case 'rich_text': return (p[p.type] || []).map((t) => t.plain_text).join('');
    case 'select': return p.select ? p.select.name : null;
    case 'status': return p.status ? p.status.name : null;
    case 'multi_select': return (p.multi_select || []).map((o) => o.name).join(', ');
    case 'number': return p.number;
    case 'date': return p.date ? p.date.start : null;
    case 'phone_number': return p.phone_number;
    case 'email': return p.email;
    case 'url': return p.url;
    case 'checkbox': return p.checkbox;
    case 'people': return (p.people || []).map((u) => u.name || u.id).join(', ');
    case 'formula': {
      const f = p.formula || {};
      if (f.type === 'date') return f.date ? f.date.start : null;
      return f[f.type] === undefined ? null : f[f.type];
    }
    case 'last_edited_time': return p.last_edited_time;
    case 'created_time': return p.created_time;
    default: return null;
  }
};
const filas = [];
const ahora = new Date().toISOString();
for (const it of $input.all()) {
  for (const pg of (it.json.results || [])) {
    if (pg.object !== 'page' || pg.in_trash || pg.archived) continue;
    const props = {};
    for (const [k, v] of Object.entries(pg.properties || {})) {
      const x = plano(v);
      if (x !== null && x !== '') props[k] = x;
    }
    props.__url = pg.url;
    filas.push({ page_id: pg.id, creado: pg.created_time, editado: pg.last_edited_time, props, cargado: ahora });
  }
}
return [{ json: { total: filas.length, filas } }];
`;

const inicio = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Ejecutar', position: [240, 300] },
  output: [{}]
});

const leerNotion = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Leer Pipeline de Notion',
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
      jsonBody: '{ "page_size": 100 }',
      options: {
        timeout: 30000,
        pagination: {
          pagination: {
            paginationMode: 'updateAParameterInEachRequest',
            parameters: { parameters: [{ type: 'body', name: 'start_cursor', value: expr('{{ $response.body.next_cursor }}') }] },
            paginationCompleteWhen: 'other',
            completeExpression: expr('{{ $response.body.has_more === false }}'),
            limitPagesFetched: true,
            maxRequests: 30,
            requestInterval: 400
          }
        }
      }
    },
    credentials: { notionApi: { id: '6eiqjvgfITkHEx5s', name: 'Notion account' } }
  },
  output: [{ results: [], has_more: false, next_cursor: null }]
});

const aplanar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Aplanar fichas', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: APLANAR_JS } },
  output: [{ total: 0, filas: [] }]
});

const guardar = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Guardar en notion_import',
    parameters: {
      method: 'POST',
      url: `${SUPABASE}/rest/v1/notion_import`,
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

const nota = sticky('## Importar Notion (puntual)\nLee todo el Pipeline de Notion y lo guarda en bruto en **notion_import** (Supabase). La conversión a leads se hace después en SQL. Se puede repetir: actualiza las fichas ya cargadas.', [inicio, leerNotion], { color: 4 });

export default workflow('notion-import', 'Migración: importar Pipeline de Notion')
  .add(inicio)
  .to(leerNotion)
  .to(aplanar)
  .to(guardar)
  .add(nota);
