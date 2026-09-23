#!/usr/bin/env python3
"""
Recut the two CJK web fonts behind --brush-cjk (src/styles/global.css) to
exactly the characters the Chinese bird names use.

    python3 scripts/subset-cjk.py [--fonts DIR]

Reads src/data/birds.json, collects every CJK character inside the
parenthesised gloss of every name, and writes

    public/fonts/ma-shan-zheng-names.woff2   Ma Shan Zheng, the brush (the
                                             265 of them it has)
    public/fonts/lxgw-wenkai-names.woff2     LXGW WenKai, all of them — the
                                             per-glyph fallback for the 13
                                             the brush lacks, and the whole
                                             face if --brush-cjk is switched
                                             to WenKai alone

Run this after a Notion sync adds a name with a character that was not
there before; until you do, that one character falls through to
--serif-cjk (a Song face — legible, just not the brush).

Needs fontTools with brotli (`pip3 install --user fonttools brotli`) and the
full source fonts, which are not in the repo (they are 5.9 MB and 25 MB):

    MaShanZheng-Regular.ttf  https://github.com/google/fonts/tree/main/ofl/mashanzheng
    LXGWWenKai-Regular.ttf   https://github.com/lxgw/LxgwWenKai/releases

Put them in a directory and pass it with --fonts (default: ./fonts-src).
Both are SIL OFL 1.1; the licence texts shipped beside the .woff2 files
must stay there. WenKai's licence carries an additional permission that
expressly allows subsets under the reserved name for web delivery, which is
what this is.

To switch the brush to another face: subset it here in place of Ma Shan
Zheng, change the family name in the @font-face and in --brush-cjk, and
re-measure the inscription's stroke contrast at 1x and 2x — the size in
src/pages/birds/[slug].astro (.bird__inscription) was chosen on that
measurement, not on taste.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BIRDS = ROOT / 'src' / 'data' / 'birds.json'
OUT = ROOT / 'public' / 'fonts'

BRUSH = ('MaShanZheng-Regular.ttf', 'ma-shan-zheng-names.woff2')
FILL = ('LXGWWenKai-Regular.ttf', 'lxgw-wenkai-names.woff2')


def name_chars() -> set[str]:
    chars: set[str] = set()
    for bird in json.loads(BIRDS.read_text()):
        m = re.search(r'[（(]([^)）]*)[)）]', bird['name'])
        if m:
            chars.update(c for c in m.group(1) if ord(c) > 0x2E80)
    return chars


def cmap(path: Path) -> set[int]:
    from fontTools.ttLib import TTFont

    return set(TTFont(str(path)).getBestCmap())


def subset(src: Path, dst: Path, chars: str) -> None:
    text = dst.with_suffix('.txt.tmp')
    text.write_text(chars)
    try:
        subprocess.run(
            [
                sys.executable, '-m', 'fontTools.subset', str(src),
                f'--text-file={text}', '--flavor=woff2', '--layout-features=',
                '--no-hinting', '--desubroutinize', '--name-IDs=*',
                f'--output-file={dst}',
            ],
            check=True,
        )
    finally:
        text.unlink(missing_ok=True)
    print(f'{dst.relative_to(ROOT)}  {dst.stat().st_size:,} bytes  {len(chars)} characters')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--fonts', default=str(ROOT / 'fonts-src'), help='directory holding the full source .ttf files')
    args = ap.parse_args()
    fonts = Path(args.fonts)

    chars = name_chars()
    print(f'{len(chars)} distinct characters in the Chinese names')

    brush_src = fonts / BRUSH[0]
    fill_src = fonts / FILL[0]
    for p in (brush_src, fill_src):
        if not p.exists():
            sys.exit(f'missing {p} — see the docstring for where to get it')

    have = cmap(brush_src)
    in_brush = ''.join(sorted(c for c in chars if ord(c) in have))
    missing = ''.join(sorted(c for c in chars if ord(c) not in have))
    subset(brush_src, OUT / BRUSH[1], in_brush)

    fill_have = cmap(fill_src)
    still = [c for c in chars if ord(c) not in fill_have]
    if still:
        print(f'WARNING: WenKai lacks {"".join(still)} — those fall through to --serif-cjk')
    print(f'the brush lacks {len(missing)}: {missing or "nothing"}')
    subset(fill_src, OUT / FILL[1], ''.join(sorted(c for c in chars if ord(c) in fill_have)))


if __name__ == '__main__':
    main()
