#!/usr/bin/env python3
"""Comprobación de SEO técnico de las guías de orozcoimport.es/guias/ y de las páginas de marca (/bmw/, /mercedes/…).

Uso:
  python3 tools/seo_guias.py sites/orozcoimport.es/guias/<slug>/index.html [...]           # borrador (espera noindex)
  python3 tools/seo_guias.py --publicar sites/orozcoimport.es/guias/<slug>/index.html      # antes de publicar (espera index)

Sale con código 1 si hay algún fallo. Los avisos no bloquean.
Revisa: título (≤ 65 caracteres), meta description (110–160), robots, canonical propio, un solo H1,
Open Graph completo con imagen 1200×630, tarjeta de Twitter, JSON-LD válido (Article, BreadcrumbList y FAQPage),
imágenes con alt y dimensiones, cabeceras de tabla, enlaces internos que existen en el repositorio
y que la guía esté en el sitemap y en /guias/ cuando se publica.
"""
import html
import json
import os
import re
import sys

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sites', 'orozcoimport.es'))


def revisa(ruta, publicar):
    s = open(ruta, encoding='utf-8').read()
    fallos, avisos = [], []
    g = lambda r: (lambda m: html.unescape(m.group(1)).strip() if m else None)(re.search(r, s, re.S | re.I))
    rel = os.path.relpath(os.path.dirname(os.path.abspath(ruta)), RAIZ).replace(os.sep, '/')
    slug = os.path.basename(rel)
    url = f'https://orozcoimport.es/{rel}/'
    guia = rel.startswith('guias/')

    t = g(r'<title>(.*?)</title>')
    if not t: fallos.append('sin <title>')
    elif len(t) > 65: fallos.append(f'título de {len(t)} caracteres (máximo 65): {t}')
    d = g(r'<meta name="description" content="(.*?)"')
    if not d: fallos.append('sin meta description')
    elif not 110 <= len(d) <= 160: fallos.append(f'meta description de {len(d)} caracteres (110 a 160)')
    rob = g(r'<meta name="robots" content="(.*?)"') or ''
    if publicar and 'noindex' in rob: fallos.append('sigue con noindex')
    if not publicar and 'noindex' not in rob: avisos.append('borrador sin noindex')
    if g(r'<link rel="canonical" href="(.*?)"') != url: fallos.append(f'canonical distinto de {url}')
    if g(r'<html lang="(.*?)"') != 'es': fallos.append('html sin lang="es"')
    if len(re.findall(r'<h1[ >]', s)) != 1: fallos.append('no hay exactamente un H1')
    og = set(re.findall(r'property="og:([a-z_:]+)"', s))
    for k in ['type', 'title', 'description', 'url', 'image', 'image:width', 'image:height', 'site_name', 'locale']:
        if k not in og: fallos.append(f'falta og:{k}')
    if g(r'property="og:url" content="(.*?)"') not in (None, url): fallos.append('og:url distinto de la URL de la página')
    img = g(r'property="og:image" content="(.*?)"') or ''
    if img and not img.endswith(('.jpg', '.jpeg', '.png')): avisos.append('og:image mejor en jpg o png (algunas redes no leen webp)')
    if img.startswith('https://orozcoimport.es/'):
        local = os.path.join(RAIZ, img.split('orozcoimport.es/', 1)[1])
        if not os.path.exists(local): fallos.append(f'og:image no está en el repositorio: {img}')
        else:
            try:
                from PIL import Image
                if Image.open(local).size != (1200, 630): avisos.append('og:image no mide 1200×630')
            except Exception:
                pass
    if 'name="twitter:card"' not in s: fallos.append('falta twitter:card')

    tipos = []
    for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        try:
            j = json.loads(b)
        except Exception as e:
            fallos.append(f'JSON-LD no válido: {e}')
            continue
        tipos += [x.get('@type') for x in j.get('@graph', [j])]
    esperados = (['CollectionPage', 'BreadcrumbList'] if rel == 'guias' else ['Article', 'BreadcrumbList', 'FAQPage'] if guia
                 else ['Service', 'BreadcrumbList', 'FAQPage'])
    for k in esperados:
        if k not in tipos: fallos.append(f'falta JSON-LD {k}')

    for m in re.finditer(r'<img\b[^>]*>', s):
        tag = m.group(0)
        if 'alt=' not in tag: fallos.append(f'imagen sin alt: {tag[:80]}')
        if 'width=' not in tag or 'height=' not in tag: fallos.append(f'imagen sin width/height: {tag[:80]}')
    for th in re.findall(r'<th[^>]*>\s*</th>', s): fallos.append('cabecera de tabla vacía')

    for h in sorted(set(re.findall(r'href="(/[^"#?]*)', s))):
        p = os.path.join(RAIZ, h.lstrip('/'))
        if not (os.path.exists(p) or os.path.exists(os.path.join(p, 'index.html'))):
            (fallos if publicar else avisos).append(f'enlace interno a una página que no está en el repositorio: {h}')
    if 'class="fran' in s or 'data-campo=' in s:
        (fallos if publicar else avisos).append('quedan huecos de Fran sin rellenar')

    if publicar and rel != 'guias':
        if url not in open(os.path.join(RAIZ, 'sitemap.xml'), encoding='utf-8').read(): fallos.append('no está en sitemap.xml')
        if guia and f'/guias/{slug}/' not in open(os.path.join(RAIZ, 'guias', 'index.html'), encoding='utf-8').read(): fallos.append('no está enlazada desde /guias/')
    return fallos, avisos


def main():
    args = sys.argv[1:]
    publicar = '--publicar' in args
    rutas = [a for a in args if not a.startswith('--')]
    malo = False
    for r in rutas:
        f, a = revisa(r, publicar)
        print(('✗ ' if f else '✓ ') + r)
        for x in f: print('   FALLO  ' + x)
        for x in a: print('   aviso  ' + x)
        malo = malo or bool(f)
    sys.exit(1 if malo else 0)


if __name__ == '__main__':
    main()
