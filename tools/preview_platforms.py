# -*- coding: utf-8 -*-
"""Contact sheet numerado das pecas de plataforma (uso: escolher ids)."""
import io
import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(out_dir):
    src = io.open(os.path.join(ROOT, 'js', 'sprite-data.js'), encoding='utf-8').read()
    data = json.loads(src[src.index('=') + 1:src.rindex(';')])
    for setname, g in data['platforms'].items():
        sheet = Image.open(os.path.join(ROOT, g['file'])).convert('RGBA')
        keys = sorted(g['frames'])
        cell = 170
        cols = 8
        rows = (len(keys) + cols - 1) // cols
        out = Image.new('RGBA', (cols * cell, rows * (cell + 18)), (32, 34, 36, 255))
        d = ImageDraw.Draw(out)
        for i, key in enumerate(keys):
            f = g['frames'][key]
            img = sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
            s = min(cell / img.width, cell / img.height, 1.0)
            img = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)
            ox = (i % cols) * cell + (cell - img.width) // 2
            oy = (i // cols) * (cell + 18) + 18
            out.alpha_composite(img, (ox, oy))
            d.text(((i % cols) * cell + 4, (i // cols) * (cell + 18) + 3),
                   '%s  %dx%d t%d' % (key.split('_')[-1], f['w'], f['h'], f.get('top', 0)),
                   fill=(255, 220, 90))
        out.convert('RGB').save(os.path.join(out_dir, 'pieces_%s.png' % setname))
        print(setname, len(keys))


if __name__ == '__main__':
    main(sys.argv[1])
