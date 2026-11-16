import { mkdir, readdir, readFile, writeFile, lstat, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

async function filesAt(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error('No se publican enlaces simbólicos.');
    if (entry.isDirectory()) files.push(...await filesAt(root, path));
    else files.push(path);
  }
  return files;
}

/** Copia únicamente builds propios. No elimina archivos ni reemplaza un directorio manual. */
export async function stageWeb(source, target) {
  const html = await readFile(join(source, 'index.html'), 'utf8');
  if (!html.includes('/eco/assets/')) throw new Error('Se requiere el build web con base /eco/.');
  const marker = '.ecotrack-build.json';
  const files = await filesAt(source);
  let exists = true;
  try { await lstat(target); } catch (e) { if (e.code === 'ENOENT') exists = false; else throw e; }
  let previous = [];
  if (exists) {
    try {
      const parsed = JSON.parse(await readFile(join(target, marker), 'utf8'));
      if (parsed.owner !== 'ecotrack-ciudadano' || !Array.isArray(parsed.files)) throw new Error();
      previous = parsed.files;
    } catch { throw new Error('Destino con archivos ajenos: no se sobrescribirá.'); }
    const existing = await filesAt(target);
    if (existing.some(f => f !== marker && !previous.includes(f))) throw new Error('Destino con archivos ajenos: no se sobrescribirá.');
  }
  await mkdir(target, { recursive: true });
  for (const file of files) {
    await mkdir(dirname(join(target, file)), { recursive: true });
    await copyFile(join(source, file), join(target, file));
  }
  // Se conservan los assets antiguos para pestañas abiertas; no hay limpieza destructiva.
  await writeFile(join(target, marker), JSON.stringify({ owner: 'ecotrack-ciudadano', files: [...new Set([...previous, ...files])] }, null, 2));
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const files = await stageWeb(join(app, 'dist'), resolve(app, '../../public/eco'));
  console.log(`Build web preparado en public/eco (${files.length} archivos). Sin despliegue.`);
}
