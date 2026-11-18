import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

// LAN-18: correo a Fran cuando el setter marca un lead 🔥 listo para llamada.
// Supabase (leads_calientes_por_avisar) solo devuelve algo de lunes a viernes de 9 a 21 y marca cada aviso para no repetirlo.
// Los que se marcan fuera de horario no se avisan por correo: se quedan en la franja «Llamar ahora» del panel.

const CORREO_JS = `
const PRES = { lt15: '< 15.000 €', '15-20': '15–20.000 €', '20-25': '20–25.000 €', '25-30': '25–30.000 €', '30-40': '30–40.000 €', gt40: '> 40.000 €' };
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fila = (k, v) => v ? '<tr><td style="padding:6px 12px 6px 0;color:#64748B;white-space:nowrap;vertical-align:top">' + k + '</td><td style="padding:6px 0;color:#0F172A">' + esc(v).replace(/\\n/g, '<br>') + '</td></tr>' : '';
const btn = (href, txt, color) => href ? '<a href="' + href + '" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border-radius:8px;background:' + color + ';color:#fff;text-decoration:none;font-weight:600">' + txt + '</a>' : '';
const salida = [];
for (const it of $input.all()) {
  const l = it.json || {};
  if (!l.lead_id) continue;
  const tel = String(l.telefono || '').replace(/\\D/g, '');
  const resumen = String(l.resumen || '').replace(/\\s*(Duda principal:|Siguiente paso:)/g, '\\n$1').trim();
  const html = '<div style="font-family:Arial,sans-serif;max-width:560px">' +
    '<h2 style="color:#0F172A;margin:0 0 4px">🔥 Listo para llamada: ' + esc(l.nombre || 'Sin nombre') + '</h2>' +
    '<p style="color:#64748B;margin:0 0 16px">Lead ' + esc(l.tipo || 'sin tipo') + ' · ' + esc(l.estado) + ' · Llámale en menos de 2 horas para agendar la videollamada</p>' +
    btn('https://panel.orozcoimport.es/#/hoy?lead=' + l.lead_id, 'Abrir en el panel', '#0F172A') + btn(tel ? 'tel:+' + tel : '', 'Llamar', '#2563EB') + btn(tel ? 'https://wa.me/' + tel : '', 'WhatsApp', '#16A34A') +
    '<table style="border-collapse:collapse;margin-top:12px;font-size:14px">' +
    fila('Resumen', resumen) + fila('Señales', l.senales) + fila('Coche', l.modelo) + fila('Presupuesto', PRES[l.presupuesto] || l.presupuesto) + fila('Teléfono', tel ? '+' + tel : '') +
    '</table><p style="color:#94A3B8;font-size:12px;margin-top:16px">Lead caliente (LAN-18). Al registrar la llamada en el panel (Hoy → Llamar ahora) se quita el 🔥.</p></div>';
  salida.push({ json: {
    sender: { name: 'Orozco Import Leads', email: 'orozcoimport66@gmail.com' },
    to: [{ email: 'orozcoimport66@gmail.com' }],
    subject: '🔥📞  LLAMAR📞🔥',
    htmlContent: html
  } });
}
return salida;
`;

const cada2 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'Cada 2 minutos', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } } } });

const pedir = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Leads 🔥 por avisar (Supabase)',
    retryOnFail: true, maxTries: 3, waitBetweenTries: 3000,
    parameters: {
      method: 'POST', url: 'https://lhtequkigdilfldnugco.supabase.co/rest/v1/rpc/leads_calientes_por_avisar',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '{}', options: { timeout: 20000 }
    },
    credentials: { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } }
  },
  output: [{ id: 1, lead_id: '00000000-0000-0000-0000-000000000001', nombre: 'Ana Prueba', tipo: 'A', modelo: 'BMW X3', presupuesto: '30-40', telefono: '+34600000000', estado: 'Contactado', resumen: 'Busca BMW X3 por 38.000 €, compra en 1 mes. Duda principal: garantía. Siguiente paso: videollamada', senales: 'manda anuncio' }]
});

const correo = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar correo', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: CORREO_JS } },
  output: [{ subject: '🔥📞  LLAMAR📞🔥', htmlContent: '<p>...</p>' }]
});

const enviar = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Avisar a Fran (Brevo)',
    retryOnFail: true, maxTries: 3, waitBetweenTries: 3000,
    parameters: {
      method: 'POST', url: 'https://api.brevo.com/v3/smtp/email',
      authentication: 'predefinedCredentialType', nodeCredentialType: 'sendInBlueApi',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('{{ JSON.stringify($json) }}'), options: { timeout: 15000 }
    },
    credentials: { sendInBlueApi: { id: 'atf70WrWVultMUsY', name: 'Brevo account' } }
  },
  output: [{ messageId: '<abc@smtp-relay.brevo.com>' }]
});

export default workflow('lead-caliente-aviso', 'Lead 🔥 · Aviso por correo a Fran (LAN-18)')
  .add(cada2).to(pedir).to(correo).to(enviar);
