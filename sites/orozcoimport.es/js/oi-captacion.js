/* Orozco Import — atribución y envío de formularios.
 * 1. Guarda en la sesión UTMs y gclid/fbclid de la primera página con parámetros, para que no se pierdan
 *    si el usuario navega antes de enviar el formulario.
 * 2. window.oiPayload(form): datos del formulario + atribución, listos para enviar.
 * 3. Añade un campo trampa invisible (antispam) a los formularios de captación.
 * 4. Guarda la etapa del lead (stage) para que /landing/gracias la publique en el dataLayer.
 * 5. Guarda la web de procedencia (sin parámetros) para reconocer buscadores y asistentes de IA (ChatGPT, Perplexity…).
 * 6. window.oiEnviarLead(form, op): envía al webhook y solo redirige a gracias con respuesta 2xx.
 * 7. Guarda la última guía leída en la sesión (/guias/<slug>/) y la manda con el lead en «guia», sin tocar el canal.
 * 8. Memoria de 30 días del último origen conocido (localStorage): una visita directa posterior no lo pisa.
 * 9. Reconoce los navegadores internos de Instagram, Facebook y TikTok aunque no pasen la web de procedencia.
 * 10. API de conversiones de Meta (25/11/2026, Lab MED-24): cada envío lleva un event_id que comparte con el
 *     píxel de la página de gracias (Meta deduplica navegador y servidor), las cookies _fbp y _fbc del píxel
 *     y la URL de entrada. También guarda gbraid y wbraid (clics de Google en iPhone) para la fase de Google.
 */
(function () {
  var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'gbraid', 'wbraid'];
  var STORE = 'oi_atribucion';
  window.OI_WEBHOOK = 'https://n8n.orozcoimport.es/webhook/captacion';

  // 8. Memoria de 30 días (23/11/2026): el último origen conocido (UTM o web de procedencia) se guarda
  //    también en localStorage. Si la persona vuelve otro día escribiendo la dirección (sin origen),
  //    el lead conserva de dónde vino. Una visita directa nunca pisa un origen conocido.
  //    Solo guarda el canal (UTMs, gclid, fbclid y la web de procedencia), ningún dato personal.
  var STORE_30 = 'oi_atribucion_30d', DIAS_30 = 30 * 24 * 3600 * 1000;
  function leer30() {
    try {
      var x = JSON.parse(localStorage.getItem(STORE_30) || 'null');
      if (x && x.t && (Date.now() - x.t) < DIAS_30 && x.a) return x.a;
    } catch (e) {}
    return {};
  }
  function guardar(a) {
    try { sessionStorage.setItem(STORE, JSON.stringify(a)); } catch (e) {}
    try { localStorage.setItem(STORE_30, JSON.stringify({ t: Date.now(), a: a })); } catch (e) {}
  }
  function conOrigen(a) { return !!(a && (a.referente || KEYS.some(function (k) { return a[k]; }))); }
  function leer() {
    var a = {};
    try { a = JSON.parse(sessionStorage.getItem(STORE) || '{}') || {}; } catch (e) { a = {}; }
    if (conOrigen(a)) return a;
    var b = leer30();
    return conOrigen(b) ? b : a;
  }

  var params = new URLSearchParams(window.location.search);
  var nueva = {};
  var hay = false;
  KEYS.forEach(function (k) {
    var v = (params.get(k) || '').trim();
    if (v) { nueva[k] = v.slice(0, 300); hay = true; }
  });
  var referente = '';
  try {
    if (document.referrer) {
      var r = new URL(document.referrer);
      var propio = function (h) { return h.replace(/^www\./, ''); };
      if (propio(r.hostname) !== propio(window.location.hostname)) referente = (r.hostname + r.pathname).slice(0, 200);
    }
  } catch (e) {}
  // 9. Navegadores internos de apps que no pasan la web de procedencia (23/11/2026): se reconocen por el
  //    navegador. Instagram, Facebook y TikTok se identifican; la app de ChatGPT no de forma fiable.
  if (!referente) {
    var ua = navigator.userAgent || '';
    if (/Instagram/i.test(ua)) referente = 'instagram.com/';
    else if (/FBAN|FBAV|FB_IAB/i.test(ua)) referente = 'facebook.com/';
    else if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) referente = 'tiktok.com/';
  }
  if (hay) {
    nueva.landing = window.location.pathname;
    nueva.url = window.location.href.slice(0, 1000);
    if (nueva.fbclid) nueva.fbclid_t = Date.now();
    if (referente) nueva.referente = referente;
    guardar(nueva);
  } else if (referente) {
    // Llega desde otra web sin UTM: es un origen nuevo y conocido, sustituye al anterior.
    // Excepción: si en esta misma sesión ya había UTMs (p. ej. un clic de Google Ads), se respetan.
    var sesion = {};
    try { sesion = JSON.parse(sessionStorage.getItem(STORE) || '{}') || {}; } catch (e) {}
    if (!KEYS.some(function (k) { return sesion[k]; })) guardar({ referente: referente, landing: window.location.pathname });
  }

  // 7. Guía leída (16/11/2026): la última guía visitada en la sesión viaja con el lead, venga de donde venga
  var guia = window.location.pathname.match(/^\/guias\/([a-z0-9-]+)\/?$/);
  if (guia) { try { sessionStorage.setItem('oi_guia', guia[1]); } catch (e) {} }

  window.oiAtribucion = leer;

  // URL de la página de gracias conservando la atribución de la sesión (UTMs, gclid, fbclid).
  // Se reconstruye desde sessionStorage porque el usuario puede haber navegado sin parámetros antes de enviar.
  // Con barra final para evitar la redirección 308 de /landing/gracias -> /landing/gracias/.
  window.oiGraciasUrl = function () {
    var a = leer();
    var q = new URLSearchParams();
    KEYS.forEach(function (k) { if (a[k]) q.set(k, a[k]); });
    var s = q.toString();
    return '/landing/gracias/' + (s ? '?' + s : '');
  };

  // Envío del lead (9/11/2026). Solo se va a gracias si el webhook responde 2xx.
  // 400 = datos no válidos (lo decide la página). Cualquier otro error, red caída o
  // más de 20 s sin respuesta: NO se redirige; se muestra un aviso con «Reintentar» y el
  // teléfono que ya figura en la página. Un reintento automático (a los 2 s) solo si la
  // red falla o el servidor está caído (502/503/504), donde el lead no llegó a n8n.
  var TIEMPO_MAX = 20000, ESPERA_REINTENTO = 2000;
  function quitarAviso(form) {
    var c = form.querySelector('.oi-form__envio-error');
    if (c) c.parentNode.removeChild(c);
  }
  function mostrarAviso(form, reintentar) {
    quitarAviso(form);
    var c = document.createElement('div');
    c.className = 'oi-form__envio-error';
    c.setAttribute('role', 'alert');
    c.style.cssText = 'margin:14px 0 0;padding:14px 16px;border-radius:8px;border:1px solid #e11d48;background:#fff1f2;color:#881337;font-size:0.9375rem;line-height:1.5;text-align:left;';
    var p = document.createElement('p');
    p.style.margin = '0 0 10px';
    p.textContent = 'No hemos podido enviar tu solicitud. Tus datos siguen en el formulario: vuelve a intentarlo o llámanos.';
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'oi-form__reintentar';
    b.textContent = 'Reintentar';
    b.style.cssText = 'cursor:pointer;margin:0 12px 0 0;padding:10px 18px;border:0;border-radius:6px;background:#881337;color:#fff;font:inherit;font-weight:600;';
    b.addEventListener('click', reintentar);
    var a = document.createElement('a');
    a.href = 'tel:+34644015034';
    a.textContent = 'Llamar al 644 01 50 34';
    a.style.cssText = 'display:inline-block;white-space:nowrap;margin-top:6px;color:#881337;font-weight:600;';
    c.appendChild(p); c.appendChild(b); c.appendChild(a);
    var btn = form.querySelector('[type="submit"]');
    var ancla = btn ? (btn.parentNode.className.indexOf('submit-wrap') !== -1 ? btn.parentNode : btn) : null;
    if (ancla && ancla.parentNode) ancla.parentNode.insertBefore(c, ancla.nextSibling); else form.appendChild(c);
  }

  // op.ocupado(true|false): la página bloquea o libera su botón. op.invalido(): respuesta 400.
  window.oiEnviarLead = function (form, op) {
    op = op || {};
    var ocupado = function (v) { if (op.ocupado) op.ocupado(v); };
    quitarAviso(form);
    ocupado(true);
    var cuerpo = JSON.stringify(window.oiPayload(form));
    var intentos = 0;
    function fallo(estado) {
      ocupado(false);
      try { (window.dataLayer = window.dataLayer || []).push({ event: 'formulario_error_envio', envio_estado: String(estado) }); } catch (e) {}
      mostrarAviso(form, function () { window.oiEnviarLead(form, op); });
    }
    function enviar() {
      intentos++;
      var ctrl = window.AbortController ? new AbortController() : null;
      var reloj = ctrl ? setTimeout(function () { ctrl.abort(); }, TIEMPO_MAX) : null;
      var opciones = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo };
      if (ctrl) opciones.signal = ctrl.signal;
      fetch(window.OI_WEBHOOK, opciones)
        .then(function (r) {
          clearTimeout(reloj);
          if (r.ok) { window.location.href = window.oiGraciasUrl(); return; }
          if (r.status === 400) {
            ocupado(false);
            if (op.invalido) op.invalido(); else alert('Revisa tus datos: necesitamos tu nombre y un teléfono o email válidos.');
            return;
          }
          if ((r.status === 502 || r.status === 503 || r.status === 504) && intentos < 2) { setTimeout(enviar, ESPERA_REINTENTO); return; }
          fallo(r.status);
        })
        .catch(function (e) {
          clearTimeout(reloj);
          var agotado = e && e.name === 'AbortError';
          if (!agotado && intentos < 2) { setTimeout(enviar, ESPERA_REINTENTO); return; }
          fallo(agotado ? 'tiempo' : 'red');
        });
    }
    enviar();
  };

  window.oiPayload = function (form) {
    var d = {};
    new FormData(form).forEach(function (valor, clave) {
      var v = String(valor).trim();
      if (v || !(clave in d)) { d[clave] = v; }
    });
    var a = leer();
    var tieneAtribucion = KEYS.some(function (k) { return a[k]; });
    if (tieneAtribucion) {
      KEYS.forEach(function (k) { d[k] = a[k] || ''; });
    }
    d.referente = a.referente || '';
    d.pagina = window.location.origin + window.location.pathname;
    try { d.guia = sessionStorage.getItem('oi_guia') || ''; } catch (e) { d.guia = ''; }
    // Etapa del lead para la página de gracias (Tag Manager decide si cuenta como conversión).
    try { sessionStorage.setItem('oi_lead_stage', d.stage || ''); } catch (e) {}

    // 10. API de conversiones de Meta. El event_id es el mismo en los reintentos del mismo formulario.
    if (!form._oiEventId) form._oiEventId = nuevoId();
    d.event_id = form._oiEventId;
    d.fbp = galleta('_fbp');
    d.fbc = galleta('_fbc') || (a.fbclid ? 'fb.1.' + (a.fbclid_t || Date.now()) + '.' + a.fbclid : '');
    d.url_entrada = a.url || '';
    // Mismas reglas que el panel (tipo_lead y es_lead_setting): A = 25.000 € o más sin estar valorando,
    // Setting = A o B de 15.000 a 25.000 €.
    var valorando = d.stage === 'evaluating';
    var cualificado = !valorando && ['25-30', '30-40', 'gt40'].indexOf(d.budget) !== -1;
    var setting = cualificado || (!valorando && ['15-20', '20-25'].indexOf(d.budget) !== -1);
    try {
      sessionStorage.setItem('oi_lead_meta', JSON.stringify({ event_id: d.event_id, cualificado: cualificado, setting: setting }));
    } catch (e) {}
    return d;
  };

  function galleta(nombre) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + nombre + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function nuevoId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    var s = '';
    for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-a' + s.slice(17, 20) + '-' + s.slice(20, 32);
  }

  function trampa(form) {
    if (form.querySelector('input[name="website"]')) return;
    var i = document.createElement('input');
    i.type = 'text'; i.name = 'website'; i.tabIndex = -1; i.autocomplete = 'off';
    i.setAttribute('aria-hidden', 'true');
    i.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
    form.appendChild(i);
  }
  function init() {
    var f = document.getElementById('oi-form-element');
    if (f) { trampa(f); }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
