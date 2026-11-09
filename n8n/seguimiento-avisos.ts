import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

// Seguimiento del cliente → aviso por WhatsApp a través de Grok Bot.
// Cada minuto lee en Supabase los eventos sin avisar (seguimiento_pendientes: margen de 3 min para que Fran
// pueda deshacer un error; la bienvenida a los 5 min de pasar a Reserva; si Fran marca varias fases seguidas,
// solo sale el último estado). Manda cada aviso al webhook del bot y, si el bot responde bien, lo marca como avisado.
// Si el bot falla, no se marca: se reintenta en la siguiente pasada.

const SUPA = 'https://lhtequkigdilfldnugco.supabase.co/rest/v1/rpc';
const cred = { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } };

const cada = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3, config: { name: 'Cada minuto',
  parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } } } });

const pendientes = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Eventos sin avisar',
  parameters: { method: 'POST', url: `${SUPA}/seguimiento_pendientes`, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
    sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '{}', options: { timeout: 30000 } },
  credentials: cred, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 } });

const preparar = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Preparar avisos',
  parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `// Un aviso por lead. tipo: bienvenida (entra en Reserva), avance (cada fase) o resena (Fran pide la reseña)
const ESTADOS = {
  buscando: ['Buscando tu unidad', 'Estamos buscando en Alemania unidades que cumplan todo lo que nos has pedido.'],
  esp_revision: ['Esperando revisión', 'Hemos encontrado una unidad que encaja. Nuestro perito la revisará en persona antes de que pagues nada.'],
  esp_pago: ['Esperando firma y pago', 'La unidad ha superado la revisión de nuestro perito. Falta firmar con el vendedor y hacer el pago.'],
  esp_camion: ['Esperando al camión de transporte', 'El coche ya es tuyo. Estamos organizando el transporte en camión desde Alemania.'],
  en_camino: ['En camino', 'Tu coche viaja hacia España en camión.'],
  esp_itv: ['Esperando ITV', 'El siguiente paso es la ITV para poder matricularlo en España.'],
  esp_matricula: ['Esperando matriculación', 'Ha pasado la ITV. Estamos tramitando la matriculación en la DGT.'],
  en_reparto: ['En reparto', 'Tu coche va de camino a tu casa.'],
  esperandote: ['Tu coche te está esperando', 'Ya puedes recogerlo. Te confirmamos lugar y hora por WhatsApp.'],
  terminado: ['Proceso terminado', 'Disfruta de tu nuevo vehículo. Ha sido un placer acompañarte en todo el camino.']
};
const fmt = (d) => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }) : null;
const out = [];
for (const it of $input.all()) {
  const e = it.json;
  if (!e || !e.evento || !e.token) continue; // sin pendientes
  const tipo = e.fase === 'reserva' ? 'bienvenida' : e.fase === 'resena' ? 'resena' : 'avance';
  const [titulo, descripcion] = ESTADOS[e.estado] || ESTADOS.buscando;
  const descartada = e.fase === 'revision' && e.resultado === 'no_pasa';
  const telefono = String(e.telefono || '').replace(/[^0-9]/g, '');
  out.push({ json: {
    tipo, evento: e.evento, lead_id: e.lead_id, telefono: telefono.length === 9 ? '34' + telefono : telefono,
    nombre: e.nombre || '', vehiculo: e.vehiculo || '', servicio: e.servicio, fase: e.fase, resultado: e.resultado || null,
    estado: e.estado, estado_texto: titulo, descripcion: descartada
      ? 'La unidad candidata no ha pasado la revisión de nuestro perito, así que la hemos descartado. Seguimos buscando la tuya.'
      : descripcion,
    prevista: e.prevista, prevista_texto: fmt(e.prevista),
    codigo: e.token, enlace: 'https://seguimiento.orozcoimport.es/?c=' + e.token
  } });
}
return out;` } } });

const bot = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Avisar a Grok Bot',
  notes: 'PENDIENTE: poner la URL del webhook de Grok Bot (y su clave en una credencial si la pide). Hasta entonces el workflow queda sin publicar.',
  parameters: { method: 'POST', url: 'https://PENDIENTE-webhook-grok-bot.invalid/seguimiento',
    sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json) }}'), options: { timeout: 30000 } },
  retryOnFail: true, maxTries: 2, waitBetweenTries: 5000 } });

const marcar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Marcar como avisado',
  parameters: { method: 'POST', url: `${SUPA}/seguimiento_marcar_avisado`, authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
    sendBody: true, contentType: 'json', specifyBody: 'json',
    jsonBody: expr("{{ JSON.stringify({ p_lead: $('Preparar avisos').item.json.lead_id, p_hasta: $('Preparar avisos').item.json.evento }) }}"), options: { timeout: 30000 } },
  credentials: cred, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 } });

export default workflow('seguimiento-avisos', 'Seguimiento del cliente → aviso por WhatsApp (Grok Bot)')
  .add(cada).to(pendientes).to(preparar).to(bot).to(marcar);
