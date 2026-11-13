/* Orozco Import · Guías — modo revisión.
 * Solo se activa con ?revision=1 dentro de la página de revisión del panel (panel.orozcoimport.es/revision/).
 * 1. Envía al panel las secciones y los huecos [data-campo] con su pregunta.
 * 2. Avisa de qué sección se está leyendo, para que el panel lateral la siga.
 * 3. Recibe del panel las respuestas y las pinta en la guía (en verde), y salta a un hueco o sección cuando se lo piden.
 */
(function () {
  if (!/[?&]revision=1\b/.test(location.search) || window.parent === window) return;
  var PADRES = /^https:\/\/panel\.orozcoimport\.es$|^http:\/\/localhost(:\d+)?$/;
  var padre = '*';
  document.documentElement.classList.add('en-revision');

  function seccionDe(el) {
    var s = el.closest('main section[id], .hero');
    if (!s) return 'inicio';
    return s.classList.contains('hero') ? 'inicio' : s.id;
  }
  function tituloDe(sec) {
    if (sec.classList && sec.classList.contains('hero')) return 'Cabecera';
    var h = sec.querySelector('h2');
    if (!h) return sec.id;
    var c = h.cloneNode(true); var n = c.querySelector('.num'); if (n) n.remove();
    return c.textContent.trim();
  }

  var secciones = [{ id: 'inicio', titulo: 'Cabecera', el: document.querySelector('.hero') }];
  [].forEach.call(document.querySelectorAll('main section[id]'), function (s) {
    if (s.id === 'form') return;
    secciones.push({ id: s.id, titulo: tituloDe(s), el: s });
  });
  var campos = [].map.call(document.querySelectorAll('[data-campo]'), function (el) {
    return { campo: el.dataset.campo, tipo: el.dataset.tipo || 'texto', pregunta: el.dataset.pregunta || '', seccion: seccionDe(el), actual: el.dataset.tipo === 'caso' ? '' : el.textContent.trim().slice(0, 200) };
  });
  // los huecos sin data-campo (dentro de un caso) no se preguntan por separado

  function manda(msg) { try { window.parent.postMessage(msg, padre); } catch (e) {} }
  manda({ t: 'oi-guia', titulo: document.title.replace(/\s*\|.*$/, ''), secciones: secciones.map(function (s) { return { id: s.id, titulo: s.titulo }; }), campos: campos });

  // sección visible
  var actual = null;
  function mira() {
    var y = window.innerHeight * 0.35, mejor = secciones[0];
    secciones.forEach(function (s) { if (s.el && s.el.getBoundingClientRect().top <= y) mejor = s; });
    if (mejor.id !== actual) { actual = mejor.id; manda({ t: 'oi-seccion', id: actual }); }
  }
  addEventListener('scroll', mira, { passive: true }); mira();

  addEventListener('message', function (e) {
    if (!PADRES.test(e.origin)) return;
    padre = e.origin;
    var d = e.data || {};
    if (d.t === 'oi-ir') {
      var el = d.campo ? document.querySelector('[data-campo="' + d.campo + '"]') : document.getElementById(d.seccion) || (d.seccion === 'inicio' && document.querySelector('.hero'));
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: d.campo ? 'center' : 'start' }); if (d.campo) { el.classList.remove('fran--brilla'); void el.offsetWidth; el.classList.add('fran--brilla'); } }
    }
    if (d.t === 'oi-valores') {
      Object.keys(d.valores || {}).forEach(function (k) {
        var el = document.querySelector('[data-campo="' + k + '"]'); if (!el) return;
        var v = d.valores[k];
        if (el.dataset.tipo === 'texto' || el.dataset.tipo === 'largo') {
          if (!el.dataset.original) el.dataset.original = el.textContent;
          if (v) { el.textContent = v; el.classList.add('fran--ok'); } else { el.textContent = el.dataset.original; el.classList.remove('fran--ok'); }
        } else { el.classList.toggle('fran--ok', !!v); }
      });
    }
    if (d.t === 'oi-hola') { manda({ t: 'oi-guia', titulo: document.title.replace(/\s*\|.*$/, ''), secciones: secciones.map(function (s) { return { id: s.id, titulo: s.titulo }; }), campos: campos }); actual = null; mira(); }
  });
})();
