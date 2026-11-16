import { X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function comprobarCertificado(certPem, caPem, host, ahora = Date.now()) {
  const cert = new X509Certificate(certPem); const ca = new X509Certificate(caPem);
  if (![cert, ca].every(c => Date.parse(c.validFrom) <= ahora && ahora <= Date.parse(c.validTo))) throw new Error('El certificado o su CA no está vigente.');
  if (!ca.ca || !ca.verify(ca.publicKey) || !cert.verify(ca.publicKey)) throw new Error('Firma del certificado no válida para esta CA.');
  const coincide = isIP(host) ? cert.checkIP(host) : cert.checkHost(host);
  if (!coincide) throw new Error('La IP/nombre del enlace no corresponde al certificado.');
  return { host, validoHasta: cert.validTo, huellaCA_SHA256: ca.fingerprint256 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.argv[2];
  if (!host) throw new Error('Uso: npm run https:check -- <IP-o-nombre-del-enlace>');
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../.certs');
  const resultado = comprobarCertificado(await readFile(join(dir, 'localhost.pem')), await readFile(join(dir, 'ca.pem')), host);
  console.log(JSON.stringify(resultado, null, 2));
  console.log('Certificado local verificado. Esto NO comprueba la confianza instalada ni el indicador de Safari en el iPhone.');
}
