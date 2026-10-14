#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pre-processa os sprites de "Eva no Lixo Zero".

Le somente os arquivos originais de img/ e escreve atlas normalizados em
img/generated/. Nenhum arquivo original e modificado.

Uso:  python tools/extract_sprites.py
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import spritelib as S  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'img', 'generated')

# Altura desejada (em pixels de mundo) de cada personagem. Os atlas sao
# gerados no dobro disso para continuarem nitidos em telas com DPR 2.
SUPERSAMPLE = 2.0
EVA_WORLD_H = 92.0
GOBLIN_WORLD_H = 62.0
LATAO_WORLD_H = 82.0
MOSCA_WORLD_W = 76.0
BOSS_WORLD_H = 210.0


def rel(path):
    return os.path.join(ROOT, path)


def out_png(*parts):
    return os.path.join(OUT, *parts)


def as_url(path):
    return os.path.relpath(path, ROOT).replace(os.sep, '/')


# ============================================================== Eva

EVA_FILES = [
    ('idle', 'img/sprites eva/base/eva_idle.png'),
    ('run1', 'img/sprites eva/base/eva_run_01.png'),
    ('run2', 'img/sprites eva/base/eva_run_02.png'),
    ('jump', 'img/sprites eva/base/eva_jump.png'),
    ('crouch1', 'img/sprites eva/animations/crouch/eva_crouch_01.png'),
    ('crouch2', 'img/sprites eva/animations/crouch/eva_crouch_02.png'),
    ('punch1', 'img/sprites eva/animations/punch/eva_punch_01.png'),
    ('punch2', 'img/sprites eva/animations/punch/eva_punch_02.png'),
    ('eco1', 'img/sprites eva/animations/eco_power/eva_eco_power_01_charge.png'),
    ('eco2', 'img/sprites eva/animations/eco_power/eva_eco_power_02_release.png'),
    ('hurt1', 'img/sprites eva/animations/hurt/eva_hurt_01.png'),
    ('hurt2', 'img/sprites eva/animations/hurt/eva_hurt_02_dizzy.png'),
    ('defeat1', 'img/sprites eva/animations/defeat/eva_defeat_01.png'),
    ('defeat2', 'img/sprites eva/animations/defeat/eva_defeat_02_ko.png'),
]


def build_eva():
    """Todos os PNGs da Eva ja vem com alpha; so precisam de escala unica."""
    src = {}
    for key, path in EVA_FILES:
        img = S.trim(Image.open(rel(path)).convert('RGBA'))
        src[key] = img
    # a pose de referencia (idle) define a escala de todo o elenco
    ref_h = src['idle'].height
    scale = (EVA_WORLD_H * SUPERSAMPLE) / ref_h

    atlas = S.Atlas('eva')
    for key, _ in EVA_FILES:
        img = S.resized(src[key], scale)
        atlas.add(key, img, S.foot_anchor(img))
    data = atlas.save_packed(out_png('eva', 'eva-atlas.png'), max_width=1600)
    data['file'] = as_url(out_png('eva', 'eva-atlas.png'))
    data['scale'] = round(1.0 / SUPERSAMPLE, 4)
    return data


# ============================================================== grade simples

def _refine_cuts(profile, count, size, search):
    """Ajusta as divisorias da grade para os vales de alpha mais proximos."""
    cuts = [0]
    for i in range(1, count):
        # ancora no corte anterior: evita que pequenos desalinhamentos da arte
        # se acumulem e acabem cortando um sprite ao meio
        nominal = int(round(min(cuts[-1] + size, len(profile) - 1)))
        lo = max(cuts[-1] + 1, nominal - search)
        hi = min(len(profile) - 1, nominal + search + 1)
        if hi <= lo:
            cuts.append(nominal)
            continue
        window = profile[lo:hi]
        cuts.append(lo + int(np.argmin(window)))
    cuts.append(len(profile))
    return cuts


def grid_frames(path, cols, rows, flat_bg, min_area=400):
    """Corta uma sheet em grade, mas encaixando os cortes nos vales de alpha.

    Evita tanto fatiar um sprite maior que a celula quanto trazer pedaco do
    vizinho quando duas artes se tocam.
    """
    sheet = Image.open(rel(path))
    sheet = S.rgba_from_flat(sheet) if flat_bg else sheet.convert('RGBA')
    alpha = (np.asarray(sheet)[:, :, 3] > S.ALPHA_CUT).astype(np.int32)
    W, H = sheet.size

    row_cuts = _refine_cuts(alpha.sum(axis=1), rows, H / rows, int(H / rows * 0.22))
    frames = {}
    for r in range(rows):
        y0, y1 = row_cuts[r], row_cuts[r + 1]
        band = alpha[y0:y1]
        col_cuts = _refine_cuts(band.sum(axis=0), cols, W / cols, int(W / cols * 0.32))
        for c in range(cols):
            cell = sheet.crop((col_cuts[c], y0, col_cuts[c + 1], y1))
            cell = S.trim(S.drop_specks(cell, min_area))
            if cell is not None and cell.width > 8 and cell.height > 8:
                frames[(r, c)] = cell
    return frames


GOBLIN_MAP = {
    'idle': [(0, 0), (0, 1), (0, 2), (0, 3)],
    'walk': [(1, 0), (1, 1), (1, 2), (1, 3)],
    'run': [(2, 0), (2, 1), (2, 2), (2, 3)],
    'attack': [(3, 0), (3, 1), (3, 2), (3, 3)],
    'hurt': [(4, 0), (4, 1)],
    'death': [(4, 0), (4, 2), (4, 3)],
}

LATAO_MAP = {
    'idle': [(0, c) for c in range(7)],
    'walk': [(1, c) for c in range(7)],
    'attack': [(2, 2), (2, 3), (2, 4), (2, 5), (2, 6), (3, 0), (3, 1)],
    'hurt': [(3, 3), (4, 2)],
    'death': [(4, 3), (4, 4), (4, 5), (5, 1), (5, 3), (5, 5), (5, 6)],
}

BOSS_MAP = {
    'idle': [(0, 0), (0, 1)],
    'walk': [(0, 1), (0, 2)],
    'telegraph': [(0, 2), (0, 3)],
    'windup': [(1, 0)],
    'slam': [(1, 1)],
    'hurt': [(1, 2)],
    'defeat': [(1, 3)],
}


def build_grid_actor(name, path, cols, rows, anim_map, world_h, flat_bg,
                     columns=6, min_area=400):
    frames = grid_frames(path, cols, rows, flat_bg, min_area)
    tallest = max(f.height for f in frames.values())
    scale = (world_h * SUPERSAMPLE) / tallest

    atlas = S.Atlas(name)
    anim = {}
    added = {}
    for anim_name, cells in anim_map.items():
        keys = []
        for cell in cells:
            if cell not in frames:
                print('  ! quadro ausente %s %s' % (name, cell))
                continue
            key = 'r%dc%d' % cell
            if key not in added:
                img = S.resized(frames[cell], scale)
                atlas.add(key, img, S.foot_anchor(img))
                added[key] = True
            keys.append(key)
        if keys:
            anim[anim_name] = keys
    png = out_png(name, '%s-atlas.png' % name)
    data = atlas.save_packed(png, max_width=1800)
    data['file'] = as_url(png)
    data['scale'] = round(1.0 / SUPERSAMPLE, 4)
    data['anim'] = anim
    return data


# ============================================================== mosca mutante

MOSCA_SRC = 'img/Mobs Sprites/mosca mutante sprites.png'

# Grupos da folha: (nome, cx0, cx1, cy0, cy1, quantos)
# Os retangulos sao testados contra o CENTRO de cada componente, entao o
# recorte final usa a caixa real do sprite e nunca corta as asas.
MOSCA_GROUPS = [
    ('fly',     400, 1536,    0,  178, 8),
    ('flyfast', 400, 1536,  178,  315, 0),
    ('rise',    380,  700,  315,  470, 4),
    ('fall',    700, 1110,  315,  470, 3),
    ('hover',  1110, 1536,  315,  470, 3),
    ('throw',     0,  640,  470,  615, 4),
    ('ball',    640,  950,  470,  615, 4),
    ('spit',    950, 1536,  470,  615, 4),
    ('dive',      0,  760,  615,  800, 0),
    ('hurt',    760, 1180,  615,  800, 0),
    ('death',     0, 1070,  800, 1024, 0),
]

# Retrato de apresentacao no canto da folha: nao e quadro de animacao.
MOSCA_PORTRAIT = (0, 0, 400, 440)


def detect_labels(img):
    """Acha as tarjas verdes com texto que a folha traz impressas."""
    a = np.asarray(img).astype(int)
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    mask = ((al > 100) & (g > 55) & (g < 150) & (r < 80) & (b < 100)
            & (g - r > 25) & (g - b > 10))
    mask = ndimage.binary_closing(mask, np.ones((7, 25), bool))
    lab, _ = ndimage.label(mask)
    rects = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if (lab[sl] == i + 1).sum() > 1500 and w > 60 and h < 45:
            rects.append((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))
    return rects


def _split_box(box, mask):
    """Parte uma caixa que juntou dois sprites no vale de alpha mais fundo."""
    x0, y0, x1, y1 = box
    prof = mask[y0:y1, x0:x1].sum(axis=0)
    lo = int(len(prof) * 0.3)
    hi = int(len(prof) * 0.7)
    if hi <= lo:
        mid = (x0 + x1) // 2
    else:
        mid = x0 + lo + int(np.argmin(prof[lo:hi]))
    return [(x0, y0, mid, y1), (mid, y0, x1, y1)]


def _fit_count(boxes, want, mask):
    """Junta vizinhos ou parte o mais largo ate bater a quantidade esperada."""
    if not want:
        return boxes
    boxes = list(boxes)
    while len(boxes) > want:
        bi = min(range(len(boxes) - 1), key=lambda i: boxes[i + 1][0] - boxes[i][2])
        a, b = boxes[bi], boxes[bi + 1]
        boxes[bi:bi + 2] = [(min(a[0], b[0]), min(a[1], b[1]),
                             max(a[2], b[2]), max(a[3], b[3]))]
    while len(boxes) < want:
        bi = max(range(len(boxes)), key=lambda i: boxes[i][2] - boxes[i][0])
        boxes[bi:bi + 1] = _split_box(boxes[bi], mask)
        boxes.sort()
    return boxes


def build_mosca():
    sheet = Image.open(rel(MOSCA_SRC)).convert('RGBA')
    sheet = S.erase_rects(sheet, detect_labels(sheet), pad=5)
    sheet = S.erase_rects(sheet, [MOSCA_PORTRAIT], pad=0)

    mask = np.asarray(sheet)[:, :, 3] > S.ALPHA_CUT
    grown = ndimage.binary_dilation(mask, np.ones((5, 5), bool))
    lab, _ = ndimage.label(grown)

    buckets = {name: [] for name, *_ in MOSCA_GROUPS}
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if (mask & (lab == i + 1))[sl].sum() < 900:
            continue
        x0, y0, x1, y1 = sl[1].start, sl[0].start, sl[1].stop, sl[0].stop
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        for name, gx0, gx1, gy0, gy1, _ in MOSCA_GROUPS:
            if gx0 <= cx < gx1 and gy0 <= cy < gy1:
                buckets[name].append((x0, y0, x1, y1))
                break

    raw, order = {}, {}
    for name, _, _, _, _, want in MOSCA_GROUPS:
        boxes = _fit_count(sorted(buckets[name]), want, mask)
        # descarta respingos: qualquer caixa bem menor que a mediana do grupo
        if len(boxes) > 2:
            areas = sorted(mask[b[1]:b[3], b[0]:b[2]].sum() for b in boxes)
            floor = areas[len(areas) // 2] * 0.18
            boxes = [b for b in boxes if mask[b[1]:b[3], b[0]:b[2]].sum() >= floor]
        keys = []
        for i, box in enumerate(boxes):
            img = S.trim(S.drop_specks(sheet.crop(box), 150))
            if img is None or img.width < 24 or img.height < 24:
                continue
            key = '%s%d' % (name, i)
            raw[key] = img
            keys.append(key)
        order[name] = keys
        if not keys:
            print('  ! grupo vazio na mosca: %s' % name)

    widest = max(raw[k].width for k in order['fly'])
    scale = (MOSCA_WORLD_W * SUPERSAMPLE) / widest

    atlas = S.Atlas('mosca')
    for key, img in raw.items():
        small = S.resized(img, scale)
        atlas.add(key, small, S.center_anchor(small))

    png = out_png('mosca', 'mosca-atlas.png')
    data = atlas.save_packed(png, max_width=2048)
    data['file'] = as_url(png)
    data['scale'] = round(1.0 / SUPERSAMPLE, 4)
    anim = {k: v for k, v in order.items() if v}
    # o ultimo quadro de "gosma toxica" e o respingo, nao a mosca:
    # deixa-lo na animacao faria o inimigo sumir no fim do ataque
    if len(anim.get('spit', [])) > 3:
        anim['splat'] = anim['spit'][3:]
        anim['spit'] = anim['spit'][:3]
    data['anim'] = anim
    return data


# ============================================================== plataformas

PLATFORM_SHEETS = [
    ('set124', 'img/plataform/platafor-mapa 1,2 e 4.png', False),
    ('set3', 'img/plataform/plataform-mapa 3.png', True),
    ('setboss', 'img/plataform/plataform-mapa do boss.png', False),
]


def build_platform_set(name, path, flat_bg, min_area=1400):
    sheet = Image.open(rel(path))
    sheet = S.rgba_from_flat(sheet) if flat_bg else sheet.convert('RGBA')
    mask = np.asarray(sheet)[:, :, 3] > S.ALPHA_CUT
    grown = ndimage.binary_dilation(mask, np.ones((7, 7), bool))
    lab, n = ndimage.label(grown)

    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        area = (mask & (lab == i + 1))[sl].sum()
        if area < min_area:
            continue
        boxes.append((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))
    # ordena em linhas de leitura
    boxes.sort(key=lambda b: (b[1] // 60, b[0]))

    atlas = S.Atlas(name)
    pieces = {}
    for i, box in enumerate(boxes):
        img = S.trim(S.drop_specks(sheet.crop(box), 220))
        if img is None or img.width < 12 or img.height < 8:
            continue
        key = '%s_%02d' % (name, i)
        atlas.add(key, img, (0, 0))
        pieces[key] = {'top': S.surface_top(img)}
    png = out_png('platforms', '%s-atlas.png' % name)
    data = atlas.save_packed(png, max_width=2048)
    data['file'] = as_url(png)
    for key, extra in pieces.items():
        data['frames'][key]['top'] = extra['top']
    return data


# ============================================================== mapas

# Os panoramas originais nao emendam sozinhos e trazem placas com texto,
# entao espelhar a peca deixaria o texto ao contrario. Em vez disso geramos
# uma versao realmente ciclica: as ultimas colunas sao fundidas com as
# primeiras, e o resultado repete sem costura e sem inverter nada.
MAP_FILES = [
    ('map1', 'img/Maps/fase 1 -map.png'),
    ('map2', 'img/Maps/fase 2 -map.png'),
    ('map3', 'img/Maps/fase 3 -map.png'),
    ('map4', 'img/Maps/fase 4 -map.png'),
    ('mapBoss', 'img/Maps/fase final boss -map.png'),
]
MAP_OVERLAP = 150


def make_seamless(img, overlap=MAP_OVERLAP):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    n = min(overlap, w // 6)
    new_w = w - n
    out = a[:, :new_w].copy()
    ramp = np.linspace(0.0, 1.0, n, dtype=np.float32)[None, :, None]
    out[:, :n] = a[:, w - n:w] * (1.0 - ramp) + a[:, :n] * ramp
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')


def build_maps():
    out = {}
    for key, path in MAP_FILES:
        img = Image.open(rel(path))
        seam = make_seamless(img)
        dest = out_png('maps', key + '.jpg')
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        seam.save(dest, quality=92, optimize=True, progressive=True)
        out[key] = {'file': as_url(dest), 'w': seam.width, 'h': seam.height}
        print('  %s %dx%d -> %s' % (key, seam.width, seam.height, out[key]['file']))
    return out


# ============================================================== arte do menu

# assets/menu.png traz textos antigos embutidos na arte ("EVA CAPIVARA",
# "A MISSAO DA FLORESTA" e o nome descartado do vilao). So aproveitamos
# recortes 100% livres de texto; o menu real e montado em HTML/CSS.
MENU_CROPS = [
    # (arquivo, recorte livre de texto, largura final, tipo de esmaecimento)
    ('menu-lixorion.png', (900, 0, 1535, 780), 760, 'left'),
    ('menu-eva.png', (20, 390, 540, 1024), 520, 'oval'),
]


def _fade_alpha(size, mode):
    """Alpha suave para a arte encaixar no menu sem borda reta visivel."""
    w, h = size
    xs = np.linspace(0, 1, w)[None, :]
    ys = np.linspace(0, 1, h)[:, None]
    if mode == 'oval':
        r = np.sqrt(((xs - 0.5) / 0.52) ** 2 + ((ys - 0.55) / 0.55) ** 2)
        a = np.clip((1.15 - r) / 0.38, 0, 1)
    else:
        left = np.clip(xs / 0.22, 0, 1)
        right = np.clip((1 - xs) / 0.10, 0, 1)
        top = np.clip(ys / 0.08, 0, 1)
        bottom = np.clip((1 - ys) / 0.14, 0, 1)
        a = left * right * top * bottom
    return (a * 255).astype(np.uint8)


def build_menu_art():
    src = Image.open(rel('assets/menu.png')).convert('RGB')
    out = []
    for name, box, target_w, mode in MENU_CROPS:
        crop = src.crop(box)
        scale = target_w / crop.width
        crop = crop.resize((target_w, max(1, int(crop.height * scale))), Image.LANCZOS)
        alpha = Image.fromarray(_fade_alpha(crop.size, mode), 'L')
        rgba = crop.convert('RGBA')
        rgba.putalpha(alpha)
        path = out_png('menu', name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        rgba.save(path, optimize=True)
        out.append(as_url(path))
    return out


# ============================================================== main

def main():
    os.makedirs(OUT, exist_ok=True)
    data = {}

    print('Eva...')
    data['eva'] = build_eva()

    print('Goblin...')
    data['goblin'] = build_grid_actor(
        'goblin', 'img/Mobs Sprites/Goblin-sprites.png', 4, 5,
        GOBLIN_MAP, GOBLIN_WORLD_H, flat_bg=True, columns=5)

    print('Latao...')
    data['latao'] = build_grid_actor(
        'latao', 'img/Mobs Sprites/Latao-sprites.png', 7, 6,
        LATAO_MAP, LATAO_WORLD_H, flat_bg=True, columns=7)

    print('Lixorion...')
    data['lixorion'] = build_grid_actor(
        'lixorion', 'img/sprites-chefao.png', 4, 2,
        BOSS_MAP, BOSS_WORLD_H, flat_bg=False, columns=4)

    print('Mosca mutante...')
    data['mosca'] = build_mosca()

    print('Mapas...')
    data['maps'] = build_maps()

    print('Arte do menu...')
    data['menu'] = build_menu_art()

    print('Plataformas...')
    data['platforms'] = {}
    for name, path, flat in PLATFORM_SHEETS:
        data['platforms'][name] = build_platform_set(name, path, flat)

    S.write_js(os.path.join(ROOT, 'js', 'sprite-data.js'), 'EVA_SPRITES', data)

    for group, gd in data.items():
        if group == 'maps':
            pass
        elif group == 'menu':
            print('  menu: %s' % ', '.join(gd))
        elif group == 'platforms':
            for k, v in gd.items():
                print('  %s: %d pecas -> %s' % (k, len(v['frames']), v['file']))
        else:
            print('  %s: %d quadros -> %s' % (group, len(gd['frames']), gd['file']))
    print('OK')


if __name__ == '__main__':
    main()
