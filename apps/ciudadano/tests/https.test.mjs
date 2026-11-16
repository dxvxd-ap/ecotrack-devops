import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { prepararHTTPS } from '../scripts/prepare-https.mjs';
import { comprobarCertificado } from '../scripts/check-https.mjs';

test('genera una cadena local válida con SAN para iPhone y no sobreescribe una CA previa', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ecotrack-tls-'));
  await prepararHTTPS(dir, ['192.0.2.10']);
  const text = execFileSync('openssl', ['x509', '-in', join(dir, 'localhost.pem'), '-noout', '-text'], { encoding: 'utf8' });
  assert.match(text, /IP Address:192\.0\.2\.10/);
  assert.match(text, /DNS:localhost/);
  assert.match(execFileSync('openssl', ['verify', '-CAfile', join(dir, 'ca.pem'), join(dir, 'localhost.pem')], { encoding: 'utf8' }), /OK/);
  const cert = await readFile(join(dir, 'localhost.pem'), 'utf8');
  const ca = await readFile(join(dir, 'ca.pem'), 'utf8');
  assert.equal(comprobarCertificado(cert, ca, '192.0.2.10').host, '192.0.2.10');
  assert.throws(() => comprobarCertificado(cert, ca, '192.0.2.99'), /nombre/);
  assert.throws(() => comprobarCertificado(cert, ca, '192.0.2.10', Date.parse('2100-01-01')), /vigente/);
  await assert.rejects(prepararHTTPS(dir, ['192.0.2.10']), /existentes/);
  assert.equal(await readFile(join(dir, 'ca.pem'), 'utf8'), ca);
});
test('rechaza nombres con saltos de línea antes de generar certificados', async () => {
  await assert.rejects(prepararHTTPS('/no-debe-crearse', ['host\nsubjectAltName=DNS:otro']), /válido/);
});
test('tampoco sobrescribe una configuración TLS preexistente', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ecotrack-tls-'));
  await writeFile(join(dir, 'ca.cnf'), 'configuración existente');
  await assert.rejects(prepararHTTPS(dir, ['192.0.2.10']), /existentes/);
  assert.equal(await readFile(join(dir, 'ca.cnf'), 'utf8'), 'configuración existente');
});
