# snap.mjs が書いた JSON をコマ撮り画像にする（調整用）
import json, sys
from PIL import Image, ImageDraw
panels = json.load(open(sys.argv[1]))
W, H, ox, oy, S = 1440, 560, 40, 500, 0.5
cols = 2
rows = (len(panels) + cols - 1) // cols
im = Image.new('RGB', (int(W * cols * S), int(H * rows * S)), '#f4f1ea')
d = ImageDraw.Draw(im)
for i, p in enumerate(panels):
    px, py = (i % cols) * W * S, (i // cols) * H * S
    d.rectangle([px, py, px + W * S - 1, py + H * S - 1], outline='#888')
    d.line([px, py + oy * S, px + W * S, py + oy * S], fill='#555', width=2)
    for poly in p['polys']:
        pts = [(px + (x + ox) * S, py + (y + oy) * S) for x, y in poly['v']]
        d.polygon(pts, fill=poly['c'], outline='#222')
    d.text((px + 6, py + 6), p['label'], fill='#000')
im.save(sys.argv[2])
