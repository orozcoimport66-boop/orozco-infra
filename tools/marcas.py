#!/usr/bin/env python3
"""Genera las páginas por modelo y por marca (/golf-gti/, /bmw/, /mercedes/, /audi/) a partir de la home.

Uso (desde la raíz del repo):
  python3 tools/marcas.py                 genera todas (las marcas como borrador, con noindex)
  python3 tools/marcas.py --lanzar bmw    genera y deja /bmw/ indexable (solo cuando no quede ningún hueco)

La plantilla es la home (sites/orozcoimport.es/index.html): se reutilizan su estilo, scripts, cabecera,
proceso, testimonios, los tres filtros de la inspección, formulario, pie y panel de reseñas. Si la home
cambia, basta con volver a ejecutar este script. Por página cambian: SEO y JSON-LD, hero y casos,
por qué importar (con las barras de un caso real si hay desglose), una sección de modelos o versiones,
los casos del carrusel, el ejemplo de la inspección, las preguntas frecuentes y el cierre.

Lo que aporta Fran llega por la página de revisión (panel.orozcoimport.es/revision/?guia=<slug>):
  · caso_extra_1..3  (data-tipo="caso"): casos reales, con fotos
  · foto_<modelo>    (data-tipo="foto"): una foto real de cada modelo
  · garantia_confirmar (data-tipo="confirmar")
Se integran en el diccionario PAGINAS (un caso nuevo va en 'casos', una foto de modelo como 'foto' del modelo)
y se vuelve a ejecutar el script. Las fotos van en sites/orozcoimport.es/<slug>/ en webp.
"""
import html
import json
import os
import re
import sys

from PIL import Image

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sites', 'orozcoimport.es'))
DOM = 'https://orozcoimport.es'
LANZAR = set(sys.argv[sys.argv.index('--lanzar') + 1:]) if '--lanzar' in sys.argv else set()
CASOS_EXTRA = 3
e = lambda s: html.escape(s, quote=True)
txt = lambda s: re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', '', s))).strip()

# ---------------------------------------------------------------- datos

# Casos con desglose completo (los confirmó Fran en la guía de costes)
ANDER = {'quien': 'Ander, de Bilbao', 'modelo': 'BMW 330i M Sport', 'espana': 44873,
         'partidas': [('Coche', 34000), ('Transporte', 1100), ('Impuestos y tasas', 3100), ('Revisión del perito', 300), ('Servicio', 1573)]}
FABIAN = {'quien': 'Fabián, de Valencia', 'modelo': 'Mercedes CLA 250e AMG', 'espana': 42000,
          'partidas': [('Coche', 33250), ('Transporte', 1100), ('Impuestos y tasas', 300), ('Revisión del perito', 300), ('Servicio', 1573)]}

# Casos que no están en el carrusel de la home (los de la home se copian tal cual, por su modelo)
CASOS_NUEVOS = {
    'BMW 330i M Sport': dict(img='/guias/a/caso-bmw-330i-640.webp', de='Alemania', a='Bilbao', quien='Ander', anio='2025', ahorro='4.800€'),
    'Mercedes CLA 250e AMG': dict(img='/guias/a/fabian-cla-640.webp', de='Hamburgo', a='Valencia', quien='Fabián', anio='2024', ahorro='5.477€'),
}

FAQ_PAGO = ('¿Cómo se realiza el pago del vehículo?',
            'El pago del vehículo se hace <strong>directamente al vendedor en Alemania</strong>, nunca a nosotros. Tú mantienes el control de tu dinero en todo momento. A Orozco Import solo nos pagas el servicio, con condiciones claras desde el primer contacto.')
FAQ_COSTES = ('¿Cuánto cuesta traer un {M} de Alemania además del coche?',
              'Unos <span class="oi-num">3.300€</span> de costes fijos: transporte en camión (<span class="oi-num">1.000€</span> a <span class="oi-num">1.300€</span>), ITV, tasas y placas (unos <span class="oi-num">300€</span>), la revisión del perito en persona en Alemania (unos <span class="oi-num">300€</span>) y nuestro servicio (<span class="oi-num">1.300€</span> + IVA). A eso se suma el impuesto de matriculación, del 0 % al 14,75 % según las emisiones de CO₂. Lo tienes partida a partida en nuestra guía <a href="/guias/cuanto-cuesta-traer-coche-alemania/">cuánto cuesta traer un coche de Alemania</a>, con una calculadora del impuesto.')
FAQ_PLAZO = ('¿Cuánto tiempo tarda todo el proceso?',
             'El plazo habitual es de entre <span class="oi-num">14</span> y <span class="oi-num">21</span> días desde la firma de la compra hasta la entrega en tu provincia, según la ubicación del coche en Alemania y la comunidad autónoma de destino. Te informamos en cada paso.')
FAQ_ITV = ('¿Quién se encarga de la ITV y la matriculación?',
           'Los trámites oficiales los realizan el organismo o la empresa autorizada correspondiente. Nosotros los <strong>coordinamos</strong> para que no tengas que pedir cita ni ir a ningún sitio, y el coche te llega con matrícula española.')


def faq_garantia(largo):
    return (f'¿Se mantiene la garantía oficial de {largo} en España?',
            f'<span class="rev" data-campo="garantia_confirmar" data-tipo="confirmar" data-pregunta="{e("¿Es correcto lo que decimos de la garantía oficial de " + largo + " en un coche importado de Alemania? Si hay algún matiz (extensiones de garantía, contratos de mantenimiento…), corrígelo.")}">'
            f'Sí. La garantía de fábrica de {largo} es europea: si el coche todavía la tiene, <strong>sigue siendo válida en España</strong> en cualquier taller oficial de la marca. Lo comprobamos antes de que pagues el coche.</span>')


def faq_phev(M):
    return (f'¿Un {M} híbrido enchufable paga impuesto de matriculación?',
            'Si sus emisiones homologadas (WLTP) no pasan de <span class="oi-num">120</span> g/km de CO₂, no paga impuesto de matriculación. Es el caso de la mayoría de híbridos enchufables, y por eso suelen ser de los coches que más compensa traer.')


PAGINAS = {
    'golf-gti': {
        'M': 'Golf GTI', 'corto': 'GTI', 'largo': 'Volkswagen Golf GTI', 'ejemplo': 'Golf GTI Performance',
        'title': 'Importar un Golf GTI de Alemania (2026) | Orozco Import',
        'description': 'Tu Golf GTI desde Alemania: lo buscamos, un perito lo revisa en persona antes de que pagues y lo recibes en tu puerta. Performance, Clubsport y TCR.',
        'og_title': 'Importa tu Golf GTI de Alemania con alguien que mira por ti', 'og_image': 'og/golf-gti.jpg',
        'eyebrow': 'Especialistas en Golf GTI · desde 2017',
        'h1': 'Importa tu Golf GTI de Alemania', 'h1_em': 'con alguien que mira por ti.',
        'subtitulo': 'Sabemos lo que sientes por el GTI. Lo buscamos, lo revisamos en persona en Alemania antes de que pagues nada y te decimos la verdad, aunque sea un «este no». Tú lo recibes en tu puerta.',
        'hero_bg': '/golf-gti/hero_gti.jpg',
        'fan': [('/golf-gti/gti_performance_cliente_2.jpg', 'GTI Performance', 'Sergio · Madrid', '2.400€'),
                ('/golf-gti/gti_performance_1.jpeg', 'GTI TCR', 'Álvaro · Sevilla', '2.900€'),
                ('/golf-gti/gti_performance_cliente_1.jpg', 'GTI Performance', 'Mario · Burgos', '3.100€'),
                ('/golf-gti/gti_tcr.avif', 'GTI TCR', 'Rubén · Zaragoza', '3.200€'),
                ('/golf-gti/gti_tcr_cliente_2.jpeg', 'GTI TCR', 'Oriol · Madrid', '2.800€'),
                ('/golf-gti/gti_clubsport_2.jpeg', 'GTI Clubsport', 'Iván · Bilbao', '2.600€'),
                ('/golf-gti/gti_clubsport_cliente_1.jpg', 'GTI Clubsport', 'Daniel · Málaga', '3.500€')],
        'fan_hint': 'Arrastra para ver más Golf GTI que ya hemos traído',
        'chips_label': 'Versiones que más traemos', 'chips': ['GTI Performance', 'GTI Clubsport', 'GTI TCR'],
        'why_title': 'El GTI que quieres está en Alemania.', 'why_em': 'Y con mejor precio.',
        'why_lead': 'El Golf GTI se vende mucho más en Alemania que en España. Allí hay muchas más unidades de ocasión, sobre todo de las versiones más buscadas, y eso se nota en lo que puedes elegir y en lo que pagas.',
        'barras': None,
        'razones': [('Clubsport y TCR que aquí casi no se ven', 'Las versiones más potentes y de producción más corta apenas aparecen de segunda mano en España. En Alemania hay donde elegir color, equipamiento y kilómetros.'),
                    ('Historial verificable', 'La mayoría pasan sus revisiones en la red oficial Volkswagen. Comprobamos el historial de mantenimiento y los kilómetros antes de proponerte el coche.'),
                    ('Ahorro real en el precio final', 'En los últimos GTI que hemos traído, el ahorro ha ido de 2.400€ a 3.500€ frente a una unidad equivalente en España, ya contando transporte e impuestos.')],
        'divisores': ('/golf-gti/asientos_div.jpg', '/golf-gti/volante_div.jpg'),
        'modelos_eyebrow': 'Versiones', 'modelos_title': '¿Performance, Clubsport o TCR?', 'modelos_em': 'Te ayudamos a elegir.',
        'modelos_lead': 'Hemos traído las tres. Si nos dices cómo vas a usar el coche, te decimos cuál te encaja y cuál compensa más traer de Alemania.',
        'modelos': [{'slug': 'performance', 'nombre': 'Golf GTI Performance', 'texto': 'El más fácil de encontrar y el más equilibrado para el día a día. Es el GTI que más nos piden.', 'foto': '/golf-gti/gti_performance_cliente_1.jpg'},
                    {'slug': 'clubsport', 'nombre': 'Golf GTI Clubsport', 'texto': 'Más potencia y un punto más de circuito. De segunda mano se ve poco en España, y ahí Alemania marca la diferencia.', 'foto': '/golf-gti/gti_clubsport_2.jpeg'},
                    {'slug': 'tcr', 'nombre': 'Golf GTI TCR', 'texto': 'La versión más radical del GTI, de serie corta. En Alemania hay muchas más unidades donde elegir.', 'foto': '/golf-gti/gti_tcr.avif'}],
        'testimonios_gti': True, 'carrusel': [],
        'faq': [('¿Cuánto se ahorra importando un Golf GTI de Alemania?',
                 'En los últimos Golf GTI que hemos traído, el ahorro ha ido de <span class="oi-num">2.400€</span> a <span class="oi-num">3.500€</span> frente a una unidad equivalente en España, ya contando transporte e impuestos: un <strong>GTI Performance</strong> para Sergio (Madrid) con <span class="oi-num">2.400€</span>, un <strong>GTI TCR</strong> para Rubén (Zaragoza) con <span class="oi-num">3.200€</span> o un <strong>GTI Clubsport</strong> para Daniel (Málaga) con <span class="oi-num">3.500€</span>. Antes de empezar te damos el desglose de tu caso.'),
                ('¿Qué Golf GTI conviene traer: Performance, Clubsport o TCR?',
                 'Hemos traído las tres. El <strong>GTI Performance</strong> es el más fácil de encontrar y el más equilibrado para el día a día. El <strong>Clubsport</strong> y el <strong>TCR</strong> son las versiones más potentes y las que menos se ven en España, y es ahí donde Alemania marca más diferencia en oferta y precio. Si nos dices cómo vas a usar el coche, te ayudamos a elegir.'),
                FAQ_PAGO, FAQ_COSTES,
                ('¿Qué se revisa en la inspección y qué pasa si no cumple?',
                 'Cada GTI pasa por tres filtros: el anuncio y el vendedor, la documentación y el historial de accidentes en Europa, y la revisión en persona de un perito en Alemania, con más de <span class="oi-num">200</span> puntos. <strong>De cada <span class="oi-num">5</span> candidatos, <span class="oi-num">4</span> se quedan por el camino.</strong> Si no cumple, no te lo proponemos.'),
                FAQ_PLAZO],
        'form_title': '¿Qué GTI buscas?', 'vehiculo_ph': 'Versión, año, kilómetros o cualquier detalle que tengas claro', 'mensaje_ph': 'Color, acabado, uso habitual...',
        'seo': 'Orozco Import es una empresa española privada de intermediación especializada en la <strong>importación del Golf GTI desde Alemania</strong>, con más de 9 años de experiencia y más de 400 vehículos importados. Buscamos tu Golf GTI (Performance, Clubsport o TCR), lo revisamos en persona en Alemania antes de que pagues, negociamos el precio, coordinamos el transporte, la ITV y la matriculación con el organismo o la empresa autorizada correspondiente, y te lo entregamos en tu domicilio.',
    },
    'bmw': {
        'M': 'BMW', 'corto': 'BMW', 'largo': 'BMW', 'ejemplo': 'BMW 320d Touring',
        'title': 'Importar un BMW de Alemania (2026) | Orozco Import',
        'description': 'Tu BMW desde Alemania con matrícula española: lo buscamos, un perito lo revisa en persona antes de que pagues y lo recibes en tu puerta. Casos reales.',
        'og_title': 'Importa tu BMW de Alemania con alguien que mira por ti', 'og_image': 'og/marca-bmw.jpg',
        'eyebrow': 'BMW desde Alemania · desde 2017',
        'h1': 'Importa tu BMW de Alemania', 'h1_em': 'con alguien que mira por ti.',
        'subtitulo': 'Alemania es la casa de BMW: más unidades, más versiones y mejor equipadas. Buscamos la tuya, la revisamos en persona antes de que pagues nada y te decimos la verdad, aunque sea un «este no». Tú la recibes en tu puerta.',
        'fan_casos': ['BMW 330i M Sport', 'BMW 220i Gran Coupé M', 'BMW Serie 1', 'BMW X4 30d'],
        'fan_hint': 'Arrastra para ver más BMW que ya hemos traído',
        'chips_label': 'Los BMW que más traemos', 'chips': ['Serie 3', 'Serie 4', 'Serie 1', 'X1', 'X3'],
        'why_title': 'En España pagas precio de turista.', 'why_em': 'En Alemania, el BMW que buscas está a precio de profesional.',
        'why_lead': 'Los concesionarios españoles compran sus BMW en el mercado europeo y añaden su margen. Con Orozco Import accedes directamente a ese mercado, con una revisión que ningún particular puede hacerse solo.',
        'barras': ANDER,
        'razones': [('El mercado de origen de la marca', 'Hay muchas más unidades de BMW de ocasión en Alemania, así que es más fácil dar con la versión, el motor y el color exactos que buscas.'),
                    ('M Sport y equipamiento que aquí cuesta encontrar', 'Paquete M Sport, Head-Up Display, techo panorámico o asientos confort aparecen con mucha más frecuencia en unidades alemanas.'),
                    ('Historial de servicio verificable', 'La mayoría pasan sus revisiones en la red oficial BMW. Comprobamos el historial de mantenimiento antes de proponerte el coche.')],
        'modelos_eyebrow': 'Modelos', 'modelos_title': 'Del Serie 1 al X3.', 'modelos_em': 'Te buscamos la versión exacta.',
        'modelos_lead': 'Motor, color, acabado y equipamiento. Si el BMW que quieres no está aquí, también lo buscamos.',
        'modelos': [{'slug': 'serie-3', 'nombre': 'BMW Serie 3', 'texto': 'Berlina y Touring, de gasolina, diésel o híbrido enchufable. Es el BMW que más nos piden.'},
                    {'slug': 'serie-4', 'nombre': 'BMW Serie 4', 'texto': 'Coupé, Cabrio y Gran Coupé. En Alemania hay mucha más oferta con paquete M Sport.'},
                    {'slug': 'serie-1', 'nombre': 'BMW Serie 1', 'texto': 'El compacto premium de BMW, también en versión deportiva M135i.'},
                    {'slug': 'x1', 'nombre': 'BMW X1', 'texto': 'SUV compacto, con tracción xDrive y versiones híbridas enchufables.'},
                    {'slug': 'x3', 'nombre': 'BMW X3', 'texto': 'El SUV medio de BMW, con muchas más combinaciones de motor y equipamiento.'}],
        'carrusel': ['BMW 330i M Sport', 'BMW 220i Gran Coupé M', 'BMW Serie 1', 'BMW X4 30d'],
        'faq': [('¿Cuánto se ahorra importando un BMW de Alemania?',
                 'Depende del modelo, la versión y el equipamiento. En los últimos BMW que hemos traído, el ahorro ha ido de <span class="oi-num">3.800€</span> a <span class="oi-num">4.800€</span> frente al mismo coche en España, con todo incluido: un <strong>BMW 330i M Sport</strong> para Ander (Bilbao) con <span class="oi-num">4.800€</span>, un <strong>BMW 220i Gran Coupé M</strong> para Miguel con <span class="oi-num">4.500€</span> y un <strong>BMW X4 30d</strong> para Sole (Madrid) con <span class="oi-num">3.800€</span>. Antes de empezar te damos el desglose de tu caso.'),
                ('¿Qué BMW conviene traer de Alemania?',
                 'Los que más nos piden son el <strong>Serie 3, Serie 4, Serie 1, X1 y X3</strong>. Donde más se nota la diferencia es en versiones bien equipadas (M Sport, motores de gama alta, híbridos enchufables) y en modelos con poca oferta en España. Si nos dices qué buscas, te decimos si merece la pena traerlo.'),
                'COSTES', 'GARANTIA', 'PHEV', FAQ_PAGO, FAQ_PLAZO, FAQ_ITV],
        'form_title': '¿Qué BMW buscas?', 'vehiculo_ph': 'Modelo, versión y cualquier detalle (p. ej. BMW 320d Touring M Sport)', 'mensaje_ph': 'Color, acabado, uso habitual...',
        'seo': 'Orozco Import es una empresa española privada de intermediación especializada en la <strong>importación de BMW desde Alemania</strong>, con más de 9 años de experiencia y más de 400 vehículos importados. Buscamos tu BMW (Serie 1, Serie 3, Serie 4, X1, X3 o modelos M), lo revisamos en persona en Alemania antes de que pagues, negociamos el precio, coordinamos el transporte, la ITV y la matriculación con el organismo o la empresa autorizada correspondiente, y te lo entregamos en tu domicilio.',
    },
    'mercedes': {
        'M': 'Mercedes', 'corto': 'Mercedes', 'largo': 'Mercedes-Benz', 'ejemplo': 'Mercedes C 220d Estate',
        'title': 'Importar un Mercedes de Alemania (2026) | Orozco Import',
        'description': 'Tu Mercedes-Benz desde Alemania con matrícula española: lo buscamos, un perito lo revisa en persona antes de que pagues y lo recibes en tu puerta.',
        'og_title': 'Importa tu Mercedes de Alemania con alguien que mira por ti', 'og_image': 'og/marca-mercedes.jpg',
        'eyebrow': 'Mercedes-Benz desde Alemania · desde 2017',
        'h1': 'Importa tu Mercedes de Alemania', 'h1_em': 'con alguien que mira por ti.',
        'subtitulo': 'Alemania es la casa de Mercedes-Benz: más unidades, más versiones y mejor equipadas. Buscamos el tuyo, lo revisamos en persona antes de que pagues nada y te decimos la verdad, aunque sea un «este no». Tú lo recibes en tu puerta.',
        'fan_casos': ['Mercedes CLA 250e AMG', 'Mercedes C200 AMG', 'BMW X4 30d', 'Audi A4 Avant 30 tfsi', 'BMW 220i Gran Coupé M'],
        'fan_hint': 'Arrastra para ver más coches que ya hemos traído',
        'chips_label': 'Los Mercedes que más traemos', 'chips': ['Clase C', 'CLA', 'Clase A', 'GLA', 'GLC'],
        'why_title': 'En España pagas precio de turista.', 'why_em': 'En Alemania, el Mercedes que buscas está a precio de profesional.',
        'why_lead': 'Los concesionarios españoles compran sus Mercedes en el mercado europeo y añaden su margen. Con Orozco Import accedes directamente a ese mercado, con una revisión que ningún particular puede hacerse solo.',
        'barras': FABIAN,
        'razones': [('El mercado de origen de la marca', 'Hay muchas más unidades de Mercedes-Benz de ocasión en Alemania, así que es más fácil dar con la versión, el motor y el color exactos que buscas.'),
                    ('AMG Line e híbridos enchufables', 'Acabado AMG Line, paquete Night, sonido Burmester o versiones híbridas enchufables aparecen con mucha más frecuencia en unidades alemanas.'),
                    ('Historial de servicio verificable', 'La mayoría pasan sus revisiones en la red oficial Mercedes-Benz. Comprobamos el historial de mantenimiento antes de proponerte el coche.')],
        'modelos_eyebrow': 'Modelos', 'modelos_title': 'De la Clase A al GLC.', 'modelos_em': 'Te buscamos la versión exacta.',
        'modelos_lead': 'Motor, color, acabado y equipamiento. Si el Mercedes que quieres no está aquí, también lo buscamos.',
        'modelos': [{'slug': 'clase-c', 'nombre': 'Mercedes Clase C', 'texto': 'Berlina y Estate, de gasolina, diésel o híbrido enchufable.'},
                    {'slug': 'cla', 'nombre': 'Mercedes CLA', 'texto': 'Coupé de cuatro puertas y Shooting Brake, también en híbrido enchufable 250e.'},
                    {'slug': 'clase-a', 'nombre': 'Mercedes Clase A', 'texto': 'Compacto y berlina, con acabado AMG Line y sistema MBUX.'},
                    {'slug': 'gla', 'nombre': 'Mercedes GLA', 'texto': 'SUV compacto, con versiones híbridas enchufables.'},
                    {'slug': 'glc', 'nombre': 'Mercedes GLC', 'texto': 'SUV y Coupé, con muchas más combinaciones de motor y equipamiento.'}],
        'carrusel': ['Mercedes CLA 250e AMG', 'Mercedes C200 AMG'],
        'faq': [('¿Cuánto se ahorra importando un Mercedes de Alemania?',
                 'Depende del modelo, la versión y el equipamiento. Dos casos reales: un <strong>Mercedes CLA 250e AMG</strong> para Fabián (Valencia) con <span class="oi-num">5.477€</span> de ahorro y un <strong>Mercedes C200 AMG</strong> para Enrique (Sevilla) con <span class="oi-num">2.000€</span>, ya contando transporte, impuestos, revisión y servicio. Antes de empezar te damos el desglose de tu caso.'),
                ('¿Qué Mercedes conviene traer de Alemania?',
                 'Los que más nos piden son la <strong>Clase C, CLA, Clase A, GLA y GLC</strong>. Donde más se nota la diferencia es en versiones bien equipadas (AMG Line, híbridos enchufables) y en modelos con poca oferta en España. Si nos dices qué buscas, te decimos si merece la pena traerlo.'),
                'COSTES', 'GARANTIA', 'PHEV', FAQ_PAGO, FAQ_PLAZO, FAQ_ITV],
        'form_title': '¿Qué Mercedes buscas?', 'vehiculo_ph': 'Modelo, versión y cualquier detalle (p. ej. Mercedes C 300e AMG Line)', 'mensaje_ph': 'Color, acabado, uso habitual...',
        'seo': 'Orozco Import es una empresa española privada de intermediación especializada en la <strong>importación de Mercedes-Benz desde Alemania</strong>, con más de 9 años de experiencia y más de 400 vehículos importados. Buscamos tu Mercedes (Clase A, Clase C, Clase E, CLA, GLA, GLC o modelos AMG), lo revisamos en persona en Alemania antes de que pagues, negociamos el precio, coordinamos el transporte, la ITV y la matriculación con el organismo o la empresa autorizada correspondiente, y te lo entregamos en tu domicilio.',
    },
    'audi': {
        'M': 'Audi', 'corto': 'Audi', 'largo': 'Audi', 'ejemplo': 'Audi A4 Avant 40 TDI',
        'title': 'Importar un Audi de Alemania (2026) | Orozco Import',
        'description': 'Tu Audi desde Alemania con matrícula española: lo buscamos, un perito lo revisa en persona antes de que pagues y lo recibes en tu puerta. Casos reales.',
        'og_title': 'Importa tu Audi de Alemania con alguien que mira por ti', 'og_image': 'og/marca-audi.jpg',
        'eyebrow': 'Audi desde Alemania · desde 2017',
        'h1': 'Importa tu Audi de Alemania', 'h1_em': 'con alguien que mira por ti.',
        'subtitulo': 'Alemania es la casa de Audi: más unidades, más versiones y mejor equipadas. Buscamos el tuyo, lo revisamos en persona antes de que pagues nada y te decimos la verdad, aunque sea un «este no». Tú lo recibes en tu puerta.',
        'fan_casos': ['Audi TT RS', 'Audi A4 Avant 30 tfsi', 'Mercedes C200 AMG', 'BMW X4 30d', 'BMW Serie 1'],
        'fan_hint': 'Arrastra para ver más coches que ya hemos traído',
        'chips_label': 'Los Audi que más traemos', 'chips': ['A4', 'A5', 'A3', 'Q3', 'Q5'],
        'why_title': 'En España pagas precio de turista.', 'why_em': 'En Alemania, el Audi que buscas está a precio de profesional.',
        'why_lead': 'Los concesionarios españoles compran sus Audi en el mercado europeo y añaden su margen. Con Orozco Import accedes directamente a ese mercado, con una revisión que ningún particular puede hacerse solo.',
        'barras': None,
        'razones': [('El mercado de origen de la marca', 'Hay muchas más unidades de Audi de ocasión en Alemania, así que es más fácil dar con la versión, el motor y el color exactos que buscas.'),
                    ('quattro, S line y Matrix LED', 'Tracción quattro, acabado S line, faros Matrix LED o Virtual Cockpit aparecen con mucha más frecuencia en unidades alemanas.'),
                    ('Historial de servicio verificable', 'La mayoría pasan sus revisiones en la red oficial Audi. Comprobamos el historial de mantenimiento antes de proponerte el coche.')],
        'modelos_eyebrow': 'Modelos', 'modelos_title': 'Del A3 al Q5.', 'modelos_em': 'Te buscamos la versión exacta.',
        'modelos_lead': 'Motor, color, acabado y equipamiento. Si el Audi que quieres no está aquí, también lo buscamos.',
        'modelos': [{'slug': 'a4', 'nombre': 'Audi A4', 'texto': 'Berlina y Avant, con muchas más unidades quattro en Alemania.'},
                    {'slug': 'a5', 'nombre': 'Audi A5', 'texto': 'Sportback, Coupé y Cabrio, con acabado S line.'},
                    {'slug': 'a3', 'nombre': 'Audi A3', 'texto': 'Sportback y Sedán, de gasolina, diésel o híbrido enchufable.'},
                    {'slug': 'q3', 'nombre': 'Audi Q3', 'texto': 'SUV compacto y Sportback, con acabado S line.'},
                    {'slug': 'q5', 'nombre': 'Audi Q5', 'texto': 'SUV y Sportback, con tracción quattro e híbridos enchufables.'}],
        'carrusel': ['Audi TT RS', 'Audi A4 Avant 30 tfsi'],
        'faq': [('¿Cuánto se ahorra importando un Audi de Alemania?',
                 'Depende del modelo, la versión y el equipamiento. Dos casos reales: un <strong>Audi TT RS</strong> para Miguel (Barcelona) con <span class="oi-num">6.900€</span> de ahorro y un <strong>Audi A4 Avant</strong> para Mario (Burgos) con <span class="oi-num">4.700€</span>, ya contando transporte, impuestos y servicio. Antes de empezar te damos el desglose de tu caso.'),
                ('¿Qué Audi conviene traer de Alemania?',
                 'Los que más nos piden son el <strong>A4, A5, A3, Q3 y Q5</strong>. Donde más se nota la diferencia es en versiones bien equipadas (S line, quattro, motores de gama alta) y en modelos S y RS con poca oferta en España. Si nos dices qué buscas, te decimos si merece la pena traerlo.'),
                'COSTES', 'GARANTIA', 'PHEV', FAQ_PAGO, FAQ_PLAZO, FAQ_ITV],
        'form_title': '¿Qué Audi buscas?', 'vehiculo_ph': 'Modelo, versión y cualquier detalle (p. ej. Audi A4 Avant S line quattro)', 'mensaje_ph': 'Color, acabado, uso habitual...',
        'seo': 'Orozco Import es una empresa española privada de intermediación especializada en la <strong>importación de Audi desde Alemania</strong>, con más de 9 años de experiencia y más de 400 vehículos importados. Buscamos tu Audi (A3, A4, A5, A6, Q3, Q5 o modelos S y RS), lo revisamos en persona en Alemania antes de que pagues, negociamos el precio, coordinamos el transporte, la ITV y la matriculación con el organismo o la empresa autorizada correspondiente, y te lo entregamos en tu domicilio.',
    },
}
# Filtros de la inspección: el coche del ejemplo es el de la foto de fondo del filtro 3 y el del informe
# (tools/informe_perito.py genera las imágenes). precios = los 5 anuncios del filtro 1, en el orden de la home.
INSPECCION = {
    'golf-gti': {'modelo': 'Volkswagen Golf GTI Clubsport', 'corto': 'Golf GTI Clubsport', 'vin': 'WVWZZZCD…41', 'cv': 300,
                 'foto': 'golf-gti/gti_clubsport_2.jpeg', 'foco': (.5, .55), 'precios': ['33.900 €', '29.400 €', '34.500 €', '38.900 €', '34.800 €']},
    'bmw': {'modelo': 'BMW X4 xDrive30d', 'corto': 'BMW X4 xDrive30d', 'vin': 'WBAVJ910…73', 'cv': 286,
            'foto': 'img/inspeccion/coche-perito.webp', 'precios': ['44.900 €', '38.500 €', '45.400 €', '51.900 €', '45.900 €']},
    'mercedes': {'modelo': 'Mercedes-Benz C 220d', 'corto': 'Mercedes C 220d', 'vin': 'W1K2060…18', 'cv': 200,
                 'foto': 'landing/caso-8.jpg', 'precios': ['32.900 €', '28.300 €', '33.400 €', '37.900 €', '33.750 €']},
    'audi': {'modelo': 'Audi TT RS Coupé', 'corto': 'Audi TT RS', 'vin': 'TRUZZZFV…52', 'cv': 400,
             'foto': 'landing/caso-3.jpg', 'precios': ['54.900 €', '47.500 €', '55.800 €', '62.900 €', '56.400 €']},
}

# Páginas de marca: borrador (noindex, huecos de Fran) hasta lanzarlas. El GTI ya está publicado.
BORRADOR = {'bmw', 'mercedes', 'audi'} - LANZAR

# ---------------------------------------------------------------- utilidades

def uno(h, viejo, nuevo):
    n = h.count(viejo)
    if n != 1:
        raise SystemExit(f'Se esperaba 1 coincidencia y hay {n}: {viejo[:90]!r}')
    return h.replace(viejo, nuevo)


def entre(h, ini, fin):
    """Devuelve (inicio, fin) del texto entre ini (incluido) y fin (incluido), con una sola aparición de ini."""
    a = h.find(ini)
    if a < 0 or h.count(ini) != 1:
        raise SystemExit(f'Marca no única: {ini[:80]!r}')
    b = h.find(fin, a)
    if b < 0:
        raise SystemExit(f'Sin cierre para {ini[:60]!r}')
    return a, b + len(fin)


def bloques(home):
    """Corta la home por sus comentarios de sección: {'HERO': '...', ...} y el orden."""
    pat = re.compile(r'<!-- =+\s*\n\s*([^\n]+?)\s*\n\s*=+ -->\n')
    ms = list(pat.finditer(home))
    out, orden = {}, []
    for i, m in enumerate(ms):
        fin = ms[i + 1].start() if i + 1 < len(ms) else len(home)
        out[m.group(1)] = home[m.start():fin]
        orden.append(m.group(1))
    return home[:ms[0].start()], out, orden


def tarjetas_home(home):
    """Tarjetas del carrusel de casos de la home, por modelo."""
    t = {}
    for m in re.finditer(r'\n( *<article class="oi-cases__card">.*?</article>)', home, re.S):
        mod = re.search(r'oi-cases__model">([^<]+)<', m.group(1)).group(1)
        t[mod] = m.group(1)
    return t


def fan_home(home):
    t = {}
    for m in re.finditer(r'<article class="oi-fan__card" data-index="\d+">(.*?)</article>', home, re.S):
        img = re.search(r'<img src="([^"]+)"', m.group(1)).group(1)
        mod = re.search(r'oi-fan__card-model">([^<]+)<', m.group(1)).group(1)
        cli = re.search(r'oi-fan__card-client">([^<]+)<', m.group(1)).group(1)
        ah = re.search(r'oi-num">([^<]+)</span></span>', m.group(1)).group(1)
        t[mod] = (img, mod, cli, ah)
    return t


FLECHA = '<svg width="20" height="6" viewBox="0 0 20 6" fill="none" aria-hidden="true"><path d="M0 3H19M19 3L16 1M19 3L16 5" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'


def tarjeta_nueva(mod, c):
    return f'''          <article class="oi-cases__card">
            <div class="oi-cases__photo">
              <img src="{c['img']}" alt="{e(mod)} importado desde Alemania" class="oi-cases__photo-img" loading="lazy" />
              <div class="oi-cases__photo-overlay">
                <span class="oi-cases__route"><span class="oi-cases__route-from">{c['de']}</span>{FLECHA}<span class="oi-cases__route-to">{c['a']}</span></span>
              </div>
            </div>
            <div class="oi-cases__info">
              <div class="oi-cases__info-top">
                <div class="oi-cases__vehicle"><h3 class="oi-cases__model">{e(mod)}</h3><p class="oi-cases__meta">{c['quien']} · <span class="oi-num">{c['anio']}</span></p></div>
                <div class="oi-cases__saving"><span class="oi-cases__saving-label">Ahorro</span><span class="oi-cases__saving-amount oi-num">{c['ahorro']}</span></div>
              </div>
            </div>
          </article>'''


def tarjeta_hueco(M, n):
    preg = (f'Otro caso real de un {M} que hayáis traído: modelo, nombre del cliente, ciudad de destino y de dónde salió en Alemania, '
            'año, días que tardó, ahorro final frente al mismo coche en España y, si la tienes, una frase suya. '
            'Si tienes el desglose (precio en Alemania, transporte, impuestos, gastos, total y precio en España), ponlo también. '
            'Sube 1 a 3 fotos y confirma que el cliente da permiso para publicarlo.')
    return f'''          <article class="oi-cases__card" data-campo="caso_extra_{n}" data-tipo="caso" data-pregunta="{e(preg)}">
            <div class="oi-cases__photo"><div class="oi-hueco">Foto de otro {e(M)} que hayáis traído</div></div>
            <div class="oi-cases__info">
              <div class="oi-cases__info-top">
                <div class="oi-cases__vehicle"><h3 class="oi-cases__model"><span class="fran">modelo</span></h3><p class="oi-cases__meta"><span class="fran">nombre · año · días</span></p></div>
                <div class="oi-cases__saving"><span class="oi-cases__saving-label">Ahorro</span><span class="oi-cases__saving-amount"><span class="fran">€</span></span></div>
              </div>
              <p class="oi-cases__quote"><span class="fran">frase del cliente</span></p>
            </div>
          </article>'''


def fan_card(i, f):
    img, mod, cli, ah = f
    return f'''              <article class="oi-fan__card" data-index="{i}">
                <div class="oi-fan__card-photo">
                  <img src="{img}" alt="{e(mod)} importado desde Alemania" loading="lazy" />
                  <span class="oi-fan__card-saving"><span class="oi-fan__card-saving-label">Ahorro</span><span class="oi-num">{ah}</span></span>
                </div>
                <div class="oi-fan__card-info">
                  <p class="oi-fan__card-model">{e(mod)}</p>
                  <p class="oi-fan__card-client">{e(cli)}</p>
                </div>
              </article>
'''


def miles(n):
    return f'{n:,}'.replace(',', '.')


def barras(b):
    tot = sum(v for _, v in b['partidas'])
    ah = b['espana'] - tot
    cls = ['p-coche', 'p-tr', 'p-imp', 'p-gas', 'p-serv']
    col = ['#0F172A', '#2563EB', '#60A5FA', '#A5B4FC', '#6366F1']
    pila = ''.join(f'<i class="{c}" style="width:{v / b["espana"] * 100:.2f}%"></i>' for c, (_, v) in zip(cls, b['partidas']))
    ley = ''.join(f'\n          <span><i style="background:{c}"></i>{n} {miles(v)} €</span>' for c, (n, v) in zip(col, b['partidas']))
    nombre = b['quien'].split(',')[0]
    return f'''    <div class="oi-vs oi-reveal" role="img" aria-label="Comparativa: {miles(b['espana'])} euros en España frente a {miles(tot)} euros traído de Alemania">
      <p class="oi-vs__intro">{b['quien']}, quería un <strong>{b['modelo']}</strong>. Así quedaron las dos cuentas, con todo incluido:</p>
      <div class="oi-vs__barra">
        <div class="oi-vs__tit"><b>Comprado en España<small>Concesionario, mismo modelo</small></b><span>{miles(b['espana'])} €</span></div>
        <div class="oi-vs__pila"><i class="p-es" style="width:100%"></i></div>
      </div>
      <div class="oi-vs__barra">
        <div class="oi-vs__tit"><b>Traído de Alemania<small>Con Orozco Import, todo incluido</small></b><span>{miles(tot)} €</span></div>
        <div class="oi-vs__pila">{pila}</div>
        <div class="oi-vs__leyenda">{ley}
        </div>
      </div>
      <div class="oi-vs__ahorro"><b>Lo que se ahorró {nombre}</b><span>{miles(ah)} €</span></div>
    </div>
'''


def modelos(p, slug):
    cards = []
    for m in p['modelos']:
        if m.get('foto'):
            img = f'<img src="{m["foto"]}" alt="{e(m["nombre"])} importado de Alemania por Orozco Import" loading="lazy" />'
            attrs = ''
        else:
            preg = f'Sube una foto real de un {m["nombre"]} que hayáis traído (mejor en horizontal y de 3/4 delantero). Si se ve la matrícula, la tapamos nosotros.'
            img = f'<div class="oi-hueco">Foto de un {e(m["nombre"])}</div>'
            attrs = f' data-campo="foto_{m["slug"].replace("-", "_")}" data-tipo="foto" data-pregunta="{e(preg)}"'
        cards.append(f'''      <article class="oi-models__card oi-reveal"{attrs}>
        <div class="oi-models__photo">{img}</div>
        <div class="oi-models__info"><h3 class="oi-models__name oi-display">{e(m["nombre"])}</h3><p class="oi-models__text">{e(m["texto"])}</p></div>
      </article>''')
    return f'''<!-- ============================================================
     MODELOS
     ============================================================ -->

<section class="oi-models" id="modelos">
  <div class="oi-models__container">
    <header class="oi-models__header oi-reveal">
      <p class="oi-eyebrow">{p['modelos_eyebrow']}</p>
      <h2 class="oi-models__title oi-display">{p['modelos_title']}<br><em>{p['modelos_em']}</em></h2>
      <p class="oi-models__lead">{p['modelos_lead']}</p>
    </header>
    <div class="oi-models__grid">
{chr(10).join(cards)}
    </div>
    <div class="oi-models__cta oi-reveal"><a href="#contacto" class="oi-cta-primary"><span>Cuéntanos qué {e(p['corto'])} buscas</span></a></div>
  </div>
</section>


'''


def divisor(img):
    return f'''<div class="oi-divider" role="presentation">
  <img src="{img}" alt="" class="oi-divider__img" aria-hidden="true" loading="lazy" />
  <div class="oi-divider__scrim" aria-hidden="true"></div>
</div>


'''


FUERA_DEL_REPO = {'/guias/a/caso-bmw-330i-640.webp': (640, 853)}  # fotos que solo están en el servidor


def medidas(h):
    """Pone width y height a las imágenes que no los llevan (evita saltos al cargar), con el tamaño real del archivo."""
    def pon(m):
        tag = m.group(0)
        if 'width=' in tag and 'height=' in tag:
            return tag
        src = re.search(r'src="(/[^"]+)"', tag)
        if not src:
            return tag
        if src.group(1) in FUERA_DEL_REPO:
            w, h_ = FUERA_DEL_REPO[src.group(1)]
        else:
            ruta = os.path.join(RAIZ, src.group(1).lstrip('/'))
            try:
                w, h_ = Image.open(ruta).size
            except Exception:
                raise SystemExit(f'No puedo medir {src.group(1)}')
        return re.sub(r'\s*/?>$', f' width="{w}" height="{h_}" />', tag)
    return re.sub(r'<img\b[^>]*>', pon, h)


def ld(slug, p, url, preguntas):
    g = [
        {'@type': 'Service', '@id': url + '#servicio', 'name': f'Importación de {p["largo"]} desde Alemania',
         'serviceType': 'Intermediación en la compra e importación de vehículos', 'description': p['description'], 'url': url,
         'image': f'{DOM}/{p["og_image"]}', 'areaServed': {'@type': 'Country', 'name': 'España'},
         'provider': {'@type': 'LocalBusiness', '@id': f'{DOM}/#empresa', 'name': 'Orozco Import', 'url': DOM + '/',
                      'telephone': '+34644015034', 'address': {'@type': 'PostalAddress', 'streetAddress': 'C/ Virgen del Valle, 4', 'addressLocality': 'Dos Hermanas', 'addressRegion': 'Sevilla', 'addressCountry': 'ES'},
                      'aggregateRating': {'@type': 'AggregateRating', 'ratingValue': '4.9', 'reviewCount': '87'}},
         'offers': {'@type': 'Offer', 'price': '1573', 'priceCurrency': 'EUR',
                    'description': 'Servicio completo de intermediación (1.300 € + IVA). El coche se paga directamente al vendedor.'}},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Inicio', 'item': DOM + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': f'Importar un {p["M"]} de Alemania', 'item': url}]},
        {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': txt(a)}} for q, a in preguntas]},
    ]
    return json.dumps({'@context': 'https://schema.org', '@graph': g}, ensure_ascii=False, indent=2)


CSS = '''<style>
/* Páginas de modelo y marca (tools/marcas.py) */
.oi-hero__chips { display: flex; flex-wrap: wrap; gap: 8px; flex: 1; }
.oi-hero__chip { font-family: var(--font-mono); font-size: 0.8125rem; color: rgba(255,255,255,0.8); text-decoration: none; padding: 7px 12px; border-radius: 999px; border: 1px solid var(--oi-line-mid); background: rgba(255,255,255,0.03); transition: border-color .2s, color .2s; }
.oi-hero__chip:hover { color: #fff; border-color: var(--oi-gold); }
.oi-hero__bg-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 60%; opacity: .55; }
.oi-hero__bg-scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(15,23,42,.95) 0%, rgba(15,23,42,.84) 40%, rgba(15,23,42,.55) 72%, rgba(15,23,42,.7) 100%), linear-gradient(180deg, rgba(15,23,42,.5) 0%, transparent 25%, transparent 55%, rgba(15,23,42,.92) 100%); }
.oi-models { background: var(--oi-bg-light); color: var(--oi-text-dark); padding: 128px 28px; border-bottom: 1px solid var(--oi-line-light); }
.oi-models__container { max-width: 1180px; margin: 0 auto; }
.oi-models__header { max-width: 760px; margin: 0 auto 56px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 18px; }
.oi-models__title { font-size: clamp(2rem, 4.4vw, 3.25rem); line-height: 1.08; color: var(--oi-text-dark); font-weight: 700; }
.oi-models__title em { color: var(--oi-blue); }
.oi-models__lead { font-size: 1.0625rem; line-height: 1.65; color: var(--oi-text-body); max-width: 620px; }
.oi-models__grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 20px; }
.oi-models__card { flex: 0 1 calc((100% - 40px) / 3); background: #fff; border: 1px solid var(--oi-line-light); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; transition: transform .4s var(--ease-out), box-shadow .4s var(--ease-out); }
.oi-models__card:hover { transform: translateY(-4px); box-shadow: 0 16px 40px rgba(15,23,42,.08); }
.oi-models__photo { position: relative; aspect-ratio: 16 / 10; background: var(--oi-bg-paper); overflow: hidden; }
.oi-models__photo img { width: 100%; height: 100%; object-fit: cover; }
.oi-models__info { padding: 20px 22px 24px; display: flex; flex-direction: column; gap: 6px; }
.oi-models__name { font-size: 1.1875rem; font-weight: 700; color: var(--oi-text-dark); }
.oi-models__text { font-size: 0.9375rem; line-height: 1.6; color: var(--oi-text-body); }
.oi-models__cta { text-align: center; margin-top: 48px; }
@media (max-width: 900px) { .oi-models__card { flex-basis: calc((100% - 20px) / 2); } }
@media (max-width: 600px) { .oi-models { padding: 80px 20px; } .oi-models__card { flex-basis: 100%; } }
.oi-divider { position: relative; width: 100%; height: 200px; overflow: hidden; background: var(--oi-bg-deep); }
.oi-divider__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 50%; filter: brightness(.62) saturate(.95); }
.oi-divider__scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(15,23,42,.6) 0%, transparent 30%, transparent 70%, rgba(15,23,42,.6) 100%); }
@media (max-width: 600px) { .oi-divider { height: 130px; } }
.oi-testimonials__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin: 32px 0 56px; }
.oi-testimonials__card { background: #fff; border-radius: 16px; padding: 28px 28px 0; border: 1px solid var(--oi-line-light); display: flex; flex-direction: column; gap: 20px; overflow: hidden; transition: transform .4s var(--ease-out), box-shadow .4s var(--ease-out); }
.oi-testimonials__card:hover { transform: translateY(-4px); box-shadow: 0 16px 40px rgba(15,23,42,.08); }
.oi-testimonials__card-header { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; }
.oi-testimonials__card-avatar { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-weight: 700; color: #fff; background: linear-gradient(135deg, var(--oi-blue), var(--oi-blue-hover)); }
.oi-testimonials__card-name { font-family: var(--font-display); font-weight: 700; font-size: .9375rem; color: var(--oi-text-dark); margin: 0 0 1px; }
.oi-testimonials__card-role { font-size: .75rem; color: var(--oi-text-soft); margin: 0; }
.oi-testimonials__card-stars { display: flex; gap: 2px; }
.oi-testimonials__card-text { font-size: .9375rem; line-height: 1.6; color: var(--oi-text-body); margin: 0; flex: 1; }
.oi-testimonials__card-photo { width: calc(100% + 56px); margin: 4px -28px 0; aspect-ratio: 4 / 3; overflow: hidden; }
.oi-testimonials__card-photo img { width: 100%; height: 100%; object-fit: cover; }
@media (max-width: 900px) { .oi-testimonials__grid { grid-template-columns: 1fr; max-width: 520px; margin-left: auto; margin-right: auto; } }
/* Huecos que rellena Fran (solo en el borrador) */
.oi-hueco { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; text-align: center; font: 500 13px/1.4 var(--font-mono); color: #92400E; background: #FEF3C7; }
.oi-cases__photo .oi-hueco { position: relative; height: 100%; min-height: 200px; }
.fran { background: #FEF3C7; color: #92400E; border: 1.5px dashed #F59E0B; border-radius: 6px; padding: 0 6px; font-style: normal; overflow-wrap: anywhere; }
.fran::before { content: "Fran · "; font: 700 11px/1 var(--font-mono); text-transform: uppercase; opacity: .75; }
.rev { background: linear-gradient(transparent 60%, #FDE68A 60%); }
.fran--ok { background: #DCFCE7 !important; color: #14532D !important; border-color: #16A34A !important; }
.fran--ok::before { content: "✓ Fran · "; }
[data-campo].fran--ok { outline: 2px solid #16A34A; outline-offset: 4px; }
.fran--brilla { animation: brilla 1.4s ease-out; }
@keyframes brilla { 0% { box-shadow: 0 0 0 0 rgba(245,158,11,.9); } 100% { box-shadow: 0 0 0 14px rgba(245,158,11,0); } }
.oi-borrador { position: sticky; top: 0; z-index: 1000; background: #F59E0B; color: #422006; font: 600 14px/1.35 var(--font-sans); text-align: center; padding: 9px 16px; }
.oi-faq__answer a { color: var(--oi-blue); }
</style>
'''

# ---------------------------------------------------------------- página

def pagina(slug, p, home):
    url = f'{DOM}/{slug}/'
    M = p['M']
    borrador = slug in BORRADOR
    cabeza, b, orden = bloques(home)
    tarj, fan = tarjetas_home(home), fan_home(home)

    preguntas = []
    for f in p['faq']:
        if f == 'COSTES': f = (FAQ_COSTES[0].format(M=M), FAQ_COSTES[1])
        elif f == 'GARANTIA': f = faq_garantia(p['largo'])
        elif f == 'PHEV': f = faq_phev(M)
        preguntas.append(f)

    # ---- cabeza: SEO y JSON-LD
    h = cabeza
    h = re.sub(r'<meta name="description" content="[^"]*" />', f'<meta name="description" content="{e(p["description"])}" />', h)
    h = uno(h, '<meta name="robots" content="index, follow" />', f'<meta name="robots" content="{"noindex, follow" if borrador else "index, follow, max-image-preview:large"}" />')
    h = uno(h, '<link rel="canonical" href="https://orozcoimport.es/" />', f'<link rel="canonical" href="{url}" />')
    h = re.sub(r'<meta property="og:title" content="[^"]*" />', f'<meta property="og:title" content="{e(p["og_title"])}" />', h)
    h = re.sub(r'<meta property="og:description" content="[^"]*" />', f'<meta property="og:description" content="{e(p["description"])}" />', h)
    h = uno(h, 'content="https://orozcoimport.es/og/home.jpg"', f'content="{DOM}/{p["og_image"]}"')
    h = uno(h, '<meta property="og:url" content="https://orozcoimport.es/" />',
            f'<meta property="og:url" content="{url}" />\n  <meta property="og:site_name" content="Orozco Import" />\n  <meta property="og:locale" content="es_ES" />\n  <meta name="twitter:card" content="summary_large_image" />')
    h = re.sub(r'<title>[^<]*</title>', f'<title>{e(p["title"])}</title>', h)
    a = h.find('  <!-- Schema.org LocalBusiness -->')
    z = h.find('  <link rel="preload"')
    if a < 0 or z < a:
        raise SystemExit('No encuentro el JSON-LD de la home')
    h = h[:a] + f'  <script type="application/ld+json">\n{ld(slug, p, url, preguntas)}\n  </script>\n\n' + h[z:]
    h = uno(h, '</head>', CSS + '</head>')
    if borrador:
        h = uno(h, '<body>', '<body>\n<div class="oi-borrador" id="oi-borrador" hidden><b>Vista previa.</b> Lo marcado en amarillo son datos que aporta Fran. Lo subrayado lo tiene que confirmar.</div>')

    # ---- nav
    nav = uno(b['NAV'], '>Cuéntanos qué buscas</a>', f'>Cuéntanos qué {e(p["corto"])} buscas</a>')

    # ---- hero
    hero = b['HERO']
    hero = uno(hero, '<span>Desde 2017 · <span class="oi-num">+400</span> importaciones</span>', f'<span>{e(p["eyebrow"])}</span>')
    hero = re.sub(r'(<h1 class="oi-hero__title oi-display">).*?(</h1>)',
                  lambda m: f'{m.group(1)}\n          {e(p["h1"])}<br>\n          <span class="oi-hero__title-accent">{e(p["h1_em"])}</span>\n        {m.group(2)}', hero, count=1, flags=re.S)
    hero = re.sub(r'(<p class="oi-hero__subtitle">).*?(</p>)', lambda m: f'{m.group(1)}\n          {e(p["subtitulo"])}\n        {m.group(2)}', hero, count=1, flags=re.S)
    hero = uno(hero, '<span>Cuéntanos qué buscas</span>', f'<span>Cuéntanos qué {e(p["corto"])} buscas</span>')
    if p.get('hero_bg'):
        hero = uno(hero, '<div class="oi-hero__bg">', f'<div class="oi-hero__bg">\n    <img src="{p["hero_bg"]}" alt="" class="oi-hero__bg-img" aria-hidden="true" />\n    <div class="oi-hero__bg-scrim" aria-hidden="true"></div>')
    def de_fan(k):
        if k in fan: return fan[k]
        if k in CASOS_NUEVOS: c = CASOS_NUEVOS[k]; return (c['img'], k, f"{c['quien']} · {c['a']}", c['ahorro'])
        t = tarj[k]
        return (re.search(r'<img src="([^"]+)"', t).group(1), k, re.search(r'oi-cases__meta">([^ <]+)', t).group(1) + ' · ' + re.search(r'oi-cases__route-to">([^<]+)<', t).group(1),
                re.search(r'oi-cases__saving-amount oi-num">([^<]+)<', t).group(1))
    lista = p.get('fan') or [de_fan(k) for k in p['fan_casos']]
    a, z = entre(hero, '<div class="oi-fan__stage" id="oi-fan-stage">', '            </div>\n            <div class="oi-fan__surface"')
    hero = hero[:a] + '<div class="oi-fan__stage" id="oi-fan-stage">\n\n' + ''.join(fan_card(i, f) for i, f in enumerate(lista)) + '\n            </div>\n            <div class="oi-fan__surface"' + hero[z:]
    hero = uno(hero, '<p class="oi-fan__hint">Arrastra para ver más casos</p>', f'<p class="oi-fan__hint">{e(p["fan_hint"])}</p>')
    a, z = entre(hero, '<div class="oi-hero__brands-list">', '      </div>\n')
    chips = ''.join(f'\n        <a class="oi-hero__chip" href="#modelos">{e(c)}</a>' for c in p['chips'])
    hero = hero[:a] + f'<div class="oi-hero__chips">{chips}\n      </div>\n' + hero[z:]
    hero = uno(hero, '<span class="oi-hero__brands-label">Marcas que importamos habitualmente</span>', f'<span class="oi-hero__brands-label">{e(p["chips_label"])}</span>')

    # ---- por qué
    why = uno(b['POR QUÉ IMPORTAR'], '<section class="oi-why">', '<section class="oi-why" id="por-que">')
    why = re.sub(r'(<h2 class="oi-why__title oi-display">).*?(</h2>)', lambda m: f'{m.group(1)}\n        {e(p["why_title"])}<br>\n        <em>{e(p["why_em"])}</em>\n      {m.group(2)}', why, count=1, flags=re.S)
    why = re.sub(r'(<p class="oi-why__lead">).*?(</p>)', lambda m: f'{m.group(1)}\n        {e(p["why_lead"])}\n      {m.group(2)}', why, count=1, flags=re.S)
    a, z = entre(why, '    <div class="oi-vs oi-reveal"', '      <div class="oi-vs__ahorro">')
    z = why.find('</div>\n', why.find('</div>', z) + 6) + len('</div>\n')
    why = why[:a] + (barras(p['barras']) if p['barras'] else '') + why[z:]
    tits = re.findall(r'<h3 class="oi-why__item-title">[^<]*</h3>', why)
    txts = re.findall(r'<p class="oi-why__item-text">[^<]*</p>', why)
    assert len(tits) == len(txts) == 3
    for (t0, x0), (t1, x1) in zip(zip(tits, txts), p['razones']):
        why = uno(why, t0, f'<h3 class="oi-why__item-title">{e(t1)}</h3>')
        why = uno(why, x0, f'<p class="oi-why__item-text">{e(x1)}</p>')

    # ---- proceso (igual que la home)
    proc = b['PROCESO']

    # ---- testimonios y casos
    tes = uno(b['TESTIMONIOS + CASOS REALES'], '<section class="oi-testimonials">', '<section class="oi-testimonials" id="casos">')
    a, z = entre(tes, '    <!-- Casos reales — carousel horizontal -->', '    <div class="oi-testimonials__footer')
    if p.get('testimonios_gti'):
        gti = open(os.path.join(RAIZ, 'golf-gti', 'index.html'), encoding='utf-8').read()
        ga, gz = entre(gti, '    <div class="oi-testimonials__grid">', '    <div class="oi-testimonials__footer')
        grid = re.sub(r'src="(?!/|https?:)([^"]+)"', r'src="/golf-gti/\1"', gti[ga:gz])
        tes = tes[:a] + grid + tes[z - len('    <div class="oi-testimonials__footer'):]
        tes = uno(tes, 'Tienes la de las personas que ya han recibido su coche en su garaje.', 'Tienes la de las personas que ya tienen su Golf GTI en el garaje.')
    else:
        cards = [tarj[k] if k in tarj else tarjeta_nueva(k, CASOS_NUEVOS[k]) for k in p['carrusel']]
        if borrador:
            cards += [tarjeta_hueco(M, n) for n in range(1, CASOS_EXTRA + 1)]
        car = tes[a:z]
        ca, cz = entre(car, '<div class="oi-cases-carousel__track" id="oi-cases-track">', '        </div>\n      </div>\n      <div class="oi-cases-carousel__nav">')
        car = car[:ca] + '<div class="oi-cases-carousel__track" id="oi-cases-track">\n\n' + '\n\n'.join(cards) + '\n\n        </div>\n      </div>\n      <div class="oi-cases-carousel__nav">' + car[cz:]
        car = uno(car, '<!-- Casos reales — carousel horizontal -->', f'<h3 class="oi-models__title oi-display" style="font-size:clamp(1.5rem,3vw,2.125rem);text-align:center;margin:64px 0 28px">{e(M)} que ya hemos traído</h3>')
        tes = tes[:a] + car + tes[z - len('    <div class="oi-testimonials__footer'):]

    # ---- inspección: el ejemplo, con un coche de la marca
    ins = uno(b['INSPECCIÓN'], '<section class="oi-inspection">', '<section class="oi-inspection" id="revision">')
    # La home usa el ejemplo de BMW (INSPECCION['bmw']): se cambia por el de esta página
    d, h0 = INSPECCION[slug], INSPECCION['bmw']
    n = ins.count(h0['corto'])
    if n != 9:  # 8 en los filtros 1 y 2 y 1 en el alt del informe
        raise SystemExit(f'La home ha cambiado el ejemplo de la inspección ({n} menciones de {h0["corto"]})')
    if slug != 'bmw':
        ins = uno(ins, f'de un {h0["modelo"]}"', f'de un {e(d["modelo"])}"')
        ins = ins.replace(h0['corto'], d['corto'])
        for viejo, nuevo in zip(h0['precios'], d['precios']):
            ins = uno(ins, f'<span class="oi-ads__precio">{viejo}</span>', f'<span class="oi-ads__precio">{nuevo}</span>')
        ins = uno(ins, 'src="/img/inspeccion/coche-bmw.webp"', f'src="/img/inspeccion/coche-{slug}.webp"')
        ins = uno(ins, 'src="/img/inspeccion/informe-bmw.webp"', f'src="/img/inspeccion/informe-{slug}.webp"')

    # ---- preguntas frecuentes
    faq = b['FAQ — SEO AMPLIADO']
    faq = re.sub(r'(<h2 class="oi-faq__title oi-display">).*?(</h2>)', lambda m: f'{m.group(1)}\n        Preguntas frecuentes<br>\n        <em>sobre importar un {e(M)} de Alemania.</em>\n      {m.group(2)}', faq, count=1, flags=re.S)
    items = ''.join(f'''
      <details class="oi-faq__item oi-reveal">
        <summary class="oi-faq__question">
          <span class="oi-faq__question-num oi-num">{i:02d}</span>
          <span class="oi-faq__question-text">{e(q)}</span>
          <span class="oi-faq__icon" aria-hidden="true"></span>
        </summary>
        <div class="oi-faq__answer">
          <p>{a_}</p>
        </div>
      </details>
''' for i, (q, a_) in enumerate(preguntas, 1))
    a, z = entre(faq, '<div class="oi-faq__list">', '\n    </div>\n  </div>\n</section>')
    faq = faq[:a] + '<div class="oi-faq__list">\n' + items + '\n    </div>\n  </div>\n</section>' + faq[z:]

    # ---- formulario
    form = b['FORMULARIO']
    form = uno(form, '<h2 class="oi-form__title oi-display">¿Qué coche buscas?<br>', f'<h2 class="oi-form__title oi-display">{e(p["form_title"])}<br>')
    form = uno(form, 'placeholder="Marca, modelo y cualquier detalle que tengas claro"', f'placeholder="{e(p["vehiculo_ph"])}"')
    form = uno(form, 'placeholder="Tipo de coche, combustible, uso habitual..."', f'placeholder="{e(p["mensaje_ph"])}"')
    for k, v in (('utm-source', 'google'), ('utm-medium', 'organic'), ('utm-campaign', 'home-seo')):
        form = re.sub(rf'(id="oi-{k}"\s+name="[a-z_]+"\s+value=")' + v + '"', r'\1"', form)

    # ---- pie
    pie = b['FOOTER SEO']
    pie = pie.replace('href="#servicios"', 'href="/#servicios"')
    enl = '<a href="/" class="oi-footer__link">Importar un coche de Alemania</a>\n          '
    if slug == 'golf-gti':
        pie = uno(pie, '<a href="/golf-gti/" class="oi-footer__link">Importar un Golf GTI de Alemania</a>', enl.strip())
    else:
        hermanas = ''.join(f'\n          <a href="/{s}/" class="oi-footer__link">Importar un {PAGINAS[s]["M"]} de Alemania</a>' for s in PAGINAS if s not in (slug, 'golf-gti'))
        pie = uno(pie, '<a href="/golf-gti/" class="oi-footer__link">Importar un Golf GTI de Alemania</a>', enl + '<a href="/golf-gti/" class="oi-footer__link">Importar un Golf GTI de Alemania</a>' + hermanas)
    pie = re.sub(r'(<div class="oi-footer__seo-text">\s*<p>).*?(</p>)', lambda m: m.group(1) + p['seo'] + m.group(2), pie, count=1, flags=re.S)
    pie = uno(pie, '<a href="/guias/" class="oi-footer__link">Guías para importar un coche</a>',
              '<a href="/guias/cuanto-cuesta-traer-coche-alemania/" class="oi-footer__link">Cuánto cuesta traer un coche de Alemania</a>\n          <a href="/guias/" class="oi-footer__link">Guías para importar un coche</a>')

    # ---- montaje
    div1, div2 = p.get('divisores') or ('', '')
    cuerpo = (nav + '<main>\n\n' + hero + b['TRUST TICKER'] + why
              + (divisor(div1) if div1 else '') + modelos(p, slug) + proc + tes
              + (divisor(div2) if div2 else '') + ins + faq + form + '</main>\n\n')
    resto = pie + ''.join(b[k] for k in orden[orden.index('FOOTER SEO') + 1:])
    if borrador:
        resto = uno(resto, '<script src="/js/oi-captacion.js?v=6"></script>',
                    '<script src="/js/oi-captacion.js?v=6"></script>\n<script src="/guias/a/revision.js?v=1" defer></script>\n'
                    '<script>if(/^pre\\.|localhost|127\\.0\\.0\\.1/.test(location.hostname))document.getElementById(\'oi-borrador\').hidden=false;</script>')
    out = h + cuerpo + resto
    out = medidas(out)
    assert out.count('<h1') == 1
    with open(os.path.join(RAIZ, slug, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(out)
    print(f'✓ /{slug}/  ({"borrador, noindex" if borrador else "indexable"})')


if __name__ == '__main__':
    home = open(os.path.join(RAIZ, 'index.html'), encoding='utf-8').read()
    for s, p in PAGINAS.items():
        os.makedirs(os.path.join(RAIZ, s), exist_ok=True)
        pagina(s, p, home)
