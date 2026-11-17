#!/usr/bin/env python3
"""Imágenes del filtro 3 de la inspección (el perito en persona) para cada página de marca o modelo.

Para cada página genera, en sites/orozcoimport.es/img/inspeccion/:
  · coche-<slug>.webp    la foto de fondo: un coche real de la marca, recortado a 16:10 (640×400)
  · informe-<slug>.webp  la hoja del informe con el mismo coche (modelo, km, año y potencia) que el ejemplo
                         de los filtros 1 y 2 de esa página (el que pasa: 2021, Hamburgo)

Uso (desde la raíz del repo; necesita Playwright y Chromium):
  python3 tools/informe_perito.py
Los datos salen de INSPECCION en tools/marcas.py.
"""
import html
import os
import subprocess
import sys
import tempfile

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from marcas import INSPECCION, RAIZ  # noqa: E402

KIT = os.path.normpath(os.path.join(RAIZ, '..', 'brand.orozcoimport.es', 'kit'))
FUENTES = os.path.join(RAIZ, 'guias', 'a')

HOJA = '''<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:P;src:url("file://{f}/poppins-latin-700-normal.woff2")}}
@font-face{{font-family:I;src:url("file://{f}/inter-latin-400-normal.woff2")}}
@font-face{{font-family:M;src:url("file://{f}/roboto-mono-latin-500-normal.woff2")}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:560px;height:520px;background:#fff;color:#0F172A;font-family:I;padding:22px 20px 0;overflow:hidden}}
.cab{{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:2px solid #0F172A}}
.cab img{{height:56px}}
.ref{{font:500 10px/1.75 M;letter-spacing:.06em;color:#64748B;text-align:right;text-transform:uppercase}}
h1{{font:700 31px/1.1 P;letter-spacing:-.02em;margin-top:26px}}
.sub{{font-size:13px;color:#475569;margin-top:6px}}
.datos{{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #E2E8F0;border-radius:8px;margin-top:20px}}
.datos div{{padding:11px 12px 12px;border-right:1px solid #E2E8F0}}.datos div:last-child{{border-right:0}}
.datos small{{display:block;font:500 8px/1 M;letter-spacing:.08em;color:#64748B;text-transform:uppercase}}
.datos b{{display:block;font:500 12.5px/1 M;margin-top:9px;white-space:nowrap}}
ul{{list-style:none;margin-top:12px}}
li{{display:grid;grid-template-columns:47px 1fr 24px;align-items:center;padding:12px 0 11px;border-bottom:1px solid #E2E8F0}}
li i{{font:500 11px/1 M;color:#2563EB;font-style:normal}}
li b{{display:block;font:700 15px/1.2 P;font-weight:600}}
li small{{display:block;font:500 10px/1.4 M;color:#64748B;margin-top:4px}}
li span{{width:24px;height:24px;border-radius:50%;background:#2563EB;display:grid;place-items:center}}
</style></head><body>
<div class="cab"><img src="file://{logo}" alt=""><p class="ref">Informe Nº OI-2026-0412<br>Fecha 14.10.2026<br>Inspector F. Orozco</p></div>
<h1>Informe de inspección</h1>
<p class="sub">{modelo} · Hamburgo, Alemania</p>
<div class="datos"><div><small>Bastidor</small><b>{vin}</b></div><div><small>Kilómetros</small><b>63.812</b></div><div><small>Año</small><b>2021</b></div><div><small>Potencia</small><b>{cv} CV</b></div></div>
<ul>
<li><i>01</i><div><b>Historial completo</b><small>Km verificados · 2 propietarios · sin siniestros</small></div><span>{ok}</span></li>
<li><i>02</i><div><b>Estado mecánico</b><small>OBD sin errores · prueba en frío y en caliente</small></div><span>{ok}</span></li>
<li><i>03</i><div><b>Carrocería y chasis</b><small>Espesor de pintura 92–118 µm · sin repintados</small></div><span>{ok}</span></li>
<li><i>04</i><div><b>Electrónica y opcionales</b><small>38/38 sistemas probados</small></div><span>{ok}</span></li>
</ul></body></html>'''
OK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'

RENDER = r'''
const { chromium } = require('playwright');
(async () => {
  const [,, entrada, salida] = process.argv;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 560, height: 520 }, deviceScaleFactor: 2 });
  await p.goto('file://' + entrada); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
  await p.screenshot({ path: salida });
  await b.close();
})();
'''


def foto(slug, src, foco):
    im = Image.open(os.path.join(RAIZ, src)).convert('RGB')
    W, H = im.size
    if W / H > 1.6:
        w = round(H * 1.6); x = round((W - w) * foco[0]); im = im.crop((x, 0, x + w, H))
    else:
        h = round(W / 1.6); y = round((H - h) * foco[1]); im = im.crop((0, y, W, y + h))
    im.resize((640, 400), Image.LANCZOS).save(os.path.join(RAIZ, 'img', 'inspeccion', f'coche-{slug}.webp'), 'WEBP', quality=80, method=6)


def informe(slug, d, tmp):
    h = HOJA.format(f=FUENTES, logo=os.path.join(KIT, '01-logo', 'logo-acento.svg'), modelo=html.escape(d['modelo']), vin=d['vin'], cv=d['cv'], ok=OK)
    ent, png = os.path.join(tmp, f'{slug}.html'), os.path.join(tmp, f'{slug}.png')
    open(ent, 'w', encoding='utf-8').write(h)
    js = os.path.join(tmp, 'render.cjs'); open(js, 'w').write(RENDER)
    raiz_npm = subprocess.run(['npm', 'root', '-g'], capture_output=True, text=True).stdout.strip()
    subprocess.run(['node', js, ent, png], check=True, env={**os.environ, 'NODE_PATH': raiz_npm})
    Image.open(png).convert('RGB').save(os.path.join(RAIZ, 'img', 'inspeccion', f'informe-{slug}.webp'), 'WEBP', quality=86, method=6)


if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as tmp:
        for slug, d in INSPECCION.items():
            foto(slug, d['foto'], d.get('foco', (.5, .5)))
            informe(slug, d, tmp)
            print('✓', slug, d['modelo'])
