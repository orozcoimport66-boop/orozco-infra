/* Orozco Import · Calculadora del impuesto de matriculación (IEDMT) de un coche usado importado.
 * Se monta en cualquier <div data-calc-iedmt> (guía de costes y página de la calculadora).
 * Datos: tablas de precios medios de Hacienda (Orden HAC/1501/2025, BOE-A-2025-26357, anexo I) en Supabase
 * (tabla iedmt_vehiculos, lectura pública). Se cargan por marca y año solo cuando el usuario llega a la calculadora.
 * Cálculo (art. 3 y 5 de la orden y art. 70 de la Ley 38/1992):
 *   valor de mercado = precio de tablas × % por años de uso (anexo IV)
 *   base imponible   = valor de mercado / (1 + tipo IVA + tipo IEDMT)   (minoración de impuestos ya pagados)
 *   impuesto         = base imponible × tipo IEDMT (según CO₂ WLTP y comunidad)
 */
(function () {
  var SUPA = 'https://lhtequkigdilfldnugco.supabase.co/rest/v1/rpc/';
  var KEY = 'sb_publishable_Npr_iJetGNfb2xLgPQ0lCw_CPpRRRNk';
  var ORDEN = 'Orden HAC/1501/2025';
  var FIJOS = 3300; // transporte, ITV y tasas, revisión y servicio (ver la guía)

  // Anexo IV: % por años de uso (turismos)
  var USO = [[1, 100], [2, 84], [3, 67], [4, 56], [5, 47], [6, 39], [7, 34], [8, 28], [9, 24], [10, 19], [11, 17], [12, 13], [Infinity, 10]];
  var USO_TXT = ['hasta 1 año', 'más de 1 año', 'más de 2 años', 'más de 3 años', 'más de 4 años', 'más de 5 años', 'más de 6 años', 'más de 7 años', 'más de 8 años', 'más de 9 años', 'más de 10 años', 'más de 11 años', 'más de 12 años'];
  // Tipos por epígrafe (1: ≤120 g/km, 2: <160, 3: <200, 4: ≥200 o sin dato). Agencia Tributaria, 2026.
  var CCAA = {
    resto: { n: 'Resto de comunidades', t: [0, 4.75, 9.75, 14.75] },
    andalucia: { n: 'Andalucía', t: [0, 4.75, 9.75, 14.75] },
    asturias: { n: 'Asturias', t: [0, 4.75, 9.75, 16] },
    baleares: { n: 'Islas Baleares', t: [0, 4.75, 9.75, 16] },
    cantabria: { n: 'Cantabria', t: [0, 4.75, 9.75, 15] },
    cataluna: { n: 'Cataluña', t: [0, 4.75, 9.75, 16] },
    murcia: { n: 'Región de Murcia', t: [0, 4.75, 9.75, 15.9] },
    valencia: { n: 'Comunidad Valenciana', t: [0, 4.75, 9.75, 16] },
    canarias: { n: 'Canarias', t: [0, 3.75, 8.75, 13.75], iva: 0.07 },
    ceuta: { n: 'Ceuta y Melilla', t: [0, 0, 0, 0], iva: 0 }
  };
  var MOTOR = { G: 'Gasolina', D: 'Diésel', Elc: 'Eléctrico', GyE: 'Híbrido gasolina', DyE: 'Híbrido diésel', PHEV: 'Híbrido enchufable', S: 'Gas', SyE: 'Gas híbrido', M: 'Bifuel', H: 'Hidrógeno' };
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  var eur = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; };
  var pct = function (n) { return String(n).replace('.', ',') + ' %'; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // «ALFA ROMEO» → «Alfa Romeo», pero BMW, MG, DS o KIA se quedan en mayúsculas
  var bonita = function (m) { return m.split(' ').map(function (w) { return w.length <= 3 ? w : w.charAt(0) + w.slice(1).toLowerCase(); }).join(' '); };
  var norm = function (s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  function rpc(fn, args) {
    return fetch(SUPA + fn, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function epigrafe(co2) { return co2 == null ? 3 : co2 <= 120 ? 0 : co2 < 160 ? 1 : co2 < 200 ? 2 : 3; }
  function ivaHistorico(anio, mes, ccaa) {
    if (CCAA[ccaa].iva != null) return CCAA[ccaa].iva;
    var f = anio * 12 + mes; // IVA general: 21 % desde sep. 2012, 18 % desde jul. 2010, 16 % antes
    return f >= 2012 * 12 + 8 ? 0.21 : f >= 2010 * 12 + 6 ? 0.18 : 0.16;
  }
  function uso(anio, mes) {
    var hoy = new Date(), meses = (hoy.getFullYear() - anio) * 12 + (hoy.getMonth() - mes);
    var a = meses / 12, i = 0;
    while (a > USO[i][0]) i++;
    return { i: i, p: USO[i][1], txt: USO_TXT[i] };
  }

  function monta(raiz) {
    var hoy = new Date(), anios = '';
    for (var y = hoy.getFullYear(); y >= 1995; y--) anios += '<option>' + y + '</option>';
    var meses = MESES.map(function (m, i) { return '<option value="' + i + '">' + m.charAt(0).toUpperCase() + m.slice(1) + '</option>'; }).join('');
    var ccaa = Object.keys(CCAA).map(function (k) { return '<option value="' + k + '">' + CCAA[k].n + '</option>'; }).join('');
    var id = 'ci' + Math.random().toString(36).slice(2, 7);
    raiz.innerHTML =
      '<div class="ci-grid">' +
        '<div class="ci-campo"><label for="' + id + '-marca">Marca</label>' +
          '<input id="' + id + '-marca" list="' + id + '-marcas" autocomplete="off" placeholder="BMW, Mercedes, Audi…" spellcheck="false"><datalist id="' + id + '-marcas"></datalist></div>' +
        '<div class="ci-campo"><label for="' + id + '-mes">Primera matriculación</label>' +
          '<div class="ci-dos"><select id="' + id + '-mes" aria-label="Mes">' + meses + '</select><select id="' + id + '-anio" aria-label="Año">' + anios + '</select></div></div>' +
      '</div>' +
      '<div class="ci-campo"><label for="' + id + '-q">Modelo y versión</label>' +
        '<input id="' + id + '-q" type="search" autocomplete="off" placeholder="Elige antes la marca" disabled aria-controls="' + id + '-lista">' +
        '<ul class="ci-lista" id="' + id + '-lista" role="listbox" hidden></ul>' +
        '<div class="ci-elegido" hidden></div>' +
        '<button type="button" class="ci-enlace ci-manual-btn">¿No encuentras tu coche? Pon el precio de tablas a mano</button>' +
        '<div class="ci-manual" hidden><label for="' + id + '-valor">Precio de tablas de Hacienda (vehículo nuevo, €)</label><input id="' + id + '-valor" type="number" inputmode="numeric" min="0" step="100" placeholder="Ej.: 42.000"></div>' +
      '</div>' +
      '<div class="ci-grid">' +
        '<div class="ci-campo"><label for="' + id + '-co2">Emisiones de CO₂ (WLTP)</label>' +
          '<div class="fila"><input id="' + id + '-co2" type="range" min="0" max="350" step="1" value="145"><output for="' + id + '-co2">145 g/km</output></div>' +
          '<label class="ci-check"><input type="checkbox" class="ci-sinco2"> No tengo el dato (se aplica el tipo máximo)</label></div>' +
        '<div class="ci-campo"><label for="' + id + '-ccaa">Dónde lo matriculas</label><select id="' + id + '-ccaa">' + ccaa + '</select></div>' +
      '</div>' +
      '<div class="ci-res" aria-live="polite">' +
        '<div class="ci-total"><small>Impuesto de matriculación estimado</small><b class="ci-imp">—</b><span class="ci-tipo"></span></div>' +
        '<ol class="ci-pasos"></ol>' +
        '<p class="ci-extra"></p>' +
      '</div>' +
      '<p class="calc__nota"><b>*</b> <b>Valor fiscal</b>: el que fija Hacienda con sus tablas oficiales de precios (' + ORDEN + '), aplicando la depreciación por años de uso y la minoración de los impuestos que el coche ya pagó en origen. No es el precio del anuncio. Es una estimación: para una cifra cerrada, habla con un profesional o una gestoría especializada. Nosotros te la damos con tu coche concreto antes de que decidas.</p>';

    var $ = function (s) { return raiz.querySelector(s); };
    var elMarca = $('#' + id + '-marca'), dl = $('#' + id + '-marcas'), elMes = $('#' + id + '-mes'), elAnio = $('#' + id + '-anio'),
      elQ = $('#' + id + '-q'), lista = $('#' + id + '-lista'), elegido = $('.ci-elegido'), elCo2 = $('#' + id + '-co2'), outCo2 = raiz.querySelector('output'),
      sinCo2 = $('.ci-sinco2'), elCcaa = $('#' + id + '-ccaa'), manualBtn = $('.ci-manual-btn'), manual = $('.ci-manual'), elValor = $('#' + id + '-valor');
    var marcas = [], versiones = [], cache = {}, sel = null, cargando = null;

    // Por defecto: hace dos años, en el mes actual
    elAnio.value = String(hoy.getFullYear() - 2); elMes.value = String(hoy.getMonth());

    function cargaMarcas() {
      if (cargando) return cargando;
      cargando = rpc('iedmt_marcas').then(function (rs) {
        marcas = rs.map(function (r) { return r.marca; });
        dl.innerHTML = marcas.map(function (m) { return '<option value="' + esc(bonita(m)) + '">'; }).join('');
      }).catch(function () { cargando = null; elMarca.placeholder = 'No se han podido cargar las marcas. Pon el precio a mano.'; });
      return cargando;
    }
    function marcaElegida() { var v = norm(elMarca.value.trim()); for (var i = 0; i < marcas.length; i++) if (norm(marcas[i]) === v) return marcas[i]; return null; }
    function cargaVersiones() {
      var m = marcaElegida(), a = +elAnio.value;
      if (!m) { elQ.disabled = true; elQ.placeholder = 'Elige antes la marca'; versiones = []; pintaLista(); return; }
      var k = m + '|' + a;
      elQ.disabled = false; elQ.placeholder = 'Escribe el modelo: 320d, A4 Avant, GLC 300e…';
      if (cache[k]) { versiones = cache[k]; pintaLista(); return; }
      elQ.placeholder = 'Cargando modelos de ' + m + '…';
      rpc('iedmt_versiones', { p_marca: m, p_anio_matric: a }).then(function (rs) {
        cache[k] = rs; if (marcaElegida() === m && +elAnio.value === a) { versiones = rs; elQ.placeholder = 'Escribe el modelo: 320d, A4 Avant, GLC 300e…'; pintaLista(); }
      }).catch(function () { elQ.placeholder = 'No se han podido cargar los modelos. Pon el precio a mano.'; });
    }
    function etiqueta(v) {
      var p = [MOTOR[v.motor] || v.motor, v.cv ? v.cv + ' CV' : null, v.cc ? (v.cc / 1000).toFixed(1).replace('.', ',') + ' l' : null, (v.inicio || '…') + '–' + (v.fin || 'hoy')].filter(Boolean);
      return p.join(' · ');
    }
    function pintaLista() {
      var q = norm(elQ.value.trim());
      if (!q || sel && elQ.value === sel.modelo) { lista.hidden = true; return; }
      var toks = q.split(/\s+/);
      var rs = versiones.filter(function (v) { var t = norm(v.modelo + ' ' + (MOTOR[v.motor] || '') + ' ' + v.cv + 'cv'); return toks.every(function (x) { return t.indexOf(x) >= 0; }); });
      rs.sort(function (a, b) { return (b.exacto - a.exacto) || a.modelo.localeCompare(b.modelo) || (a.inicio || 0) - (b.inicio || 0); });
      var max = 40, html = rs.slice(0, max).map(function (v, i) {
        return '<li role="option" tabindex="-1" data-i="' + versiones.indexOf(v) + '"><b>' + esc(v.modelo) + '</b><span>' + esc(etiqueta(v)) + (v.exacto ? '' : ' · <i>fuera de su periodo</i>') + '</span><em>' + eur(v.valor) + '</em></li>';
      }).join('');
      if (!rs.length) html = '<li class="ci-nada">No aparece con ese texto. Prueba con menos palabras (por ejemplo, solo «320d») o pon el precio a mano.</li>';
      else if (rs.length > max) html += '<li class="ci-nada">Y ' + (rs.length - max) + ' versiones más: añade una palabra para afinar.</li>';
      lista.innerHTML = html; lista.hidden = false;
    }
    function elige(v) {
      sel = v; elQ.value = v.modelo; lista.hidden = true;
      elegido.innerHTML = '<span>' + esc(etiqueta(v)) + '</span><span>Precio de tablas: <b>' + eur(v.valor) + '</b></span>';
      elegido.hidden = false; manual.hidden = true; elValor.value = '';
      calcula();
    }

    function calcula() {
      var a = +elAnio.value, m = +elMes.value, cc = elCcaa.value;
      var co2 = sinCo2.checked ? null : +elCo2.value;
      outCo2.textContent = sinCo2.checked ? 'sin dato' : co2 + ' g/km';
      elCo2.disabled = sinCo2.checked;
      var ep = epigrafe(co2), tipo = CCAA[cc].t[ep];
      var precio = sel ? sel.valor : (+elValor.value || 0);
      // resalta el tramo en la tabla de la guía, si la hay
      [].forEach.call(document.querySelectorAll('#tabla-co2 tbody tr'), function (f, i) { f.classList.toggle('sel', i === ep); });
      $('.ci-tipo').textContent = 'Tipo que te toca: ' + pct(tipo) + (co2 == null ? ' (sin dato de CO₂)' : ' (' + co2 + ' g/km, ' + CCAA[cc].n + ')');
      var pasos = $('.ci-pasos'), extra = $('.ci-extra'), imp = $('.ci-imp');
      if (!precio) {
        imp.textContent = tipo === 0 ? '0 €' : '—';
        pasos.innerHTML = '<li class="ci-vacio">' + (tipo === 0 ? 'Con ' + (co2 == null ? 'esas emisiones' : co2 + ' g/km') + ' no pagas impuesto de matriculación, sea cual sea el coche.' : 'Elige marca, fecha y modelo para ver el cálculo completo.') + '</li>';
        extra.textContent = ''; return;
      }
      var u = uso(a, m), vm = precio * u.p / 100, iva = ivaHistorico(a, m, cc);
      var bi = vm / (1 + iva + tipo / 100), cuota = bi * tipo / 100;
      imp.textContent = eur(cuota);
      pasos.innerHTML =
        '<li><span>Precio de tablas de Hacienda' + (sel ? '' : ' (a mano)') + '</span><b>' + eur(precio) + '</b></li>' +
        '<li><span>× Depreciación: ' + u.txt + ' de uso (desde ' + MESES[m] + ' de ' + a + ')</span><b>' + u.p + ' %</b></li>' +
        '<li><span>= Valor fiscal<sup>*</sup></span><b>' + eur(vm) + '</b></li>' +
        '<li><span>− Impuestos ya pagados en origen (' + pct(Math.round(iva * 1000) / 10) + ' de IVA y ' + pct(tipo) + ' de matriculación)</span><b>' + eur(vm - bi) + '</b></li>' +
        '<li><span>= Base imponible</span><b>' + eur(bi) + '</b></li>' +
        '<li class="ci-fin"><span>× Tipo según CO₂ y comunidad</span><b>' + pct(tipo) + '</b></li>';
      extra.innerHTML = 'Con transporte, ITV y tasas, revisión y nuestro servicio, cuenta con unos <b>' + eur(cuota + FIJOS) + '</b> además del precio del coche. <a href="#form">Te lo calculamos con tu coche concreto →</a>';
    }

    // eventos
    elMarca.addEventListener('focus', cargaMarcas, { once: true });
    elMarca.addEventListener('input', function () { if (marcaElegida()) { sel = null; elQ.value = ''; elegido.hidden = true; cargaVersiones(); calcula(); } });
    elMarca.addEventListener('change', function () { cargaMarcas().then(function () { var m = marcaElegida(); if (m) elMarca.value = bonita(m); cargaVersiones(); }); });
    elAnio.addEventListener('change', function () { cargaVersiones(); calcula(); });
    elMes.addEventListener('change', calcula);
    elQ.addEventListener('input', function () { if (sel && elQ.value !== sel.modelo) { sel = null; elegido.hidden = true; calcula(); } pintaLista(); });
    elQ.addEventListener('focus', pintaLista);
    elQ.addEventListener('keydown', function (e) {
      var items = [].slice.call(lista.querySelectorAll('li[data-i]')), i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); items[0].focus(); }
      if (e.key === 'Enter' && items.length === 1) { e.preventDefault(); elige(versiones[+items[0].dataset.i]); }
    });
    lista.addEventListener('keydown', function (e) {
      var items = [].slice.call(lista.querySelectorAll('li[data-i]')), i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[i]).focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || elQ).focus(); }
      if (e.key === 'Enter' && i >= 0) { e.preventDefault(); elige(versiones[+items[i].dataset.i]); elQ.focus(); }
      if (e.key === 'Escape') { lista.hidden = true; elQ.focus(); }
    });
    lista.addEventListener('mousedown', function (e) { var li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); elige(versiones[+li.dataset.i]); } });
    document.addEventListener('click', function (e) { if (!raiz.contains(e.target)) lista.hidden = true; });
    manualBtn.addEventListener('click', function () { manual.hidden = !manual.hidden; if (!manual.hidden) { sel = null; elegido.hidden = true; elValor.focus(); } calcula(); });
    [elCo2, sinCo2, elCcaa, elValor].forEach(function (el) { el.addEventListener('input', calcula); el.addEventListener('change', calcula); });

    // carga perezosa: las marcas solo cuando la calculadora asoma en pantalla
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { cargaMarcas(); io.disconnect(); } }, { rootMargin: '400px' });
      io.observe(raiz);
    } else cargaMarcas();
    calcula();
  }

  function inicia() { [].forEach.call(document.querySelectorAll('[data-calc-iedmt]'), monta); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicia); else inicia();
})();
