import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
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
