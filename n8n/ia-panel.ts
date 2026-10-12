import { workflow, node, trigger, sticky, ifElse, expr } from '@n8n/workflow-sdk';

// El panel pide (re)generar el mensaje de un lead. Solo responde a usuarios del equipo (token de sesión de Supabase).
const SUPABASE = 'https://lhtequkigdilfldnugco.supabase.co';
const PUBLISHABLE = 'sb_publishable_Npr_iJetGNfb2xLgPQ0lCw_CPpRRRNk'; // clave pública de Supabase (no es secreta)
const SUB_IA = 'Kr7sYCIgRhWHuEkv';

const peticion = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.2,
  config: {
    name: 'Petición del panel',
    parameters: {
      httpMethod: 'POST',
      path: 'ia-mensaje',
      responseMode: 'responseNode',
      options: { allowedOrigins: 'https://panel.orozcoimport.es,http://localhost:5173' }
    }
  },
  output: [{ body: { lead_id: '00000000-0000-0000-0000-000000000000', token: 'jwt' } }]
});

const quien = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: '¿Quién lo pide?',
    parameters: {
      method: 'POST',
      url: `${SUPABASE}/rest/v1/rpc/yo`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'apikey', value: PUBLISHABLE },
        { name: 'Authorization', value: expr("{{ 'Bearer ' + ($json.body.token || '') }}") }
      ] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: '{}',
      options: { timeout: 10000, response: { response: { neverError: true } } }
    }
  },
  output: [{ equipo: true, id: 'uuid' }]
});

const esEquipo = ifElse({
  version: 2.3,
  config: {
    name: '¿Es del equipo?',
    parameters: {
      conditions: {
        combinator: 'and',
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.equipo === true }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }]
      }
    }
  }
});

const generar = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: {
    name: 'Generar mensaje',
    onError: 'continueRegularOutput',
    parameters: {
      mode: 'once',
      source: 'database',
      workflowId: { __rl: true, mode: 'id', value: SUB_IA },
      workflowInputs: {
        mappingMode: 'defineBelow',
        value: { lead_id: expr("{{ $('Petición del panel').first().json.body.lead_id }}") },
        matchingColumns: [],
        schema: [{ id: 'lead_id', displayName: 'lead_id', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string' }],
        attemptToConvertTypes: false
      },
      options: { waitForSubWorkflow: true }
    }
  },
  output: [{ id: 'uuid', ia_mensaje: 'Hola' }]
});

const responder = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.4,
  config: {
    name: 'Devolver mensaje',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ JSON.stringify($json.error ? { ok: false, error: String($json.error.message || $json.error) } : Object.assign({ ok: true }, $json)) }}'),
      options: { responseCode: 200 }
    }
  }
});

const denegar = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.4,
  config: {
    name: 'No autorizado',
    parameters: { respondWith: 'json', responseBody: '{ "ok": false, "error": "No autorizado" }', options: { responseCode: 401 } }
  }
});

const nota = sticky('## IA · Petición del panel\nEl botón WhatsApp / Regenerar del panel llama aquí con el token de sesión. Si el usuario es del equipo, ejecuta el subflujo **IA · Generar mensaje** y devuelve el resultado.', [peticion, quien], { color: 6 });

export default workflow('ia-panel', 'IA · Petición del panel')
  .add(peticion)
  .to(quien)
  .to(esEquipo
    .onTrue(generar.to(responder))
    .onFalse(denegar))
  .add(nota);
