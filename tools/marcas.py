#!/usr/bin/env python3
"""Genera las páginas por marca (/bmw/, /mercedes/, /audi/) con el diseño de las guías (guias/a/guia.css).

Uso (desde la raíz del repo):
  python3 tools/marcas.py              borrador: noindex y huecos de Fran (casos y fotos de modelos)
  python3 tools/marcas.py --lanzar     indexable (solo cuando no quede ningún hueco)

Lo que aporta Fran llega por la página de revisión (panel.orozcoimport.es/revision/?guia=<marca>):
  · caso_extra_1..3  (data-tipo="caso"): casos reales de la marca, con fotos
  · foto_<modelo>    (data-tipo="foto"): una foto real de cada modelo
Cuando Fran rellena un hueco, se integra aquí, en MARCAS, y se vuelve a generar la página.
Un caso con datos completos lleva 'desglose'; uno con solo el ahorro, 'ahorro'.
Un modelo con foto lleva 'foto' (ruta pública de la imagen 640 px, webp).
"""
import html
import json
import os
import sys

from PIL import Image

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sites', 'orozcoimport.es'))
DOM = 'https://orozcoimport.es'
BORRADOR = '--lanzar' not in sys.argv
HOY = '2026-11-17'
CASOS_EXTRA = 3

FIJOS = [('Transporte en camión', 'Asegurado, puerta a puerta', '1.000–1.300 €'),
         ('Impuesto de matriculación', 'Según las emisiones de CO₂', '0 a 14,75 %'),
         ('ITV, tasas y placas', 'Las coordinamos nosotros', '≈ 300 €'),
         ('Revisión del perito', 'En persona, en Alemania', '≈ 300 €'),
         ('Servicio completo', '1.300 € + IVA', '1.573 €')]

MARCAS = {
    'bmw': {
        'marca': 'BMW', 'largo': 'BMW', 'iedmt': 'BMW', 'og_src': 'landing/caso-7.jpg',
        'title': 'Importar un BMW de Alemania (2026) | Orozco Import',
        'description': 'Tu BMW desde Alemania con matrícula española: lo buscamos, un perito lo revisa en persona y coordinamos todo. Casos reales y lo que cuesta.',
        'og_title': 'Importa tu BMW desde Alemania, con ahorro real',
        'h1_em': 'Más donde elegir, mejor equipado y con ahorro real.',
        'entradilla': 'Alemania es el mercado de origen de BMW: hay muchas más unidades, más versiones y mejor equipadas que en España. Te buscamos la tuya, un perito la revisa en persona y te la dejamos en casa con matrícula española.',
        'respuesta': 'Traer un BMW de Alemania compensa sobre todo en coches de más de 20.000 € y en versiones bien equipadas (M Sport, motores de gama alta, híbridos enchufables). Además del precio del coche cuenta con <strong>unos 3.300 € de costes fijos</strong> y el impuesto de matriculación, que va del 0 % al 14,75 % según las emisiones. Nuestros clientes con BMW han ahorrado entre <strong>3.800 € y 4.800 €</strong> frente al mismo coche en España, con todo incluido.',
        'razones': [
            ('El mercado de origen de la marca', 'Hay muchas más unidades de BMW de ocasión en Alemania, así que es más fácil dar con la versión, el motor y el color exactos que buscas.'),
            ('Equipamiento que aquí cuesta encontrar', 'Paquete M Sport, Head-Up Display, techo panorámico o asientos confort aparecen con mucha más frecuencia en unidades alemanas.'),
            ('Historial de servicio verificable', 'La mayoría pasan sus revisiones en la red oficial BMW. Comprobamos el historial de mantenimiento antes de proponerte el coche.'),
        ],
        'modelos': [
            ('serie-3', 'BMW Serie 3', 'Berlina y Touring, de gasolina, diésel o híbrido enchufable. Es el BMW que más nos piden.'),
            ('serie-4', 'BMW Serie 4', 'Coupé, Cabrio y Gran Coupé. En Alemania hay mucha más oferta con paquete M Sport.'),
            ('serie-1', 'BMW Serie 1', 'El compacto premium de BMW, también en versión deportiva M135i.'),
            ('x1', 'BMW X1', 'SUV compacto, con tracción xDrive y versiones híbridas enchufables.'),
            ('x3', 'BMW X3', 'El SUV medio de BMW, con muchas más combinaciones de motor y equipamiento.'),
        ],
        'casos': [
            {'modelo': 'BMW 330i M Sport', 'meta': 'Ander · Bilbao · 2025 · 10.000 km', 'img': '/guias/a/caso-bmw-330i-640.webp', 'w': 640, 'h': 853,
             'alt': 'BMW 330i M Sport importado de Alemania para Ander, de Bilbao', 'tag': 'Alemania → Bilbao',
             'desglose': [('Coche en Alemania', '34.000 €'), ('Transporte', '1.100 €'), ('Impuestos y tasas', '3.100 €'), ('Revisión del perito', '300 €'), ('Servicio', '1.573 €')],
             'total': '40.073 €', 'espana': '44.873 €', 'ahorro': '4.800 €'},
            {'modelo': 'BMW Serie 1', 'meta': 'Eric · Bilbao', 'src': 'landing/caso-4.jpg', 'foto': 'caso-serie-1',
             'alt': 'BMW Serie 1 negro importado de Alemania para Eric, de Bilbao', 'tag': 'Alemania → Bilbao', 'ahorro': '3.900 €'},
            {'modelo': 'BMW X4 30d', 'meta': 'Sole · Madrid', 'src': 'landing/caso-7.jpg', 'foto': 'caso-x4',
             'alt': 'BMW X4 30d plateado importado de Alemania para Sole, de Madrid', 'tag': 'Alemania → Madrid', 'ahorro': '3.800 €'},
        ],
        'faq_modelos': 'Los que más nos piden son el <strong>Serie 3, Serie 4, Serie 1, X1 y X3</strong>. Donde más se nota la diferencia es en versiones bien equipadas (M Sport, motores de gama alta, híbridos enchufables) y en modelos con poca oferta en España. Si nos dices qué buscas, te decimos si merece la pena traerlo.',
        'placeholder': 'https://www.mobile.de/…',
        'ayuda': '¿Aún no tienes anuncio? Escribe modelo y versión, por ejemplo «BMW 320d Touring M Sport».',
    },
    'mercedes': {
        'marca': 'Mercedes', 'largo': 'Mercedes-Benz', 'iedmt': 'MERCEDES', 'og_src': 'landing/caso-8.jpg',
        'title': 'Importar un Mercedes de Alemania (2026) | Orozco Import',
        'description': 'Tu Mercedes-Benz desde Alemania con matrícula española: lo buscamos, un perito lo revisa en persona y coordinamos todo. Casos reales y costes.',
        'og_title': 'Importa tu Mercedes desde Alemania, con ahorro real',
        'h1_em': 'Más donde elegir, mejor equipado y con ahorro real.',
        'entradilla': 'Alemania es el mercado de origen de Mercedes-Benz: hay muchas más unidades, más versiones y mejor equipadas que en España. Te buscamos el tuyo, un perito lo revisa en persona y te lo dejamos en casa con matrícula española.',
        'respuesta': 'Traer un Mercedes de Alemania compensa sobre todo en coches de más de 20.000 € y en versiones bien equipadas (AMG Line, híbridos enchufables, motores de gama alta). Además del precio del coche cuenta con <strong>unos 3.300 € de costes fijos</strong> y el impuesto de matriculación, que va del 0 % al 14,75 % según las emisiones. Nuestros clientes con Mercedes han ahorrado entre <strong>2.000 € y 5.477 €</strong> frente al mismo coche en España, con todo incluido.',
        'razones': [
            ('El mercado de origen de la marca', 'Hay muchas más unidades de Mercedes de ocasión en Alemania, así que es más fácil dar con la versión, el motor y el color exactos que buscas.'),
            ('AMG Line e híbridos enchufables', 'Acabado AMG Line, paquete Night, sonido Burmester o versiones híbridas enchufables aparecen con mucha más frecuencia en unidades alemanas.'),
            ('Historial de servicio verificable', 'La mayoría pasan sus revisiones en la red oficial Mercedes-Benz. Comprobamos el historial de mantenimiento antes de proponerte el coche.'),
        ],
        'modelos': [
            ('clase-c', 'Mercedes Clase C', 'Berlina y Estate, de gasolina, diésel o híbrido enchufable.'),
            ('cla', 'Mercedes CLA', 'Coupé de cuatro puertas y Shooting Brake, también en híbrido enchufable 250e.'),
            ('clase-a', 'Mercedes Clase A', 'Compacto y berlina, con acabado AMG Line y sistema MBUX.'),
            ('gla', 'Mercedes GLA', 'SUV compacto, con versiones híbridas enchufables.'),
            ('glc', 'Mercedes GLC', 'SUV y Coupé, con muchas más combinaciones de motor y equipamiento.'),
        ],
        'casos': [
            {'modelo': 'Mercedes CLA 250e AMG', 'meta': 'Fabián G. · Valencia · 2024 · 12.000 km', 'img': '/guias/a/fabian-cla-640.webp', 'w': 640, 'h': 427,
             'alt': 'Mercedes CLA 250e AMG importado de Alemania para Fabián, de Valencia', 'tag': 'Hamburgo → Valencia',
             'desglose': [('Coche en Alemania', '33.250 €'), ('Transporte', '1.100 €'), ('Impuestos y tasas', '300 €'), ('Revisión del perito', '300 €'), ('Servicio', '1.573 €')],
             'total': '36.523 €', 'espana': '42.000 €', 'ahorro': '5.477 €'},
            {'modelo': 'Mercedes C200 AMG', 'meta': 'Enrique · Sevilla', 'src': 'landing/caso-8.jpg', 'foto': 'caso-c200',
             'alt': 'Mercedes C200 AMG gris importado de Alemania para Enrique, de Sevilla', 'tag': 'Alemania → Sevilla', 'ahorro': '2.000 €'},
        ],
        'faq_modelos': 'Los que más nos piden son la <strong>Clase C, CLA, Clase A, GLA y GLC</strong>. Donde más se nota la diferencia es en versiones bien equipadas (AMG Line, híbridos enchufables) y en modelos con poca oferta en España. Si nos dices qué buscas, te decimos si merece la pena traerlo.',
        'placeholder': 'https://www.mobile.de/…',
        'ayuda': '¿Aún no tienes anuncio? Escribe modelo y versión, por ejemplo «Mercedes C 300e AMG Line».',
    },
    'audi': {
        'marca': 'Audi', 'largo': 'Audi', 'iedmt': 'AUDI', 'og_src': 'landing/caso-3.jpg',
        'title': 'Importar un Audi de Alemania (2026) | Orozco Import',
        'description': 'Tu Audi desde Alemania con matrícula española: lo buscamos, un perito lo revisa en persona y coordinamos todo. Casos reales y lo que cuesta.',
        'og_title': 'Importa tu Audi desde Alemania, con ahorro real',
        'h1_em': 'Más donde elegir, mejor equipado y con ahorro real.',
        'entradilla': 'Alemania es el mercado de origen de Audi: hay muchas más unidades, más versiones y mejor equipadas que en España. Te buscamos el tuyo, un perito lo revisa en persona y te lo dejamos en casa con matrícula española.',
        'respuesta': 'Traer un Audi de Alemania compensa sobre todo en coches de más de 20.000 € y en versiones bien equipadas (S line, quattro, modelos S y RS). Además del precio del coche cuenta con <strong>unos 3.300 € de costes fijos</strong> y el impuesto de matriculación, que va del 0 % al 14,75 % según las emisiones. Nuestros clientes con Audi han ahorrado entre <strong>4.700 € y 6.900 €</strong> frente al mismo coche en España, con todo incluido.',
        'razones': [
            ('El mercado de origen de la marca', 'Hay muchas más unidades de Audi de ocasión en Alemania, así que es más fácil dar con la versión, el motor y el color exactos que buscas.'),
            ('quattro, S line y Matrix LED', 'Tracción quattro, acabado S line, faros Matrix LED o Virtual Cockpit aparecen con mucha más frecuencia en unidades alemanas.'),
            ('Historial de servicio verificable', 'La mayoría pasan sus revisiones en la red oficial Audi. Comprobamos el historial de mantenimiento antes de proponerte el coche.'),
        ],
        'modelos': [
            ('a4', 'Audi A4', 'Berlina y Avant, con muchas más unidades quattro en Alemania.'),
            ('a5', 'Audi A5', 'Sportback, Coupé y Cabrio, con acabado S line.'),
            ('a3', 'Audi A3', 'Sportback y Sedán, de gasolina, diésel o híbrido enchufable.'),
            ('q3', 'Audi Q3', 'SUV compacto y Sportback, con acabado S line.'),
            ('q5', 'Audi Q5', 'SUV y Sportback, con tracción quattro e híbridos enchufables.'),
        ],
        'casos': [
            {'modelo': 'Audi TT RS', 'meta': 'Miguel L. · Barcelona', 'src': 'landing/caso-3.jpg', 'foto': 'caso-tt-rs',
             'alt': 'Audi TT RS amarillo importado de Alemania para Miguel, de Barcelona', 'tag': 'Alemania → Barcelona', 'ahorro': '6.900 €'},
            {'modelo': 'Audi A4 Avant', 'meta': 'Mario · Burgos', 'src': 'caso-9.jpg', 'foto': 'caso-a4-avant',
             'alt': 'Mario recoge su Audi A4 Avant importado de Alemania', 'tag': 'Alemania → Burgos', 'ahorro': '4.700 €'},
        ],
        'faq_modelos': 'Los que más nos piden son el <strong>A4, A5, A3, Q3 y Q5</strong>. Donde más se nota la diferencia es en versiones bien equipadas (S line, quattro, motores de gama alta) y en modelos S y RS con poca oferta en España. Si nos dices qué buscas, te decimos si merece la pena traerlo.',
        'placeholder': 'https://www.mobile.de/…',
        'ayuda': '¿Aún no tienes anuncio? Escribe modelo y versión, por ejemplo «Audi A4 Avant S line quattro».',
    },
}

e = lambda s: html.escape(s, quote=True)


def foto_caso(slug, c):
    """Pasa la foto del caso (jpg del repo) a webp 640 px dentro de la carpeta de la marca."""
    dst = os.path.join(RAIZ, slug, c['foto'] + '-640.webp')
    im = Image.open(os.path.join(RAIZ, c['src'])).convert('RGB')
    if im.width > 640:
        im = im.resize((640, round(im.height * 640 / im.width)), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=80, method=6)
    c.update(img=f'/{slug}/{c["foto"]}-640.webp', w=im.width, h=im.height)


def og(slug, src):
    """Imagen para redes: la foto de un caso real recortada a 1200×630."""
    im = Image.open(os.path.join(RAIZ, src)).convert('RGB')
    r = max(1200 / im.width, 630 / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x, y = (im.width - 1200) // 2, (im.height - 630) // 2
    os.makedirs(os.path.join(RAIZ, 'og'), exist_ok=True)
    im.crop((x, y, x + 1200, y + 630)).save(os.path.join(RAIZ, 'og', f'marca-{slug}.jpg'), 'JPEG', quality=82, optimize=True, progressive=True)


def caso_html(c):
    img = (f'<div class="caso__img"><img src="{c["img"]}" alt="{e(c["alt"])}" loading="lazy" width="{c["w"]}" height="{c["h"]}">'
           f'<span class="tag">{e(c["tag"])}</span></div>')
    if 'desglose' in c:
        filas = ''.join(f'\n              <li><span>{a}</span><span class="mono">{b}</span></li>' for a, b in c['desglose'])
        cuerpo = (f'<ul>{filas}\n              <li class="tot"><span>Total en su casa</span><span class="mono">{c["total"]}</span></li>\n            </ul>\n'
                  f'            <div class="vs"><span>En España: {c["espana"]}</span><b>−{c["ahorro"]}</b></div>')
    else:
        cuerpo = ('<p>Ahorro frente al mismo coche en España, ya contando transporte, impuestos y servicio.</p>\n'
                  f'            <div class="vs"><span>Ahorro final</span><b>−{c["ahorro"]}</b></div>')
    return f'''        <article class="caso">
          {img}
          <div class="caso__body">
            <h3>{e(c["modelo"])}</h3>
            <p class="meta">{e(c["meta"])}</p>
            {cuerpo}
          </div>
        </article>'''


def hueco_caso(m, n):
    preg = (f'Otro caso real de un {m["marca"]} que hayáis traído. Modelo, nombre del cliente, ciudad, año, km, precio en Alemania, '
            'transporte, impuestos, gastos, total y precio del mismo coche en España (si solo sabes el ahorro final, pon eso). '
            'Sube 1 a 3 fotos y confirma que el cliente da permiso para publicarlo.')
    return f'''        <article class="caso" data-campo="caso_extra_{n}" data-tipo="caso" data-pregunta="{e(preg)}">
          <div class="caso__img"><div class="caso__vacia">Foto de otro {e(m["marca"])} que hayáis traído</div></div>
          <div class="caso__body">
            <h3><span class="fran">modelo</span></h3>
            <p class="meta"><span class="fran">nombre · ciudad · año · km</span></p>
            <div class="vs"><span>Ahorro final</span><b><span class="fran">€</span></b></div>
          </div>
        </article>'''


def modelo_html(m, mod):
    slug, nombre, texto = mod[:3]
    foto = mod[3] if len(mod) > 3 else None
    if foto:
        img = f'<div class="mod__img"><img src="{foto}" alt="{e(nombre)} importado de Alemania por Orozco Import" loading="lazy" width="640" height="400"></div>'
        attrs = ''
    else:
        preg = (f'Sube una foto real de un {nombre} que hayáis traído (mejor en horizontal y de 3/4 delantero). '
                'Si se ve la matrícula, la tapamos nosotros.')
        img = f'<div class="mod__img"><div class="caso__vacia">Foto de un {e(nombre)}</div></div>'
        attrs = f' data-campo="foto_{slug.replace("-", "_")}" data-tipo="foto" data-pregunta="{e(preg)}"'
    return f'''        <article class="mod"{attrs}>
          {img}
          <div class="mod__body"><h3>{e(nombre)}</h3><p>{e(texto)}</p></div>
        </article>'''


def faq(m):
    M, L = m['marca'], m['largo']
    ah = [c for c in m['casos']]
    ej = ' y '.join(f'un <strong>{e(c["modelo"])}</strong> para {e(c["meta"].split(" · ")[0])}, de {e(c["meta"].split(" · ")[1])}, con {c["ahorro"]} de ahorro' for c in ah[:2])
    return [
        (f'¿Cuánto se ahorra importando un {M} de Alemania?',
         f'Depende del modelo, la versión y el equipamiento. Dos casos reales: {ej}, ya contando transporte, impuestos, revisión y servicio. Antes de empezar te damos el desglose de tu caso.'),
        (f'¿Qué {M} conviene traer de Alemania?', m['faq_modelos']),
        (f'¿Cuánto cuesta traer un {M} de Alemania además del coche?',
         'Unos 3.300 € de costes fijos: transporte en camión (1.000–1.300 €), ITV, tasas y placas (≈ 300 €), la revisión técnica presencial del perito en Alemania (≈ 300 €) y nuestro servicio (1.300 € + IVA, 1.573 €). A eso se suma el impuesto de matriculación, del 0 % al 14,75 % según las emisiones de CO₂.'),
        (f'¿Un {M} híbrido enchufable paga impuesto de matriculación?',
         'Si sus emisiones homologadas (WLTP) no pasan de 120 g/km de CO₂, no paga impuesto de matriculación. Es el caso de la mayoría de híbridos enchufables, y por eso suelen ser de los coches que más compensa traer.'),
        ('¿Quién se encarga de la ITV y la matriculación?',
         'Los trámites oficiales los realizan el organismo o la empresa autorizada correspondiente. Nosotros los coordinamos para que no tengas que pedir cita ni ir a ningún sitio, y te entregamos el coche con matrícula española.'),
    ]


def ld(slug, m, url, preguntas):
    txt = lambda s: html.unescape(__import__('re').sub('<[^>]+>', '', s))
    g = [
        {'@type': 'Service', '@id': url + '#servicio', 'name': f'Importación de {m["largo"]} desde Alemania',
         'serviceType': 'Importación de coches desde Alemania', 'description': m['description'], 'url': url,
         'image': f'{DOM}/og/marca-{slug}.jpg', 'areaServed': {'@type': 'Country', 'name': 'España'},
         'provider': {'@type': 'Organization', '@id': f'{DOM}/#empresa', 'name': 'Orozco Import', 'url': DOM + '/',
                      'logo': {'@type': 'ImageObject', 'url': f'{DOM}/logo-orozco-import.png'}},
         'offers': {'@type': 'Offer', 'price': '1573', 'priceCurrency': 'EUR',
                    'description': 'Servicio completo: búsqueda, revisión, negociación, transporte coordinado y entrega con matrícula española (1.300 € + IVA)'}},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Inicio', 'item': DOM + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': f'Importar un {m["marca"]} de Alemania', 'item': url}]},
        {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': txt(a)}} for q, a in preguntas]},
    ]
    return json.dumps({'@context': 'https://schema.org', '@graph': g}, ensure_ascii=False, indent=2)


def pagina(slug, m):
    url = f'{DOM}/{slug}/'
    M = m['marca']
    for c in m['casos']:
        if 'src' in c:
            foto_caso(slug, c)
    og(slug, m['og_src'])
    preguntas = faq(m)
    otras = [(s, x['marca']) for s, x in MARCAS.items() if s != slug]
    robots = 'noindex, follow' if BORRADOR else 'index, follow, max-image-preview:large'
    ticket = ''.join(f'\n          <li><span>{e(c["modelo"])}<small>{e(c["meta"].split(" · ")[0])} · {e(c["meta"].split(" · ")[1])}</small></span><span class="mono ah">−{c["ahorro"]}</span></li>' for c in m['casos'])
    fijos = ''.join(f'\n          <tr><td>{a}<br><small>{b}</small></td><td class="mono">{c}</td></tr>' for a, b, c in FIJOS)
    razones = ''.join(f'\n        <li><span><b>{e(a)}.</b> {e(b)}</span></li>' for a, b in m['razones'])
    modelos = '\n'.join(modelo_html(m, x) for x in m['modelos'])
    casos = '\n'.join([caso_html(c) for c in m['casos']] + [hueco_caso(m, n) for n in range(1, CASOS_EXTRA + 1)])
    faqs = ''.join(f'\n        <details><summary>{e(q)}</summary><div><p>{a}</p></div></details>' for q, a in preguntas)
    rel_marcas = ''.join(f'\n      <a href="/{s}/"><small>Por marca</small><b>Importar un {n} de Alemania</b></a>' for s, n in otras)
    nav_marcas = ''.join(f'<a href="/{s}/">{n}</a>' for s, n in otras)
    garantia = (f'La garantía de fábrica de {m["largo"]} es europea: si el coche todavía la tiene, <strong>sigue siendo válida en España</strong> '
                'en cualquier taller oficial de la marca. Lo comprobamos antes de que pagues el coche.')
    preg_gar = f'¿Es correcto lo que decimos de la garantía oficial de {m["largo"]} en un coche importado de Alemania? Si hay algún matiz (extensiones de garantía, contratos de mantenimiento…), corrígelo.'

    plantilla = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'marca.html'), encoding='utf-8').read()
    reemplazos = {
        'TITLE': e(m['title']), 'DESC': e(m['description']), 'ROBOTS': robots, 'URL': url, 'SLUG': slug,
        'OG_TITLE': e(m['og_title']), 'LD': ld(slug, m, url, preguntas), 'M': M, 'LARGO': m['largo'], 'H1_EM': e(m['h1_em']),
        'ENTRADILLA': e(m['entradilla']), 'TICKET': ticket, 'RESPUESTA': m['respuesta'], 'RAZONES': razones,
        'MODELOS': modelos, 'CASOS': casos, 'FIJOS': fijos, 'IEDMT': m['iedmt'], 'GARANTIA': garantia, 'PREG_GAR': e(preg_gar),
        'FAQS': faqs, 'AYUDA': e(m['ayuda']), 'REL_MARCAS': rel_marcas, 'NAV_MARCAS': nav_marcas,
    }
    out = plantilla
    for k, v in reemplazos.items():
        out = out.replace('{{' + k + '}}', v)
    assert '{{' not in out, out[out.index('{{'):out.index('{{') + 40]
    with open(os.path.join(RAIZ, slug, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(out)
    print(f'✓ /{slug}/  ({"borrador, noindex" if BORRADOR else "indexable"})')


if __name__ == '__main__':
    for s, m in MARCAS.items():
        os.makedirs(os.path.join(RAIZ, s), exist_ok=True)
        pagina(s, m)
