#!/usr/bin/env python3
"""Pull every image block out of one saved notion-fetch result and download it.

The Great Blue Heron's photo page has 29 image blocks, so `notion-fetch`
overflows the tool-result limit -- but the harness saves the whole reply to a
file first, and the signed URLs are in it. Five-minute window, so: extract,
then download all of them at once.

Usage: gbh-grab.py <saved-result.txt> <pageId> <outdir>
"""
import re, sys, os, urllib.parse, subprocess

src, page, out = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src).read()

# The result is JSON-escaped markdown: ![](URL). The query string carries
# %2F and & but never a quote or a paren, so stop at those. X-Amz-Signature
# is NOT last -- SignedHeaders follows it -- so match the whole thing.
urls = re.findall(r'https://prod-files-secure\.s3\.[^\s"\'\\)<>]+', text)

seen, keep = set(), []
for u in urls:
    key = urllib.parse.urlparse(u).path
    if key in seen:
        continue
    seen.add(key)
    keep.append(u)

print(f'{len(urls)} urls, {len(keep)} unique objects')
os.makedirs(out, exist_ok=True)

procs = []
for i, u in enumerate(keep):
    ext = os.path.splitext(urllib.parse.urlparse(u).path)[1].lower() or '.png'
    name = f'{page}-{i}{ext}'
    procs.append((name, subprocess.Popen(
        ['curl', '-sS', '--max-time', '240', '-o', os.path.join(out, name), u])))

bad = []
for name, p in procs:
    p.wait()
    size = os.path.getsize(os.path.join(out, name))
    # an S3 error document is ~400 bytes of XML; a photograph is not
    tag = 'ok ' if size > 20000 else 'BAD'
    if size <= 20000:
        bad.append(name)
    print(f'  {tag} {name:52s} {size/1e6:8.3f} MB')

print(f'\n{len(keep) - len(bad)}/{len(keep)} ok')
if bad:
    print('FAILED:', ' '.join(bad))
    sys.exit(1)
