"""筆文字フォントを、ゲームで使う文字だけに絞る（GitHub Pages に置くファイルを小さくするため）。

  python3 tools/subset-font.py 元のフォント.ttf

src/*.js・index.html・style.css に出てくる文字と、かな・英数字を残す。
出力：assets/fonts/yuji-boku-subset.woff2
必要：pip install fonttools brotli
"""
import sys, pathlib, subprocess
root = pathlib.Path(__file__).resolve().parent.parent
chars = set()
for f in list((root / 'src').glob('*.js')) + [root / 'index.html', root / 'style.css']:
    chars |= set(f.read_text(encoding='utf-8'))
# かな・英数字・記号
for a, b in [(0x20, 0x7e), (0x3000, 0x30ff), (0xff01, 0xff5e)]:
    chars |= {chr(c) for c in range(a, b + 1)}
chars = sorted(c for c in chars if ord(c) >= 0x20)
text = ''.join(chars)
(root / 'tools' / '.subset-chars.txt').write_text(text, encoding='utf-8')
out = root / 'assets' / 'fonts' / 'yuji-boku-subset.woff2'
subprocess.run([sys.executable, '-m', 'fontTools.subset', sys.argv[1], f'--text-file={root / "tools" / ".subset-chars.txt"}',
                '--flavor=woff2', f'--output-file={out}', '--layout-features=*', '--no-hinting'], check=True)
(root / 'tools' / '.subset-chars.txt').unlink()
print(f'{len(chars)} 文字 → {out} ({out.stat().st_size // 1024} KB)')
