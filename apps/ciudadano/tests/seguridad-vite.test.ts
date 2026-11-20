import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { isFileServingAllowed, resolveConfig, type UserConfigFn } from 'vite';
import configurarVite from '../vite.config.ts';

test('el servidor nunca sirve claves ni certificados locales, conservando protección de .env y .git', async () => {
  const base = await (configurarVite as UserConfigFn)({ command: 'serve', mode: 'test' });
  const config = await resolveConfig({ ...base, configFile: false, envFile: false, logLevel: 'silent' }, 'serve');
  for (const file of ['.certs/localhost.key', '.certs/ecotrack-ca.cer', 'otra.key', '.env', '.env.local', '.git/config']) {
    assert.equal(isFileServingAllowed(config, resolve(file)), false, `Archivo privado expuesto: ${file}`);
  }
  assert.equal(isFileServingAllowed(config, resolve('src/main.tsx')), true);
});


test('Vercel compila en raíz y reescribe solo la API; desarrollo y build eco conservan /eco/', async () => {
  const config = configurarVite as UserConfigFn;
  const produccion = await config({command: 'build', mode: 'production'});
  const eco = await config({command: 'build', mode: 'eco'});
  const local = await config({command: 'serve', mode: 'development'});
  assert.equal(produccion.base, '/');
  assert.equal(produccion.appType, 'mpa');
  assert.equal(produccion.build?.outDir, 'dist');
  assert.equal(eco.base, '/eco/');
  assert.equal(eco.build?.outDir, 'dist-eco');
  assert.equal(local.base, '/eco/');
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.deepEqual(vercel.rewrites, [{
    source: '/api/:path*',
    destination: 'https://ecotrack-iota-five.vercel.app/api/:path*',
  }]);
});
