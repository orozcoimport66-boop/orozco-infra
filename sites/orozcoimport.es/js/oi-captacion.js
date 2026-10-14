/* Orozco Import — atribución y envío de formularios.
 * 1. Guarda en la sesión UTMs y gclid/fbclid de la primera página con parámetros, para que no se pierdan
 *    si el usuario navega antes de enviar el formulario.
 * 2. window.oiPayload(form): datos del formulario + atribución, listos para enviar.
 * 3. Añade un campo trampa invisible (antispam) a los formularios de captación.
 * 4. Guarda la etapa del lead (stage) para que /landing/gracias la publique en el dataLayer.
 * 5. Guarda la web de procedencia (sin parámetros) para reconocer buscadores y asistentes de IA (ChatGPT, Perplexity…).
 */
(function () {
  var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid'];
  var STORE = 'oi_atribucion';
  window.OI_WEBHOOK = 'https://n8n.orozcoimport.es/webhook/captacion';

  function leer() {
    try { return JSON.parse(sessionStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; }
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
  if (hay) {
    nueva.landing = window.location.pathname;
    if (referente) nueva.referente = referente;
    try { sessionStorage.setItem(STORE, JSON.stringify(nueva)); } catch (e) {}
  } else if (referente) {
    var previa = leer();
    if (!previa.referente && !KEYS.some(function (k) { return previa[k]; })) {
      try { sessionStorage.setItem(STORE, JSON.stringify({ referente: referente, landing: window.location.pathname })); } catch (e) {}
    }
  }

  window.oiAtribucion = leer;

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
    // Etapa del lead para la página de gracias (Tag Manager decide si cuenta como conversión).
    try { sessionStorage.setItem('oi_lead_stage', d.stage || ''); } catch (e) {}
    return d;
  };

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
