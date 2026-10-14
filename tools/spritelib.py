"""Utilidades de pre-processamento de sprites do Eva no Lixo Zero.

Nao altera nenhum arquivo original: tudo e escrito em img/generated/.
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ALPHA_CUT = 12


# ---------------------------------------------------------------- background

def _border_seed(shape):
    seed = np.zeros(shape, bool)
    seed[0, :] = seed[-1, :] = True
    seed[:, 0] = seed[:, -1] = True
    return seed


def remove_flat_background(rgb, tol_flat=22.0, tol_shadow=0.07, min_ratio=0.40):
    """Alpha de uma arte com fundo liso claro (com sombra projetada).

    A remocao so acontece na regiao conectada a borda, entao branco/brilho
    dentro do personagem (olhos, dentes, plastico) continua opaco.
    """
    a = rgb.astype(np.float32)
    bg = np.median(
        np.concatenate([a[0, :], a[-1, :], a[:, 0], a[:, -1]]).reshape(-1, 3), axis=0
    )
    dist = np.abs(a - bg).max(axis=2)

    safe = np.maximum(bg, 1.0)
    ratio = a / safe
    spread = np.maximum(
        np.abs(ratio[:, :, 0] - ratio[:, :, 1]), np.abs(ratio[:, :, 1] - ratio[:, :, 2])
    )
    lum = ratio.mean(axis=2)
    shadow = (spread < tol_shadow) & (lum > min_ratio) & (lum <= 1.06)

    bgish = (dist < tol_flat) | shadow
    lab, _ = ndimage.label(bgish)
    outside_ids = np.unique(lab[_border_seed(rgb.shape[:2]) & bgish])
    outside = np.isin(lab, outside_ids[outside_ids > 0])

    inside = ~outside
    inside = ndimage.binary_closing(inside, np.ones((3, 3), bool))
    inside = ndimage.binary_opening(inside, np.ones((3, 3), bool))

    alpha = np.zeros(rgb.shape[:2], np.uint8)
    alpha[inside] = 255
    return alpha


def rgba_from_flat(img):
    rgb = np.asarray(img.convert('RGB'))
    alpha = remove_flat_background(rgb)
    out = np.dstack([rgb, alpha])
    return Image.fromarray(out, 'RGBA')


# ---------------------------------------------------------------- recortes

def content_bbox(img, cut=ALPHA_CUT):
    a = np.asarray(img)[:, :, 3]
    ys, xs = np.nonzero(a > cut)
    if len(xs) == 0:
        return None
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def trim(img, cut=ALPHA_CUT):
    box = content_bbox(img, cut)
    return img.crop(box) if box else None


def drop_specks(img, min_area=120):
    """Remove sujeirinhas soltas (poeira do sheet) mantendo o corpo do sprite."""
    arr = np.array(img)
    mask = arr[:, :, 3] > ALPHA_CUT
    lab, n = ndimage.label(mask, structure=np.ones((3, 3), bool))
    if n == 0:
        return img
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= min_area
    arr[:, :, 3] = np.where(keep[lab], arr[:, :, 3], 0)
    return Image.fromarray(arr, 'RGBA')


def erase_rects(img, rects, pad=4):
    arr = np.array(img)
    h, w = arr.shape[:2]
    for (x0, y0, x1, y1) in rects:
        arr[max(0, y0 - pad):min(h, y1 + pad), max(0, x0 - pad):min(w, x1 + pad), 3] = 0
    return Image.fromarray(arr, 'RGBA')


def foot_anchor(img, band=0.14):
    """Ancora = centro horizontal da base do sprite, no ultimo pixel opaco."""
    a = np.asarray(img)[:, :, 3] > ALPHA_CUT
    h, w = a.shape
    rows = np.nonzero(a.any(axis=1))[0]
    if len(rows) == 0:
        return (w / 2, h)
    bottom = int(rows.max()) + 1
    top = int(rows.min())
    start = max(top, bottom - max(4, int((bottom - top) * band)))
    strip = a[start:bottom]
    cols = np.nonzero(strip.any(axis=0))[0]
    ax = float(cols.mean()) if len(cols) else w / 2
    return (ax, float(bottom))


def center_anchor(img):
    a = np.asarray(img)[:, :, 3] > ALPHA_CUT
    ys, xs = np.nonzero(a)
    if len(xs) == 0:
        return (img.width / 2, img.height / 2)
    return (float(xs.mean()), float(ys.mean()))


def surface_top(img, coverage=0.45):
    """Primeira linha em que a peca ja e solida o bastante para pisar."""
    a = np.asarray(img)[:, :, 3] > 90
    w = a.shape[1]
    for y in range(a.shape[0]):
        if a[y].sum() >= coverage * w:
            return y
    return 0


def resized(img, scale):
    w = max(1, int(round(img.width * scale)))
    h = max(1, int(round(img.height * scale)))
    return img.resize((w, h), Image.LANCZOS)


# ---------------------------------------------------------------- atlas

class Atlas:
    """Empacota quadros em um unico PNG (grade uniforme ou prateleiras)."""

    def __init__(self, name):
        self.name = name
        self.items = []  # (key, Image, ax, ay, extra)

    def add(self, key, img, anchor, extra=None):
        self.items.append((key, img, anchor[0], anchor[1], extra or {}))

    def _write(self, out_png, sheet, frames):
        os.makedirs(os.path.dirname(out_png), exist_ok=True)
        sheet.save(out_png, optimize=True)
        return {'file': out_png.replace(chr(92), '/'), 'frames': frames}

    def save(self, out_png, columns=None):
        if not self.items:
            raise ValueError('atlas vazio: ' + self.name)
        cw = max(i[1].width for i in self.items)
        ch = max(i[1].height for i in self.items)
        n = len(self.items)
        cols = columns or int(np.ceil(np.sqrt(n)))
        rows = int(np.ceil(n / cols))
        sheet = Image.new('RGBA', (cols * cw, rows * ch), (0, 0, 0, 0))
        frames = {}
        for i, (key, img, ax, ay, extra) in enumerate(self.items):
            cx = (i % cols) * cw
            cy = (i // cols) * ch
            sheet.paste(img, (cx, cy))
            frames[key] = dict(extra, x=cx, y=cy, w=img.width, h=img.height,
                               ax=round(ax, 1), ay=round(ay, 1))
        return self._write(out_png, sheet, frames)

    def save_packed(self, out_png, max_width=2048, pad=2):
        """Empacotamento em prateleiras: bem mais compacto para pecas variadas."""
        if not self.items:
            raise ValueError('atlas vazio: ' + self.name)
        order = sorted(range(len(self.items)),
                       key=lambda i: -self.items[i][1].height)
        placed = {}
        x = y = shelf_h = 0
        width = 0
        for i in order:
            img = self.items[i][1]
            if x + img.width + pad > max_width and x > 0:
                x = 0
                y += shelf_h + pad
                shelf_h = 0
            placed[i] = (x, y)
            x += img.width + pad
            width = max(width, x)
            shelf_h = max(shelf_h, img.height)
        height = y + shelf_h + pad

        sheet = Image.new('RGBA', (max(1, width), max(1, height)), (0, 0, 0, 0))
        frames = {}
        for i, (key, img, ax, ay, extra) in enumerate(self.items):
            px, py = placed[i]
            sheet.paste(img, (px, py))
            frames[key] = dict(extra, x=px, y=py, w=img.width, h=img.height,
                               ax=round(ax, 1), ay=round(ay, 1))
        return self._write(out_png, sheet, frames)


def write_js(path, varname, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    body = json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True)
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('/* Gerado por tools/extract_sprites.py - nao edite a mao. */\n')
        fh.write('window.%s = %s;\n' % (varname, body))
