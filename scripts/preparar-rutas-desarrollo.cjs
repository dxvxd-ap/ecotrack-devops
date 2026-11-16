#!/usr/bin/env node
// Opt-in. No carga dotenv ni usa MONGODB_URI de la aplicación. Nunca se importa al arrancar.
const fs = require('node:fs');
const path = require('node:path');
class ErrorPreparacion extends Error {}
function validarDestino(uri) {
 let url;
 try { url = new URL(uri); } catch { throw new ErrorPreparacion('Indica --uri=mongodb://127.0.0.1:PUERTO/ecotrack_rutas_dev_NOMBRE'); }
 if (url.protocol !== 'mongodb:' || url.hostname !== '127.0.0.1' || !url.port || Number(url.port) < 1024 ||
     url.username || url.password || url.search || url.hash || !/^\/ecotrack_rutas_dev_[a-z0-9_]+$/.test(url.pathname)) {
  throw new ErrorPreparacion('Destino rechazado: solo loopback con puerto y base ecotrack_rutas_dev_NOMBRE, sin credenciales ni parámetros');
 }
 return { uri: url.href, base: url.pathname.slice(1), puerto: Number(url.port) };
}
async function main(args = process.argv.slice(2)) {
 if (args.some(a => a !== '--confirm' && !a.startsWith('--uri=')) || args.filter(a => a.startsWith('--uri=')).length !== 1) {
  throw new ErrorPreparacion('Uso: node scripts/preparar-rutas-desarrollo.cjs --uri=mongodb://127.0.0.1:PUERTO/ecotrack_rutas_dev_NOMBRE [--confirm]');
 }
 const destino = validarDestino(args.find(a => a.startsWith('--uri=')).slice(6));
 const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../datos/desarrollo/rutas-ficticias.json'), 'utf8'));
 if (!args.includes('--confirm')) {
  console.log(JSON.stringify({ sin_escrituras: true, sin_conexion: true, base: destino.base, rutas_ficticias: fixtures.length }));
  return;
 }
 const { MongoClient } = require('mongoose').mongo;
 const cliente = new MongoClient(destino.uri, { directConnection: true, serverSelectionTimeoutMS: 5000 });
 try {
  await cliente.connect();
  const coleccion = cliente.db(destino.base).collection('rutas');
  if (await coleccion.countDocuments({}) !== 0) throw new ErrorPreparacion('La colección rutas no está vacía: no se sobrescribe ni se importa nada');
  await coleccion.createIndex({ id_ruta: 1 }, { unique: true });
  const ahora = new Date();
  const documentos = fixtures.map(d => ({ ...d, fecha_creacion: ahora, fecha_actualizacion: ahora }));
  const resultado = await coleccion.insertMany(documentos, { ordered: true, writeConcern: { w: 'majority' } });
  if (!resultado.acknowledged || resultado.insertedCount !== documentos.length) throw new ErrorPreparacion('No se confirmaron todas las rutas ficticias');
  console.log(JSON.stringify({ preparado: true, base: destino.base, rutas_ficticias: resultado.insertedCount }));
 } finally { await cliente.close(); }
}
if (require.main === module) main().catch(error => {
 console.error(error instanceof ErrorPreparacion ? error.message : 'No se pudo confirmar la preparación de la base local');
 process.exitCode = 1;
});
module.exports = { validarDestino, main };
