const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Mongoose real, sin conexión: solo se sustituye el transporte en la prueba CAS.
const cargados = new Map();
function cargar(relativa) {
  const archivo = path.resolve(__dirname, '..', relativa);
  if (cargados.has(archivo)) return cargados.get(archivo).exports;
  const modulo = new Module(archivo, module);
  modulo.filename = archivo;
  modulo.paths = Module._nodeModulePaths(path.dirname(archivo));
  const requerir = modulo.require.bind(modulo);
  modulo.require = nombre => nombre.startsWith('.')
    ? cargar(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(archivo), nombre + '.ts')))
    : requerir(nombre);
  modulo._compile(ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, archivo);
  cargados.set(archivo, modulo);
  return modulo.exports;
}

function contratos() { return cargar('src/contratos/domicilio.ts'); }
function modelo() { return cargar('src/modelos/DomicilioCiudadano.ts').ModeloDomicilioCiudadano; }
const fecha = new Date('2026-11-15T12:00:00.000Z');
function datos(cambios = {}) {
  return { ciudadano_id_clerk: 'user_prueba', ubicacion: { type: 'Point', coordinates: [-97.09, 20.45] },
    tipo_seleccion: 'manual', fecha_confirmacion: fecha, ...cambios };
}
function entrada(cambios = {}) { return { latitud: 20.45, longitud: -97.09, tipo_seleccion: 'manual', confirmada: true, ...cambios }; }
function asignada(cambios = {}) {
  return { estado: 'asignada', ruta_id: '507f1f77bcf86cd799439011', metodo: 'cobertura_oficial',
    fecha_evaluacion: fecha, version_politica: '1', huella_catalogo: 'catalogo-1', motivo: 'cobertura_validada', ...cambios };
}

test('contrato solo admite selección confirmada y conserva latitud/longitud', () => {
  assert.deepEqual(contratos().validarRegistroDomicilio(entrada()), entrada());
  assert.deepEqual(contratos().validarRegistroDomicilio(entrada({ tipo_seleccion: 'gps' })), entrada({ tipo_seleccion: 'gps' }));
  for (const cambios of [{ confirmada: false }, { confirmada: 'true' }, { tipo_seleccion: 'automatica' }]) {
    assert.throws(() => contratos().validarRegistroDomicilio(entrada(cambios)));
  }
});

test('contrato rechaza campos controlados por servidor y cuerpos malformados', () => {
  for (const campo of ['ciudadano_id_clerk', 'propietario', 'rol', 'ruta_id', 'asignacion', 'fecha_creacion', 'fecha_confirmacion', 'version']) {
    assert.throws(() => contratos().validarRegistroDomicilio(entrada({ [campo]: 'inyectado' })), campo);
  }
  for (const cuerpo of [null, [], 'texto', {}, { ...entrada(), longitud: undefined }]) {
    assert.throws(() => contratos().validarRegistroDomicilio(cuerpo));
  }
});

test('versiones de actualización y recálculo son enteros seguros no negativos', () => {
  assert.equal(contratos().validarActualizacionDomicilio({ ...entrada(), version: 0 }).version, 0);
  assert.deepEqual(contratos().validarRecalculoDomicilio({ version: 2 }), { version: 2 });
  for (const version of [undefined, null, '0', false, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => contratos().validarActualizacionDomicilio({ ...entrada(), version }));
    assert.throws(() => contratos().validarRecalculoDomicilio({ version }));
  }
  assert.throws(() => contratos().validarRecalculoDomicilio({ version: 1, ruta_id: 'ruta_local' }));
});

test('modelo registra un domicilio confirmado pendiente, sin alterar el orden GeoJSON', async () => {
  const domicilio = new (modelo())(datos());
  await domicilio.validate();
  assert.deepEqual(domicilio.ubicacion.coordinates, [-97.09, 20.45]);
  assert.equal(domicilio.asignacion.estado, 'pendiente');
  assert.equal(domicilio.asignacion.ruta_id, null);
  assert.equal(domicilio.asignacion.metodo, null);
  assert.equal(domicilio.version, 0);
});

test('coordenadas válidas incluyen ceros y límites', async () => {
  for (const coordinates of [[0, 0], [-180, -90], [180, 90]]) {
    await new (modelo())(datos({ ubicacion: { type: 'Point', coordinates } })).validate();
  }
});

test('modelo y contrato rechazan coordenadas inválidas sin coerción', async () => {
  const valores = [null, NaN, Infinity, -Infinity, '20', true, {}, []];
  for (const valor of valores) {
    for (const coordinates of [[valor, 20], [-97, valor]]) {
      await assert.rejects(new (modelo())(datos({ ubicacion: { type: 'Point', coordinates } })).validate());
    }
    assert.throws(() => contratos().validarRegistroDomicilio(entrada({ latitud: valor })));
    assert.throws(() => contratos().validarRegistroDomicilio(entrada({ longitud: valor })));
  }
  for (const coordinates of [null, [], [-97], [-97, 20, 1], [181, 20], [-181, 20], [-97, 91], [-97, -91], [20.45, -97.09]]) {
    await assert.rejects(new (modelo())(datos({ ubicacion: { type: 'Point', coordinates } })).validate());
  }
  for (const cambio of [{ latitud: 91 }, { latitud: -91 }, { longitud: 181 }, { longitud: -181 }]) {
    assert.throws(() => contratos().validarRegistroDomicilio(entrada(cambio)));
  }
});

test('modelo exige propietario Clerk, confirmación y Point', async () => {
  for (const cambios of [{ ciudadano_id_clerk: null }, { ciudadano_id_clerk: 123 }, { ciudadano_id_clerk: 'otro' },
    { fecha_confirmacion: null }, { tipo_seleccion: 'otro' }, { ubicacion: null },
    { ubicacion: { type: 'LineString', coordinates: [-97, 20] } }]) {
    await assert.rejects(new (modelo())(datos(cambios)).validate());
  }
});

test('asignación definitiva exige ruta Mongo y evidencia; candidato no es asignación', async () => {
  await new (modelo())(datos({ asignacion: asignada() })).validate();
  await new (modelo())(datos({ asignacion: asignada({ metodo: 'revision_administrativa' }) })).validate();
  for (const cambio of [{ ruta_id: null }, { ruta_id: 'ruta_1794449376896' }, { metodo: 'proximidad' },
    { fecha_evaluacion: null }, { version_politica: '' }, { huella_catalogo: null }, { motivo: '' }]) {
    await assert.rejects(new (modelo())(datos({ asignacion: asignada(cambio) })).validate());
  }
});

test('estados sin asignación nunca conservan ruta definitiva ni método', async () => {
  for (const estado of ['ambigua', 'sin_evidencia', 'sin_cobertura', 'requiere_revision']) {
    await new (modelo())(datos({ asignacion: asignada({ estado, ruta_id: null, metodo: null }) })).validate();
    await assert.rejects(new (modelo())(datos({ asignacion: asignada({ estado }) })).validate());
  }
  for (const asignacion of [null, { estado: 'candidata' }, asignada({ estado: 'pendiente' }),
    { estado: 'sin_evidencia' }, { estado: 'pendiente', motivo: 'evidencia_falsa' }]) {
    await assert.rejects(new (modelo())(datos({ asignacion })).validate());
  }
});

test('validateSync también rechaza una asignación sin evidencia y versión inicial no cero', () => {
  assert.ok(new (modelo())(datos({ asignacion: asignada({ ruta_id: null }) })).validateSync());
  assert.ok(new (modelo())(datos({ version: 2 })).validateSync());
});

test('editar solo el estado en un documento persistido también verifica la evidencia', async () => {
  const existente = modelo().hydrate({ ...new (modelo())(datos()).toObject(), version: 0 });
  existente.asignacion.estado = 'asignada';
  assert.ok(existente.validateSync());
  await assert.rejects(existente.validate());
});

test('una edición parcial de evidencia no puede dejar una asignación inválida', async () => {
  for (const [campo, valor] of [['ruta_id', undefined], ['metodo', undefined], ['fecha_evaluacion', null], ['motivo', '']]) {
    const existente = modelo().hydrate({ ...new (modelo())(datos({ asignacion: asignada() })).toObject(), version: 0 });
    existente.asignacion[campo] = valor;
    assert.ok(existente.validateSync(), campo);
    await assert.rejects(existente.validate(), campo);
  }
});

test('modelo declara índice único, dueño inmutable y no genera índices automáticamente', () => {
  const Modelo = modelo();
  assert.ok(Modelo.schema.indexes().some(([claves, opciones]) => claves.ciudadano_id_clerk === 1 && opciones.unique === true));
  assert.equal(Modelo.schema.options.autoIndex, false);
  assert.equal(Modelo.schema.options.autoCreate, false);
  const existente = Modelo.hydrate({ ...datos(), version: 0 });
  existente.ciudadano_id_clerk = 'user_ajeno';
  assert.equal(existente.ciudadano_id_clerk, 'user_prueba');
});

test('modelo rechaza versiones inválidas', async () => {
  for (const version of [null, NaN, Infinity, -1, 1.1, '1', false, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(new (modelo())(datos({ version })).validate());
  }
});

test('version inicial es cero y una edición no puede restablecerla manualmente', async () => {
  const Modelo = modelo();
  await assert.rejects(new Modelo(datos({ version: 5 })).validate());
  const existente = Modelo.hydrate({ ...datos(), version: 3 });
  existente.version = 0;
  await assert.rejects(existente.validate());
});

test('un contador agotado no puede incrementarse fuera de los enteros seguros', async () => {
  const existente = modelo().hydrate({ ...new (modelo())(datos()).toObject(), version: Number.MAX_SAFE_INTEGER });
  existente.tipo_seleccion = 'gps';
  await assert.rejects(existente.validate());
});

test('una edición directa del par GeoJSON se detecta y valida antes de guardar', async () => {
  const domicilio = modelo().hydrate({ ...new (modelo())(datos()).toObject(), version: 0 });
  domicilio.ubicacion.coordinates[0] = -97.08;
  assert.equal(domicilio.isModified('ubicacion.coordinates'), true);
  await domicilio.validate();
  domicilio.ubicacion.coordinates[1] = '20';
  await assert.rejects(domicilio.validate());
});

test('bulkWrite no permite omitir las invariantes del documento', async () => {
  await assert.rejects(modelo().bulkWrite([{ updateOne: { filter: {}, update: { $set: { 'asignacion.estado': 'asignada' } } } }]), /save/);
});

test('save incrementa versión y rechaza una segunda edición de la misma versión', async () => {
  const Modelo = modelo();
  const mongoose = require('mongoose');
  const registro = { ...new Modelo(datos()).toObject(), _id: new mongoose.Types.ObjectId(), version: 0 };
  const primero = Modelo.hydrate(registro), segundo = Modelo.hydrate(registro);
  primero.tipo_seleccion = 'gps'; segundo.ubicacion.coordinates = [-97.08, 20.46];
  const original = Modelo.collection.updateOne;
  let versionGuardada = 0;
  Modelo.collection.updateOne = async (filtro, cambio) => {
    assert.equal(String(filtro._id), String(registro._id));
    if (filtro.version !== versionGuardada) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    assert.equal(cambio.$inc.version, 1);
    versionGuardada++;
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  };
  try {
    await primero.save();
    assert.equal(primero.version, 1);
    await assert.rejects(segundo.save(), { name: 'VersionError' });
  } finally { Modelo.collection.updateOne = original; }
});

test('modelo evita actualizaciones parciales que omiten invariantes y CAS', async () => {
  const Modelo = modelo();
  for (const operacion of [() => Modelo.updateOne({}, { $set: { 'asignacion.estado': 'asignada' } }),
    () => Modelo.updateMany({}, { $set: { version: 0 } }),
    () => Modelo.findOneAndUpdate({}, { $set: { version: 0 } }),
    () => Modelo.replaceOne({}, datos()), () => Modelo.findOneAndReplace({}, datos())]) {
    await assert.rejects(operacion(), /save/);
  }
});

test('modelo convive con Usuario y Ruta y no abre conexiones', () => {
  assert.equal(cargar('src/modelos/Usuario.ts').ModeloUsuario.modelName, 'Usuario');
  assert.equal(cargar('src/modelos/Ruta.ts').ModeloRuta.modelName, 'Ruta');
  assert.equal(modelo().db.readyState, 0);
});
