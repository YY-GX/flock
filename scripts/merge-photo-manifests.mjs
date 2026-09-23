#!/usr/bin/env node
// Merge src/data/photos-part-*.json into photos.json's `files` arrays.
//
// The four download agents each wrote a manifest for their own slice. This
// folds them into photos.json, then checks every filename actually exists on
// disk — the agents shared a scratchpad and clobbered each other's helper
// scripts, so the manifests are not trusted without verification.

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src/data');
const photoDir = join(root, 'src/assets/photos');

const photos = JSON.parse(readFileSync(join(dataDir, 'photos.json'), 'utf8'));
const onDisk = new Set(readdirSync(photoDir).filter((f) => !f.startsWith('.')));

const parts = readdirSync(dataDir)
  .filter((f) => /^photos-part-\d+\.json$/.test(f))
  .sort();

if (parts.length === 0) {
  console.error('no photos-part-*.json found — nothing to merge');
  process.exit(1);
}

// id -> files, last writer wins but collisions are reported
const byId = new Map();
const collisions = [];
for (const part of parts) {
  const entries = JSON.parse(readFileSync(join(dataDir, part), 'utf8'));
  for (const { id, files } of entries) {
    if (byId.has(id) && JSON.stringify(byId.get(id).files) !== JSON.stringify(files)) {
      collisions.push({ id, from: byId.get(id).part, to: part });
    }
    byId.set(id, { files: files ?? [], part });
  }
  console.log(`${part}: ${entries.length} entries`);
}

// Fall back to scanning disk for ids the manifests missed. Filenames are
// `<pageId>-<n>.<ext>`, so the stem before the last dash is the page id.
const diskById = new Map();
for (const f of onDisk) {
  const m = f.match(/^([0-9a-f]{32})-(\d+)\.(\w+)$/);
  if (!m) continue;
  if (!diskById.has(m[1])) diskById.set(m[1], []);
  diskById.get(m[1]).push({ name: f, index: Number(m[2]) });
}
for (const list of diskById.values()) list.sort((a, b) => a.index - b.index);

let matched = 0;
let recovered = 0;
let missing = 0;
const missingFiles = [];

for (const photo of photos) {
  let files = byId.get(photo.id)?.files ?? [];

  // Drop manifest entries whose file is not actually on disk.
  const present = files.filter((f) => onDisk.has(f));
  if (present.length !== files.length) {
    missingFiles.push(...files.filter((f) => !onDisk.has(f)));
  }
  files = present;

  // Manifest empty or incomplete? Trust the disk.
  const fromDisk = (diskById.get(photo.id) ?? []).map((e) => e.name);
  if (fromDisk.length > files.length) {
    if (files.length > 0) recovered++;
    files = fromDisk;
  }

  photo.files = files;
  if (files.length > 0) matched++;
  else missing++;
}

writeFileSync(join(dataDir, 'photos.json'), JSON.stringify(photos, null, 2) + '\n');

const totalFiles = photos.reduce((n, p) => n + p.files.length, 0);
const orphans = [...diskById.keys()].filter((id) => !photos.some((p) => p.id === id));

console.log('---');
console.log(`photos.json entries : ${photos.length}`);
console.log(`with >=1 file       : ${matched}`);
console.log(`with no file        : ${missing}`);
console.log(`total filenames     : ${totalFiles}`);
console.log(`image files on disk : ${onDisk.size}`);
if (recovered) console.log(`recovered from disk : ${recovered} (manifest was short)`);
if (collisions.length) console.log(`manifest collisions : ${collisions.length}`, collisions.slice(0, 5));
if (missingFiles.length) console.log(`listed but absent   : ${missingFiles.length}`, missingFiles.slice(0, 5));
if (orphans.length) console.log(`orphan ids on disk  : ${orphans.length}`, orphans.slice(0, 5));

const bytes = [...onDisk].reduce((n, f) => n + statSync(join(photoDir, f)).size, 0);
console.log(`on-disk size        : ${(bytes / 1e9).toFixed(2)} GB`);
