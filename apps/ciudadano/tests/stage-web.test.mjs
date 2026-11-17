import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stageWeb } from '../scripts/stage-web.mjs';

test('publica el artefacto /eco con assets sin tocar archivos ajenos', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ecotrack-stage-'));
  const src = join(root, 'dist'); const dst = join(root, 'public', 'eco');
  await mkdir(join(src, 'assets'), { recursive: true });
  await writeFile(join(src, 'index.html'), '<script src="/eco/assets/app.js"></script>');
  await writeFile(join(src, 'assets', 'app.js'), 'console.log("ok")');
  await stageWeb(src, dst);
  assert.match(await readFile(join(dst, 'index.html'), 'utf8'), /\/eco\/assets/);
  assert.equal(await readFile(join(dst, 'assets', 'app.js'), 'utf8'), 'console.log("ok")');
  await writeFile(join(dst, 'manual.txt'), 'trabajo existente');
  await assert.rejects(stageWeb(src, dst), /ajenos/);
  assert.equal(await readFile(join(dst, 'manual.txt'), 'utf8'), 'trabajo existente');
});

test('no publica un build Android por error bajo /eco/', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ecotrack-stage-'));
  const src = join(root, 'dist');
  await mkdir(src);
  await writeFile(join(src, 'index.html'), '<script src="/assets/app.js"></script>');
  await assert.rejects(stageWeb(src, join(root, 'public')), /eco/);
});
