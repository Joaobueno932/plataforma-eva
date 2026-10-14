# -*- coding: utf-8 -*-
"""Monta tiras de conferencia a partir dos atlas gerados (uso: debug)."""
import io
import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load():
    src = io.open(os.path.join(ROOT, 'js', 'sprite-data.js'), encoding='utf-8').read()
    return json.loads(src[src.index('=') + 1:src.rindex(';')])


def strip(data, group, out_dir, cell=150, ground=0.82):
    g = data[group]
    sheet = Image.open(os.path.join(ROOT, g['file'])).convert('RGBA')
    anims = g.get('anim') or {'todos': sorted(g['frames'])}
    rows = len(anims)
    cols = max(len(v) for v in anims.values())
    out = Image.new('RGBA', (cols * cell + 130, rows * cell), (35, 40, 38, 255))
    d = ImageDraw.Draw(out)
    for r, (name, keys) in enumerate(sorted(anims.items())):
        d.text((6, r * cell + 6), name, fill=(180, 255, 160))
        base_y = int(r * cell + cell * ground)
        d.line([(130, base_y), (out.width, base_y)], fill=(90, 110, 100))
        for c, key in enumerate(keys):
            f = g['frames'][key]
            img = sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
            s = g.get('scale', 1.0) * 1.0
            img = img.resize((max(1, int(f['w'] * s)), max(1, int(f['h'] * s))), Image.LANCZOS)
            ox = int(130 + c * cell + cell / 2 - f['ax'] * s)
            oy = int(base_y - f['ay'] * s)
            out.alpha_composite(img, (max(0, ox), max(0, oy)))
    out.convert('RGB').save(os.path.join(out_dir, 'anim_%s.png' % group))


if __name__ == '__main__':
    out_dir = sys.argv[1]
    data = load()
    for group in ['eva', 'goblin', 'latao', 'lixorion', 'mosca']:
        strip(data, group, out_dir)
    print('ok')
