import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

// Guías · fotos de Fran → webp.
// Las fotos que Fran sube en la página de revisión quedan en el bucket privado guias-aportes (png, jpg, heic…).
// Este flujo las pasa a webp con la transformación de imágenes de Supabase (1280 y 640 px de ancho),
// guarda el resultado en guias-aportes/web/<nombre>-<ancho>.webp y devuelve un enlace firmado de 1 h para
// cada una (para bajarlas al servidor) y una miniatura en base64 para revisarlas antes de publicarlas.
// Entrada (webhook interno, POST): { fotos: [{ ruta: '1/caso_2/xxx.png', nombre: 'caso-volvo-xc90' }] }

const SUPA = 'https://lhtequkigdilfldnugco.supabase.co';
const cred = { supabaseApi: { id: 'UITXv3nKNY6ZT4cA', name: 'Supabase Orozco' } };

const entrada = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Fotos a convertir',
  parameters: { httpMethod: 'POST', path: 'guias-fotos', responseMode: 'lastNode', responseData: 'allEntries' } } });

const repartir = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Una tarea por tamaño',
  parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const fotos = $input.first().json.body.fotos || [];
const out = [];
for (const f of fotos) for (const ancho of [1280, 640, 360]) out.push({ json: { ruta: f.ruta, nombre: f.nombre, ancho, destino: 'web/' + f.nombre + (ancho === 1280 ? '' : '-' + ancho) + '.webp' } });
return out;` } } });

const render = node({ type: 'n8n-nodes-base.httpRequest', version: 4.3, config: { name: 'Redimensionar a webp',
  parameters: { method: 'GET', url: expr(`${SUPA}/storage/v1/render/image/authenticated/guias-aportes/{{ $json.ruta }}?width={{ $json.ancho }}&resize=contain&quality=80`),
    authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'Accept', value: 'image/webp' }] },
    options: { response: { response: { responseFormat: 'file', outputPropertyName: 'foto' } }, timeout: 60000 } },
  credentials: cred } });

const mini = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Miniatura para revisar',
  parameters: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: `const t = $('Una tarea por tamaño').item.json;
const bin = $input.item.binary.foto;
const json = { ...t, mime: bin.mimeType, bytes: bin.fileSize };
if (t.ancho === 360) json.miniatura = (await this.helpers.getBinaryDataBuffer($itemIndex, 'foto')).toString('base64');
return { json, binary: $input.item.binary };` } } });

const subir = node({ type: 'n8n-nodes-base.httpRequest', version: 4.3, config: { name: 'Guardar webp',
  parameters: { method: 'POST', url: expr(`${SUPA}/storage/v1/object/guias-aportes/{{ $json.destino }}`),
    authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'x-upsert', value: 'true' }, { name: 'Content-Type', value: 'image/webp' }] },
    sendBody: true, contentType: 'binaryData', inputDataFieldName: 'foto', options: { timeout: 60000 } },
  credentials: cred } });

const firmar = node({ type: 'n8n-nodes-base.httpRequest', version: 4.3, config: { name: 'Enlace firmado',
  parameters: { method: 'POST', url: expr(`${SUPA}/storage/v1/object/sign/guias-aportes/{{ $('Una tarea por tamaño').item.json.destino }}`),
    authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
    sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '{"expiresIn": 3600}', options: { timeout: 30000 } },
  credentials: cred } });

const salida = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Resultado',
  parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const tareas = $('Una tarea por tamaño').all();
const fotos = $('Miniatura para revisar').all();
const firmas = $input.all();
const out = [];
for (let i = 0; i < tareas.length; i++) {
  const t = tareas[i].json;
  const r = { nombre: t.nombre, ancho: t.ancho, destino: t.destino, url: '${SUPA}/storage/v1' + firmas[i].json.signedURL };
  const f = fotos[i].json; r.mime = f.mime; r.bytes = f.bytes; if (f.miniatura) r.miniatura = f.miniatura;
  out.push({ json: r });
}
return out;` } } });

export default workflow('guias-fotos', 'Guías · fotos de Fran → webp')
  .add(entrada).to(repartir).to(render).to(mini).to(subir).to(firmar).to(salida);
