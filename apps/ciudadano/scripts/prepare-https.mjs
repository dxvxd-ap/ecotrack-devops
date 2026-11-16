import { mkdir, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { isIP } from 'node:net';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Crea una CA exclusiva del proyecto; nunca instala confianza ni modifica certificados existentes. */
export async function prepararHTTPS(dir, hosts) {
  if (!hosts.length || hosts.some(h => !isIP(h) && !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(h))) throw new Error('Indica una IP o nombre de equipo válido.');
  const nombres = [...new Set(['localhost', '127.0.0.1', '::1', ...hosts])];
  for (const file of ['ca-key.pem', 'ca.pem', 'localhost.key', 'localhost.pem', 'ca.cnf', 'server.cnf', 'localhost.csr', 'ca.srl', 'ecotrack-ca.cer']) {
    let exists = false;
    try { await access(join(dir, file)); exists = true; } catch { /* no existe */ }
    if (exists) throw new Error('Hay certificados existentes. Se conservan: usa otro directorio si necesitas otra IP.');
  }
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const run = args => execFileSync('openssl', args, { stdio: 'ignore' });
  const caConfig = '[req]\ndistinguished_name=dn\nx509_extensions=ca\nprompt=no\n[dn]\nCN=EcoTrack desarrollo local\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n';
  await writeFile(join(dir, 'ca.cnf'), caConfig, { mode: 0o600 });
  run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'ca-key.pem'), '-out', join(dir, 'ca.pem'), '-days', '365', '-config', join(dir, 'ca.cnf')]);
  const ext = ['basicConstraints=critical,CA:FALSE', 'keyUsage=critical,digitalSignature,keyEncipherment', 'extendedKeyUsage=serverAuth', `subjectAltName=${nombres.map(h => `${isIP(h) ? 'IP' : 'DNS'}:${h}`).join(',')}`].join('\n');
  await writeFile(join(dir, 'server.cnf'), ext, { mode: 0o600 });
  run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'localhost.key'), '-out', join(dir, 'localhost.csr'), '-subj', '/CN=EcoTrack desarrollo']);
  run(['x509', '-req', '-in', join(dir, 'localhost.csr'), '-CA', join(dir, 'ca.pem'), '-CAkey', join(dir, 'ca-key.pem'), '-CAcreateserial', '-out', join(dir, 'localhost.pem'), '-days', '90', '-extfile', join(dir, 'server.cnf')]);
  run(['x509', '-in', join(dir, 'ca.pem'), '-outform', 'DER', '-out', join(dir, 'ecotrack-ca.cer')]);
  // OpenSSL puede crear claves con permisos amplios según umask del sistema.
  const { chmod } = await import('node:fs/promises');
  await chmod(join(dir, 'ca-key.pem'), 0o600); await chmod(join(dir, 'localhost.key'), 0o600);
  return nombres;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../.certs');
  const hosts = await prepararHTTPS(dir, process.argv.slice(2));
  console.log(`Certificados locales preparados para ${hosts.join(', ')}.\nTransfiere SOLO .certs/ecotrack-ca.cer al iPhone y habilita su confianza. No compartas archivos .key ni ca-key.pem.`);
}
