import { workflow, node, trigger, sticky, expr, newCredential } from '@n8n/workflow-sdk';

// Subflujo: genera el mensaje de primer contacto de un lead con Claude y lo guarda en Supabase.
// Lo llaman la captación (lead nuevo) y la petición del panel (botón WhatsApp / regenerar).
const SUPABASE = 'https://lhtequkigdilfldnugco.supabase.co';

const PARSEAR_JS = `
const r = $json;
const txt = (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
const m = txt.match(/\\{[\\s\\S]*\\}/);
let o;
try { o = JSON.parse(m ? m[0] : txt); } catch (e) { throw new Error('La IA no devolvió un JSON válido: ' + txt.slice(0, 200)); }
if (!o.mensaje) throw new Error('La IA no devolvió mensaje');
return [{ json: { lead_id: $('Inicio').first().json.lead_id, ia: o } }];
`;

const inicio = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'Inicio',
    parameters: { inputSource: 'workflowInputs', workflowInputs: { values: [{ name: 'lead_id', type: 'string' }] } }
  },
  output: [{ lead_id: '00000000-0000-0000-0000-000000000000' }]
});

const contexto = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Datos del lead y prompt',
    parameters: {
      method: 'POST',
      url: `${SUPABASE}/rest/v1/rpc/ia_contexto`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_lead: $json.lead_id }) }}'),
      options: { timeout: 15000 }
    },
    credentials: { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } }
  },
  output: [{ system: '...', lead: { nombre: 'Ana' } }]
});

const claude = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Escribir mensaje con Claude',
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    parameters: {
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'anthropicApi',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 1000, system: $json.system, messages: [{ role: 'user', content: 'Datos del lead:\\n' + JSON.stringify($json.lead, null, 2) }] }) }}"),
      options: { timeout: 60000 }
    },
    credentials: { anthropicApi: newCredential('Anthropic Orozco') }
  },
  output: [{ content: [{ type: 'text', text: '{"mensaje":"Hola"}' }] }]
});

const parsear = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Leer respuesta', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: PARSEAR_JS } },
  output: [{ lead_id: '00000000-0000-0000-0000-000000000000', ia: { mensaje: 'Hola', prioridad: 'alta', viabilidad: 'viable', nota_interna: '' } }]
});

const guardar = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Guardar en el lead',
    parameters: {
      method: 'POST',
      url: `${SUPABASE}/rest/v1/rpc/guardar_ia`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_lead: $json.lead_id, p: $json.ia }) }}'),
      options: { timeout: 15000 }
    },
    credentials: { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } }
  },
  output: [{ id: '00000000-0000-0000-0000-000000000000', ia_mensaje: 'Hola' }]
});

const nota = sticky('## IA · Mensaje de primer contacto\nLee el lead y las instrucciones (tabla **ajustes**, editables desde el panel), pide el mensaje a Claude y guarda mensaje, prioridad, viabilidad y nota interna en el lead. Nunca envía nada: Fran lo revisa en el panel.', [inicio, contexto], { color: 6 });

export default workflow('ia-generar', 'IA · Generar mensaje de primer contacto')
  .add(inicio)
  .to(contexto)
  .to(claude)
  .to(parsear)
  .to(guardar)
  .add(nota);
