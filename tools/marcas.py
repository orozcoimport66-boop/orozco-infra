#!/usr/bin/env python3
"""Genera las páginas por marca (/bmw/, /mercedes/, /audi/) a partir de la home.

Uso:  python3 tools/marcas.py            (desde la raíz del repo)

La home es la plantilla: se reutilizan su diseño, proceso, servicios, inspección,
testimonios, formulario y scripts. Por marca cambian: cabecera SEO y schema, hero,
"por qué importar", la sección de modelos, los casos del carrusel del hero, las FAQ,
el título del formulario y el texto SEO del footer.

Fotos: cada hueco apunta a un archivo dentro de la carpeta de la marca. Si existe
la foto (.webp o .jpg) se usa; si no, se genera un marcador .svg con el nombre del hueco.
"""
import html
import json
import os
import re

RAIZ = os.path.join(os.path.dirname(__file__), '..', 'sites', 'orozcoimport.es')
DOM = 'https://orozcoimport.es'

MARCAS = {
    'bmw': {
        'marca': 'BMW', 'nombre_largo': 'BMW',
        'title': 'Importar un BMW de Alemania | Orozco Import',
        'description': 'Importa tu BMW desde Alemania: lo buscamos, lo inspeccionamos físicamente y te lo entregamos con matrícula española. Serie 3, Serie 4, X1, X3 y más.',
        'og_description': 'Tu BMW desde Alemania hasta tu puerta. Lo buscamos, lo inspeccionamos y gestionamos todo. +400 coches importados desde 2017.',
        'subtitulo': 'Alemania es el mercado de origen de BMW: más unidades, más versiones y mejor equipadas que en España. Buscamos tu BMW, lo inspeccionamos físicamente y te lo entregamos con matrícula española.',
        'why_eyebrow': 'Por qué traer tu BMW de Alemania',
        'why_title': 'El mismo BMW,<br>\n        <em>con más donde elegir y mejor equipado.</em>',
        'why_lead': 'En Alemania hay muchas más unidades de BMW de ocasión que en España. Eso significa más opciones de motor, color y equipamiento, y precios más competitivos. Nosotros lo buscamos, lo revisamos en persona y nos encargamos de todo.',
        'why': [
            ('El mercado de origen de la marca', 'Hay muchas más unidades de BMW de ocasión en Alemania que en España, así que es más fácil dar con la versión, el motor y el color exactos que buscas.'),
            ('Equipamiento que aquí cuesta encontrar', 'Paquete M Sport, Head-Up Display, techo panorámico o asientos confort aparecen con mucha más frecuencia en unidades alemanas.'),
            ('Historial de servicio verificable', 'La mayoría pasan sus revisiones en la red oficial BMW. Comprobamos el historial de mantenimiento antes de proponerte el coche.'),
        ],
        'modelos_eyebrow': 'Los BMW que más nos piden',
        'modelos_title': 'Del Serie 1 al X3.<br>\n        <em>Te buscamos la versión exacta.</em>',
        'modelos': [
            ('modelo-serie-3', 'BMW Serie 3', 'Berlina y Touring, de gasolina, diésel o híbrido enchufable. Es el BMW que más nos piden.'),
            ('modelo-serie-4', 'BMW Serie 4', 'Coupé, Cabrio y Gran Coupé. En Alemania hay mucha más oferta con paquete M Sport.'),
            ('modelo-serie-1', 'BMW Serie 1', 'El compacto premium de BMW, con versiones deportivas M135i.'),
            ('modelo-x1', 'BMW X1', 'SUV compacto, con tracción xDrive y versiones híbridas enchufables.'),
            ('modelo-x3', 'BMW X3', 'El SUV medio de BMW, con muchas más combinaciones de motor y equipamiento.'),
        ],
        # Casos reales ya publicados en la web (foto existente, modelo, cliente, ahorro)
        'casos': [
            ('/landing/caso-4.jpg', 'BMW Serie 1', 'Eric · Bilbao', '3.900€'),
            ('/landing/caso-7.jpg', 'BMW X4 30d', 'Sole · Madrid', '3.800€'),
        ],
        'faq': [
            ('¿Cuánto se ahorra importando un BMW de Alemania?',
             'Depende del modelo, la versión y el equipamiento. Dos casos reales: un <strong>BMW Serie 1</strong> para Eric, de Bilbao, con <span class="oi-num">3.900€</span> de ahorro, y un <strong>BMW X4 30d</strong> para Sole, de Madrid, con <span class="oi-num">3.800€</span>, ya contando transporte, matriculación e impuestos. Antes de empezar te damos el desglose de tu caso.'),
            ('¿Se mantiene la garantía oficial de BMW en España?',
             'Sí. La garantía de fábrica de BMW es europea: si el coche todavía la tiene, <strong>sigue siendo válida en España</strong> en cualquier taller oficial. Lo comprobamos antes de la compra.'),
            ('¿Qué BMW conviene traer de Alemania?',
             'Los que más nos piden son el <strong>Serie 3, Serie 4, Serie 1, X1 y X3</strong>. Donde más se nota la diferencia es en versiones bien equipadas (M Sport, motores de gama alta) y en modelos con poca oferta en España. Si nos dices qué buscas, te decimos si merece la pena traerlo.'),
        ],
        'form_title': 'Importa tu BMW desde Alemania.',
        'placeholder': 'Modelo, versión y cualquier detalle (p. ej. BMW Serie 3 Touring M Sport)',
        'seo_text': 'Orozco Import es una empresa española especializada en la <strong>importación de BMW desde Alemania</strong>, con más de 9 años de experiencia y más de 400 vehículos gestionados. Buscamos tu BMW (Serie 1, Serie 3, Serie 4, X1, X3, X5 o modelos M), lo inspeccionamos físicamente en Alemania, negociamos el precio, gestionamos el transporte, la ITV y la matriculación, y te lo entregamos en tu domicilio. Si quieres <strong>importar un BMW de Alemania a España</strong> con total seguridad, somos tu solución.',
    },
    'mercedes': {
        'marca': 'Mercedes', 'nombre_largo': 'Mercedes-Benz',
        'title': 'Importar un Mercedes de Alemania | Orozco Import',
        'description': 'Importa tu Mercedes-Benz desde Alemania: lo buscamos, lo inspeccionamos físicamente y te lo entregamos con matrícula española. Clase A, Clase C, CLA, GLC y más.',
        'og_description': 'Tu Mercedes desde Alemania hasta tu puerta. Lo buscamos, lo inspeccionamos y gestionamos todo. +400 coches importados desde 2017.',
        'subtitulo': 'Alemania es el mercado de origen de Mercedes-Benz: más unidades, más versiones y mejor equipadas que en España. Buscamos tu Mercedes, lo inspeccionamos físicamente y te lo entregamos con matrícula española.',
        'why_eyebrow': 'Por qué traer tu Mercedes de Alemania',
        'why_title': 'El mismo Mercedes,<br>\n        <em>con más donde elegir y mejor equipado.</em>',
        'why_lead': 'En Alemania hay muchas más unidades de Mercedes-Benz de ocasión que en España. Eso significa más opciones de motor, color y equipamiento, y precios más competitivos. Nosotros lo buscamos, lo revisamos en persona y nos encargamos de todo.',
        'why': [
            ('El mercado de origen de la marca', 'Hay muchas más unidades de Mercedes de ocasión en Alemania que en España, así que es más fácil dar con la versión, el motor y el color exactos que buscas.'),
            ('AMG Line e híbridos enchufables', 'Acabados AMG Line, paquete Night, sonido Burmester o versiones híbridas enchufables aparecen con mucha más frecuencia en unidades alemanas.'),
            ('Historial de servicio verificable', 'La mayoría pasan sus revisiones en la red oficial Mercedes-Benz. Comprobamos el historial de mantenimiento antes de proponerte el coche.'),
        ],
        'modelos_eyebrow': 'Los Mercedes que más nos piden',
        'modelos_title': 'De la Clase A al GLC.<br>\n        <em>Te buscamos la versión exacta.</em>',
        'modelos': [
            ('modelo-clase-a', 'Mercedes Clase A', 'Compacto y berlina, con acabado AMG Line y sistema MBUX.'),
            ('modelo-clase-c', 'Mercedes Clase C', 'Berlina y Estate, de gasolina, diésel o híbrido enchufable.'),
            ('modelo-cla', 'Mercedes CLA', 'Coupé de cuatro puertas y Shooting Brake, también en híbrido enchufable 250e.'),
            ('modelo-gla', 'Mercedes GLA', 'SUV compacto, con versiones híbridas enchufables.'),
            ('modelo-glc', 'Mercedes GLC', 'SUV y Coupé, con muchas más combinaciones de motor y equipamiento.'),
        ],
        'casos': [
            ('/landing/caso-8.jpg', 'Mercedes C200 AMG', 'Enrique · Sevilla', '2.000€'),
            ('/landing/caso-1.jpg', 'Mercedes CLA 250e AMG', 'Fabián · Valencia', '5.324€'),
        ],
        'faq': [
            ('¿Cuánto se ahorra importando un Mercedes de Alemania?',
             'Depende del modelo, la versión y el equipamiento. Dos casos reales: un <strong>Mercedes CLA 250e AMG</strong> para Fabián, de Valencia, con <span class="oi-num">5.324€</span> de ahorro, y un <strong>Mercedes C200 AMG</strong> para Enrique, de Sevilla, con <span class="oi-num">2.000€</span>, ya contando transporte, matriculación e impuestos. Antes de empezar te damos el desglose de tu caso.'),
            ('¿Se mantiene la garantía oficial de Mercedes-Benz en España?',
             'Sí. La garantía de fábrica de Mercedes-Benz es europea: si el coche todavía la tiene, <strong>sigue siendo válida en España</strong> en cualquier taller oficial. Lo comprobamos antes de la compra.'),
            ('¿Qué Mercedes conviene traer de Alemania?',
             'Los que más nos piden son la <strong>Clase A, Clase C, CLA, GLA y GLC</strong>. Donde más se nota la diferencia es en versiones bien equipadas (AMG Line, híbridos enchufables) y en modelos con poca oferta en España. Si nos dices qué buscas, te decimos si merece la pena traerlo.'),
        ],
        'form_title': 'Importa tu Mercedes desde Alemania.',
        'placeholder': 'Modelo, versión y cualquier detalle (p. ej. Mercedes Clase C 300e AMG Line)',
        'seo_text': 'Orozco Import es una empresa española especializada en la <strong>importación de Mercedes-Benz desde Alemania</strong>, con más de 9 años de experiencia y más de 400 vehículos gestionados. Buscamos tu Mercedes (Clase A, Clase C, Clase E, CLA, GLA, GLC o modelos AMG), lo inspeccionamos físicamente en Alemania, negociamos el precio, gestionamos el transporte, la ITV y la matriculación, y te lo entregamos en tu domicilio. Si quieres <strong>importar un Mercedes de Alemania a España</strong> con total seguridad, somos tu solución.',
    },
    'audi': {
        'marca': 'Audi', 'nombre_largo': 'Audi',
        'title': 'Importar un Audi de Alemania | Orozco Import',
        'description': 'Importa tu Audi desde Alemania: lo buscamos, lo inspeccionamos físicamente y te lo entregamos con matrícula española. A3, A4, A5, Q3, Q5 y más.',
        'og_description': 'Tu Audi desde Alemania hasta tu puerta. Lo buscamos, lo inspeccionamos y gestionamos todo. +400 coches importados desde 2017.',
        'subtitulo': 'Alemania es el mercado de origen de Audi: más unidades, más versiones y mejor equipadas que en España. Buscamos tu Audi, lo inspeccionamos físicamente y te lo entregamos con matrícula española.',
        'why_eyebrow': 'Por qué traer tu Audi de Alemania',
        'why_title': 'El mismo Audi,<br>\n        <em>con más donde elegir y mejor equipado.</em>',
        'why_lead': 'En Alemania hay muchas más unidades de Audi de ocasión que en España. Eso significa más opciones de motor, color y equipamiento, y precios más competitivos. Nosotros lo buscamos, lo revisamos en persona y nos encargamos de todo.',
        'why': [
            ('El mercado de origen de la marca', 'Hay muchas más unidades de Audi de ocasión en Alemania que en España, así que es más fácil dar con la versión, el motor y el color exactos que buscas.'),
            ('quattro, S line y Matrix LED', 'Tracción quattro, acabado S line, faros Matrix LED o Virtual Cockpit aparecen con mucha más frecuencia en unidades alemanas.'),
            ('Historial de servicio verificable', 'La mayoría pasan sus revisiones en la red oficial Audi. Comprobamos el historial de mantenimiento antes de proponerte el coche.'),
        ],
        'modelos_eyebrow': 'Los Audi que más nos piden',
        'modelos_title': 'Del A3 al Q5.<br>\n        <em>Te buscamos la versión exacta.</em>',
        'modelos': [
            ('modelo-a5', 'Audi A5', 'Sportback, Coupé y Cabrio. Es el Audi que más nos piden.'),
            ('modelo-q3', 'Audi Q3', 'SUV compacto y Sportback, con acabado S line.'),
            ('modelo-a3', 'Audi A3', 'Sportback y Sedán, de gasolina, diésel o híbrido enchufable.'),
            ('modelo-a4', 'Audi A4', 'Berlina y Avant, con muchas más unidades quattro en Alemania.'),
            ('modelo-q5', 'Audi Q5', 'SUV y Sportback, con tracción quattro e híbridos enchufables.'),
        ],
        'casos': [
            ('/caso-9.jpg', 'Audi A4 Avant', 'Mario · Burgos', '4.700€'),
            ('/landing/caso-3.jpg', 'Audi TT RS', 'Miguel L. · Barcelona', '6.900€'),
        ],
        'faq': [
            ('¿Cuánto se ahorra importando un Audi de Alemania?',
             'Depende del modelo, la versión y el equipamiento. Dos casos reales: un <strong>Audi TT RS</strong> para Miguel, de Barcelona, con <span class="oi-num">6.900€</span> de ahorro, y un <strong>Audi A4 Avant</strong> para Mario, de Burgos, con <span class="oi-num">4.700€</span>, ya contando transporte, matriculación e impuestos. Antes de empezar te damos el desglose de tu caso.'),
            ('¿Se mantiene la garantía oficial de Audi en España?',
             'Sí. La garantía de fábrica de Audi es europea: si el coche todavía la tiene, <strong>sigue siendo válida en España</strong> en cualquier taller oficial. Lo comprobamos antes de la compra.'),
            ('¿Qué Audi conviene traer de Alemania?',
             'Los que más nos piden son el <strong>A5, Q3, A3, A4 y Q5</strong>. Donde más se nota la diferencia es en versiones bien equipadas (S line, quattro, motores de gama alta) y en modelos RS con poca oferta en España. Si nos dices qué buscas, te decimos si merece la pena traerlo.'),
        ],
        'form_title': 'Importa tu Audi desde Alemania.',
        'placeholder': 'Modelo, versión y cualquier detalle (p. ej. Audi A5 Sportback S line quattro)',
        'seo_text': 'Orozco Import es una empresa española especializada en la <strong>importación de Audi desde Alemania</strong>, con más de 9 años de experiencia y más de 400 vehículos gestionados. Buscamos tu Audi (A3, A4, A5, A6, Q3, Q5 o modelos RS), lo inspeccionamos físicamente en Alemania, negociamos el precio, gestionamos el transporte, la ITV y la matriculación, y te lo entregamos en tu domicilio. Si quieres <strong>importar un Audi de Alemania a España</strong> con total seguridad, somos tu solución.',
    },
}

# Mientras las páginas son un borrador (fotos pendientes) van con noindex. Al lanzarlas: --lanzar
import sys
BORRADOR = '--lanzar' not in sys.argv

# Huecos de casos reales que faltan en el carrusel del hero (foto + datos del cliente)
CASOS_EXTRA = 3

ENLACES_MARCA = [('/bmw/', 'Importar un BMW de Alemania'), ('/mercedes/', 'Importar un Mercedes de Alemania'),
                 ('/audi/', 'Importar un Audi de Alemania'), ('/golf-gti/', 'Importar un Golf GTI de Alemania')]

CSS_MODELOS = """
/* ---------- Modelos por marca ---------- */
.oi-models { background: var(--oi-bg-light); color: var(--oi-text-dark); width: 100%; padding: 120px 28px; font-family: var(--font-sans); }
.oi-models__container { max-width: 1180px; margin: 0 auto; width: 100%; }
.oi-models__header { max-width: 760px; margin: 0 auto 64px; text-align: center; }
.oi-models__title { font-size: clamp(32px, 4.4vw, 52px); line-height: 1.08; letter-spacing: -0.02em; margin: 14px 0 0; color: var(--oi-text-dark); }
.oi-models__title em { color: var(--oi-text-mute); font-style: italic; }
.oi-models__grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 20px; }
.oi-models__card { flex: 0 1 calc((100% - 40px) / 3); }
.oi-models__card { background: #fff; border: 1px solid var(--oi-line-light); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
.oi-models__photo { aspect-ratio: 16 / 10; background: var(--oi-bg-paper); overflow: hidden; }
.oi-models__photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.oi-models__info { padding: 22px 24px 26px; display: flex; flex-direction: column; gap: 8px; }
.oi-models__name { font-size: 19px; font-weight: 600; margin: 0; }
.oi-models__text { font-size: 15px; line-height: 1.55; color: var(--oi-text-body); margin: 0; }
.oi-models__cta { text-align: center; margin-top: 48px; }
@media (max-width: 900px) { .oi-models__card { flex-basis: calc((100% - 20px) / 2); } }
@media (max-width: 600px) { .oi-models { padding: 88px 16px; } .oi-models__card { flex-basis: 100%; } }
"""


def t(s):
    return html.unescape(re.sub(r'\s+', ' ', re.sub('<[^>]+>', '', s))).strip()


def uno(h, viejo, nuevo):
    n = h.count(viejo)
    if n != 1:
        raise SystemExit(f'Se esperaba 1 coincidencia y hay {n}: {viejo[:80]!r}')
    return h.replace(viejo, nuevo)


def sub_re(h, patron, nuevo, flags=re.S):
    m = list(re.finditer(patron, h, flags))
    if len(m) != 1:
        raise SystemExit(f'Se esperaba 1 coincidencia y hay {len(m)}: {patron[:80]!r}')
    g = m[0]
    texto = nuevo
    for n in (1, 2):
        if f'\\{n}' in texto:
            texto = texto.replace(f'\\{n}', g.group(n))
    return h[:g.start()] + texto + h[g.end():]


def foto(slug, carpeta, nombre, etiqueta):
    """Ruta pública de la foto del hueco. Si aún no existe, crea un marcador SVG."""
    for ext in ('webp', 'jpg', 'jpeg', 'png'):
        if os.path.exists(os.path.join(carpeta, f'{nombre}.{ext}')):
            return f'/{slug}/{nombre}.{ext}'
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="#E6E1D8"/>'
           f'<rect x="24" y="24" width="1552" height="952" fill="none" stroke="#B9AF9E" stroke-width="6" stroke-dasharray="28 20"/>'
           f'<text x="800" y="470" text-anchor="middle" font-family="Arial, sans-serif" font-size="64" fill="#6B6255">FOTO PENDIENTE</text>'
           f'<text x="800" y="560" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" fill="#6B6255">{html.escape(etiqueta)}</text></svg>')
    with open(os.path.join(carpeta, f'{nombre}.svg'), 'w', encoding='utf-8') as f:
        f.write(svg)
    return f'/{slug}/{nombre}.svg'


def generar(slug, m, home):
    carpeta = os.path.join(RAIZ, slug)
    os.makedirs(carpeta, exist_ok=True)
    url = f'{DOM}/{slug}/'
    h = home

    # ---------- cabecera ----------
    h = uno(h, '<title>Importación de coches desde Alemania | Orozco Import</title>', f'<title>{m["title"]}</title>')
    h = sub_re(h, r'<meta name="description" content="[^"]*" />', f'<meta name="description" content="{m["description"]}" />')
    h = uno(h, '<link rel="canonical" href="https://orozcoimport.es/" />', f'<link rel="canonical" href="{url}" />')
    if BORRADOR:
        h = uno(h, '<meta name="robots" content="index, follow" />', '<meta name="robots" content="noindex, nofollow" />')
    h = sub_re(h, r'<meta property="og:title" content="[^"]*" />', f'<meta property="og:title" content="{m["title"]}" />')
    h = sub_re(h, r'<meta property="og:description" content="[^"]*" />', f'<meta property="og:description" content="{m["og_description"]}" />')
    h = uno(h, '<meta property="og:url" content="https://orozcoimport.es/" />', f'<meta property="og:url" content="{url}" />')
    og = foto(slug, carpeta, 'og', f'Portada para compartir {m["marca"]} (1200×630)')
    if not og.endswith('.svg'):
        h = uno(h, '<meta property="og:image" content="https://orozcoimport.es/og/home.jpg" />', f'<meta property="og:image" content="{DOM}{og}" />')

    # ---------- hero ----------
    h = uno(h, '<span>Desde 2017 · <span class="oi-num">+400</span> importaciones</span>',
            f'<span>{m["nombre_largo"]} desde Alemania · <span class="oi-num">+400</span> importaciones</span>')
    h = sub_re(h, r'(<h1 class="oi-hero__title oi-display">).*?(</h1>)',
               f'\\1\n          Importa tu {m["marca"]}<br>\n          <span class="oi-hero__title-accent">desde Alemania</span><br>\n          con total seguridad.\n        \\2')
    h = sub_re(h, r'(<p class="oi-hero__subtitle">).*?(</p>)', f'\\1\n          {m["subtitulo"]}\n        \\2')
    tarjetas = []
    casos = list(m['casos'])
    for i in range(CASOS_EXTRA):
        casos.append((foto(slug, carpeta, f'caso-{i + 1}', f'Caso real {m["marca"]} {i + 1}'), f'Caso real {m["marca"]}', 'Nombre · Ciudad', '—'))
    for i, (src, modelo, cliente, ahorro) in enumerate(casos):
        tarjetas.append(f'''              <article class="oi-fan__card" data-index="{i}">
                <div class="oi-fan__card-photo">
                  <img src="{src}" alt="{modelo} importado desde Alemania" loading="lazy" />
                  <span class="oi-fan__card-saving"><span class="oi-fan__card-saving-label">Ahorro</span><span class="oi-num">{ahorro}</span></span>
                </div>
                <div class="oi-fan__card-info">
                  <p class="oi-fan__card-model">{modelo}</p>
                  <p class="oi-fan__card-client">{cliente}</p>
                </div>
              </article>''')
    h = sub_re(h, r'(<div class="oi-fan__stage" id="oi-fan-stage">).*?(\s*</div>\s*<div class="oi-fan__surface")',
               '\\1\n' + '\n'.join(tarjetas) + '\n            \\2')

    # ---------- por qué + modelos ----------
    s = h.find('<section class="oi-why">')
    e = h.find('</section>', s) + len('</section>')
    why = h[s:e]
    iconos = re.findall(r'<div class="oi-why__item-icon" aria-hidden="true">.*?</div>', why, re.S)
    items = []
    for i, (tit, txt) in enumerate(m['why']):
        delay = f' style="transition-delay:{i / 10:.1f}s"' if i else ''
        items.append(f'''      <article class="oi-why__item oi-reveal"{delay}>
        {iconos[i]}
        <h3 class="oi-why__item-title">{tit}</h3>
        <p class="oi-why__item-text">{txt}</p>
      </article>''')
    why_nuevo = f'''<section class="oi-why">
  <div class="oi-why__container">
    <header class="oi-why__header oi-reveal">
      <p class="oi-eyebrow">{m["why_eyebrow"]}</p>
      <h2 class="oi-why__title oi-display">
        {m["why_title"]}
      </h2>
      <p class="oi-why__lead">
        {m["why_lead"]}
      </p>
    </header>

    <div class="oi-why__grid">
{chr(10).join(items)}
    </div>
  </div>
</section>'''
    tarjetas_mod = []
    for i, (archivo, nombre, txt) in enumerate(m['modelos']):
        src = foto(slug, carpeta, archivo, nombre)
        delay = f' style="transition-delay:{(i % 3) / 10:.1f}s"' if i % 3 else ''
        tarjetas_mod.append(f'''      <article class="oi-models__card oi-reveal"{delay}>
        <div class="oi-models__photo"><img src="{src}" alt="{nombre} importado desde Alemania" loading="lazy" /></div>
        <div class="oi-models__info">
          <h3 class="oi-models__name">{nombre}</h3>
          <p class="oi-models__text">{txt}</p>
        </div>
      </article>''')
    modelos = f'''

<!-- ============================================================
     MODELOS
     ============================================================ -->

<section class="oi-models" id="modelos">
  <div class="oi-models__container">
    <header class="oi-models__header oi-reveal">
      <p class="oi-eyebrow">{m["modelos_eyebrow"]}</p>
      <h2 class="oi-models__title oi-display">
        {m["modelos_title"]}
      </h2>
    </header>
    <div class="oi-models__grid">
{chr(10).join(tarjetas_mod)}
    </div>
    <div class="oi-models__cta oi-reveal">
      <a href="#contacto" class="oi-cta-primary"><span>¿Buscas otro {m["marca"]}? Cuéntanos</span></a>
    </div>
  </div>
</section>'''
    h = h[:s] + why_nuevo + modelos + h[e:]
    i = h.find('</style>')
    h = h[:i] + CSS_MODELOS + h[i:]

    # ---------- FAQ: 3 de la marca + pago, inspección y plazos de la home ----------
    fs = h.find('<div class="oi-faq__list">')
    fe = h.find('</section>', fs)
    bloque = h[fs:fe]
    detalles = re.findall(r'<details class="oi-faq__item oi-reveal">.*?</details>', bloque, re.S)
    generales = [detalles[0], detalles[2], detalles[4]]   # pago, inspección, plazos
    lista = []
    for q, a in m['faq']:
        lista.append(f'''      <details class="oi-faq__item oi-reveal">
        <summary class="oi-faq__question">
          <span class="oi-faq__question-num oi-num">00</span>
          <span class="oi-faq__question-text">{q}</span>
          <span class="oi-faq__icon" aria-hidden="true"></span>
        </summary>
        <div class="oi-faq__answer">
          <p>{a}</p>
        </div>
      </details>''')
    lista += generales
    lista = [re.sub(r'oi-faq__question-num oi-num">\d+<', f'oi-faq__question-num oi-num">{i + 1:02d}<', d) for i, d in enumerate(lista)]
    lista_txt = '\n\n'.join(lista)
    fin_lista = bloque.rfind('</details>') + len('</details>')
    h = h[:fs] + '<div class="oi-faq__list">\n\n' + lista_txt + bloque[fin_lista:] + h[fe:]
    h = uno(h, '<em>sobre importar un coche de Alemania.</em>', f'<em>sobre importar un {m["marca"]} de Alemania.</em>')
    faq_ld = []
    for d in lista:
        q = re.search(r'<span class="oi-faq__question-text">(.*?)</span>', d, re.S).group(1)
        a = re.search(r'<div class="oi-faq__answer">\s*(.*?)\s*</div>', d, re.S).group(1)
        faq_ld.append({'@type': 'Question', 'name': t(q), 'acceptedAnswer': {'@type': 'Answer', 'text': t(a)}})

    # ---------- schema: Service + BreadcrumbList + FAQPage ----------
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Service', 'name': f'Importación de {m["nombre_largo"]} desde Alemania', 'serviceType': 'Importación de vehículos',
         'description': f'Búsqueda, inspección física en Alemania, negociación, transporte en camión, ITV y matriculación de un {m["nombre_largo"]} hasta la entrega en España.',
         'brand': {'@type': 'Brand', 'name': m['nombre_largo']},
         'provider': {'@type': 'LocalBusiness', '@id': f'{DOM}/#empresa', 'name': 'Orozco Import', 'url': f'{DOM}/'},
         'areaServed': {'@type': 'Country', 'name': 'España'}, 'url': url},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Inicio', 'item': f'{DOM}/'},
            {'@type': 'ListItem', 'position': 2, 'name': m['marca'], 'item': url}]},
        {'@type': 'FAQPage', 'mainEntity': faq_ld}]}
    ld_txt = json.dumps(ld, ensure_ascii=False, indent=2).replace('\n', '\n  ')
    h = sub_re(h, r'<!-- Schema.org LocalBusiness -->.*?<!-- Schema.org FAQPage.*?</script>',
               f'<!-- Schema.org: servicio, miga de pan y preguntas frecuentes -->\n  <script type="application/ld+json">\n  {ld_txt}\n  </script>')

    # ---------- formulario ----------
    h = uno(h, '<h2 class="oi-form__title oi-display">Importa tu coche desde Alemania.</h2>',
            f'<h2 class="oi-form__title oi-display">{m["form_title"]}</h2>')
    h = uno(h, 'placeholder="Marca, modelo y cualquier detalle que tengas claro"', f'placeholder="{m["placeholder"]}"')

    # ---------- footer ----------
    h = sub_re(h, r'(<div class="oi-footer__seo-text">\s*<p>).*?(</p>)', f'\\1{m["seo_text"]}\\2')
    h = footer_marcas(h)
    # enlaces internos de la home que ahora son anclas de esta página
    h = h.replace('href="#servicios"', 'href="/#servicios"')

    with open(os.path.join(carpeta, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(h)
    for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
        json.loads(b)
    return casos, m['modelos']


def footer_marcas(h):
    """Añade la columna "Importa por marca" al footer (antes de "Información")."""
    if 'aria-label="Marcas"' in h:
        return h
    enlaces = '\n'.join(f'          <a href="{u}" class="oi-footer__link">{txt}</a>' for u, txt in ENLACES_MARCA)
    col = f'''<div class="oi-footer__links-col">
        <p class="oi-footer__links-title">Importa por marca</p>
        <nav aria-label="Marcas">
{enlaces}
        </nav>
      </div>

      <div class="oi-footer__links-col">
        <p class="oi-footer__links-title">Información</p>'''
    h = uno(h, '<div class="oi-footer__links-col">\n        <p class="oi-footer__links-title">Información</p>', col)
    h = h.replace('          <a href="/golf-gti/" class="oi-footer__link">Importar un Golf GTI de Alemania</a>\n          <a href="/privacidad"', '          <a href="/privacidad"')
    h = uno(h, '.oi-footer__top { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 48px; margin-bottom: 48px; }',
            '.oi-footer__top { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: 40px; margin-bottom: 48px; }')
    return h


HOME_MARCAS = [
    ('/bmw/', '/landing/caso-7.jpg', 'BMW', 'Serie 1, Serie 3, Serie 4, X1, X3 y más.'),
    ('/mercedes/', '/landing/caso-8.jpg', 'Mercedes-Benz', 'Clase A, Clase C, CLA, GLA, GLC y más.'),
    ('/audi/', '/caso-9.jpg', 'Audi', 'A3, A4, A5, Q3, Q5 y más.'),
    ('/golf-gti/', '/golf-gti/gti_performance_1.jpeg', 'Golf GTI', 'Performance, Clubsport y TCR.'),
]


def home_con_marcas(home):
    """Home + bloque "Importa por marca" (antes de las FAQ) + columna de marcas en el footer."""
    h = home
    if 'id="marcas"' not in h:
        tarjetas = '\n'.join(f'''      <a href="{u}" class="oi-models__card oi-models__card--link oi-reveal">
        <div class="oi-models__photo"><img src="{img}" alt="{n} importado desde Alemania" loading="lazy" /></div>
        <div class="oi-models__info">
          <h3 class="oi-models__name">Importar un {n} de Alemania</h3>
          <p class="oi-models__text">{txt}</p>
        </div>
      </a>''' for u, img, n, txt in HOME_MARCAS)
        seccion = f'''<!-- ============================================================
     IMPORTA POR MARCA
     ============================================================ -->

<section class="oi-models oi-models--marcas" id="marcas">
  <div class="oi-models__container">
    <header class="oi-models__header oi-reveal">
      <p class="oi-eyebrow">Importa por marca</p>
      <h2 class="oi-models__title oi-display">
        ¿Ya sabes qué marca buscas?<br>
        <em>Así lo hacemos con la tuya.</em>
      </h2>
    </header>
    <div class="oi-models__grid">
{tarjetas}
    </div>
  </div>
</section>


'''
        i = h.find('<section class="oi-faq" id="preguntas-frecuentes">')
        i = h.rfind('<!-- ====', 0, i)
        h = h[:i] + seccion + h[i:]
        css = CSS_MODELOS + """.oi-models--marcas .oi-models__card { flex-basis: calc((100% - 60px) / 4); text-decoration: none; color: inherit; transition: border-color .3s, transform .3s; }
.oi-models--marcas .oi-models__card:hover { border-color: var(--oi-gold); transform: translateY(-2px); }
@media (max-width: 900px) { .oi-models--marcas .oi-models__card { flex-basis: calc((100% - 20px) / 2); } }
@media (max-width: 600px) { .oi-models--marcas .oi-models__card { flex-basis: 100%; } }
"""
        j = h.find('</style>')
        h = h[:j] + css + h[j:]
    return footer_marcas(h)


if __name__ == '__main__':
    with open(os.path.join(RAIZ, 'index.html'), encoding='utf-8') as f:
        home = f.read()
    for slug, m in MARCAS.items():
        casos, modelos = generar(slug, m, home)
        pend = [n for n in os.listdir(os.path.join(RAIZ, slug)) if n.endswith('.svg')]
        print(f'/{slug}/: {len(pend)} fotos pendientes -> {", ".join(sorted(pend))}')
    import sys
    if '--home' in sys.argv:
        with open(os.path.join(RAIZ, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(home_con_marcas(home))
        print('home: bloque "Importa por marca" y columna del footer añadidos')
