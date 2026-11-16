const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const mongoose = require('mongoose');
const { entorno } = require('./entorno.cjs');

// Modelo/validación/CAS de Mongoose reales. Solo el transporte de colección es simulado.
function cargar(archivo) {
  const modulo = new Module(archivo, module);
  modulo.filename = archivo;
  modulo.paths = Module._nodeModulePaths(path.dirname(archivo));
  const requerir = modulo.require.bind(modulo);
  modulo.require = nombre => nombre.startsWith('.') ? cargar(path.resolve(path.dirname(archivo), nombre + '.ts')) : requerir(nombre);
  modulo._compile(ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, archivo);
  return modulo.exports;
}
const { ModeloDomicilioCiudadano: Modelo } = cargar(path.resolve(__dirname, '../../src/modelos/DomicilioCiudadano.ts'));

function entornoDomicilio(opciones = {}) {
  const e = entorno('ciudadano', { ...opciones, dependencias: { '@/modelos/DomicilioCiudadano': { ModeloDomicilioCiudadano: Modelo } } });
  e.state.mongoUsers.push({ id_clerk: e.actor.id, correo_electronico: e.actor.emailAddresses[0].emailAddress,
    nombre_completo: 'Ciudadano', rol: 'ciudadano', activo: true });
  Object.assign(e.state, { domicilios: [], indices: [{ key: { ciudadano_id_clerk: 1 }, unique: true }],
    consultasDomicilio: [], escriturasDomicilio: [], falloDomicilio: false, antesInsertar: null, antesGuardar: null });
  const copia = valor => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(valor));
  const coincide = (doc, filtro) => Object.entries(filtro).every(([clave, valor]) => String(doc[clave]) === String(valor));
  Modelo.collection.indexes = async () => {
    if (e.state.falloDomicilio) throw Error('mongodb://secreto [-97.09,20.45]');
    return e.state.indices;
  };
  Modelo.collection.findOne = async filtro => {
    e.state.consultasDomicilio.push(copia(filtro));
    if (e.state.falloDomicilio) throw Error('mongodb://secreto [-97.09,20.45]');
    const doc = e.state.domicilios.find(doc => coincide(doc, filtro));
    return doc ? copia(doc) : null;
  };
  Modelo.collection.insertOne = async doc => {
    if (e.state.antesInsertar) await e.state.antesInsertar();
    if (e.state.falloDomicilio) throw Error('mongodb://secreto [-97.09,20.45]');
    if (e.state.domicilios.some(d => d.ciudadano_id_clerk === doc.ciudadano_id_clerk)) throw Object.assign(Error('duplicado privado'), { code: 11000 });
    e.state.domicilios.push(copia(doc)); e.state.escriturasDomicilio.push('insert');
    if (e.state.despuesInsertar) await e.state.despuesInsertar();
    return { acknowledged: true, insertedId: doc._id };
  };
  Modelo.collection.updateOne = async (filtro, cambio) => {
    if (e.state.antesGuardar) await e.state.antesGuardar(filtro, cambio);
    if (e.state.falloDomicilio) throw Error('mongodb://secreto [-97.09,20.45]');
    const doc = e.state.domicilios.find(doc => coincide(doc, filtro));
    if (!doc) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    for (const [clave, valor] of Object.entries(cambio.$set || {})) {
      const partes = clave.split('.'); let destino = doc;
      for (const parte of partes.slice(0, -1)) destino = destino[parte];
      destino[partes.at(-1)] = copia({ valor }).valor;
    }
    for (const [clave, valor] of Object.entries(cambio.$inc || {})) doc[clave] += valor;
    e.state.escriturasDomicilio.push('update');
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  };
  e.sembrar = (propietario = e.actor.id, cambios = {}) => {
    const ahora = new Date();
    const doc = new Modelo({ ciudadano_id_clerk: propietario, ubicacion: { type: 'Point', coordinates: [-97.09, 20.45] },
      tipo_seleccion: 'manual', fecha_confirmacion: ahora, ...cambios }).toObject();
    e.state.domicilios.push(copia(doc)); return doc;
  };
  e.directa = async (metodo, cuerpo, headers = {}, query = '') => {
    const handler = e.load(path.resolve(__dirname, '../../src/app/api/ciudadano/domicilio/route.ts'))[metodo];
    return handler(new Request('https://ecotrack.test/api/ciudadano/domicilio' + query, {
      method: metodo, headers: { 'content-type': 'application/json', ...headers }, ...(cuerpo === undefined ? {} : { body: cuerpo }),
    }));
  };
  return e;
}
module.exports = { entornoDomicilio };
