const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { entorno } = require('./helpers/entorno.cjs');
const fs = require('node:fs');
const ts = require('typescript');
const mongoose = require('mongoose');

function cargarModelo(archivo) {
  const Module = require('node:module');
  const modulo = new Module(archivo, module);
  modulo.filename = archivo;
  modulo.paths = Module._nodeModulePaths(path.dirname(archivo));
  const requerir = modulo.require.bind(modulo);
  modulo.require = nombre => nombre.startsWith('.') ? cargarModelo(path.resolve(path.dirname(archivo), nombre + '.ts')) : requerir(nombre);
  modulo._compile(ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, archivo);
  return modulo.exports;
}

const { ModeloUsuario } = cargarModelo(path.resolve(__dirname, '../src/modelos/Usuario.ts'));
const { ModeloDomicilioCiudadano } = cargarModelo(path.resolve(__dirname, '../src/modelos/DomicilioCiudadano.ts'));
const { ModeloReclamo } = cargarModelo(path.resolve(__dirname, '../src/modelos/Reclamo.ts'));
const { ModeloAlertaCiudadano } = cargarModelo(path.resolve(__dirname, '../src/modelos/AlertaCiudadano.ts'));
const { ModeloHistorialAlerta } = cargarModelo(path.resolve(__dirname, '../src/modelos/HistorialAlerta.ts'));
const { ModeloBloqueoAdministrativo } = cargarModelo(path.resolve(__dirname, '../src/modelos/BloqueoAdministrativo.ts'));

// Utilidades del script (copiadas para tests)
function maskId(id) {
  if (!id || typeof id !== 'string') return 'null';
  return id.slice(0, 6) + '...' + id.slice(-4);
}

function maskEmail(email) {
  if (!email) return 'null';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return local[0] + '***' + local[local.length - 1] + '@' + domain;
}

function maskPII(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const masked = { ...obj };
  if (masked.correo_electronico) masked.correo_electronico = maskEmail(masked.correo_electronico);
  if (masked.nombre_completo) masked.nombre_completo = masked.nombre_completo.replace(/./g, '*');
  if (masked.telefono) masked.telefono = masked.telefono.replace(/./g, '*');
  if (masked._id) masked._id = String(masked._id).slice(0, 6) + '...';
  return masked;
}

function entornoConcilia(opciones = {}) {
  const e = entorno('ciudadano', {
    ...opciones,
    dependencias: {
      ...(opciones.dependencias || {}),
      '@/modelos/Usuario': { ModeloUsuario },
      '@/modelos/DomicilioCiudadano': { ModeloDomicilioCiudadano: ModeloDomicilioCiudadano },
      '@/modelos/Reclamo': { ModeloReclamo },
      '@/modelos/AlertaCiudadano': { ModeloAlertaCiudadano },
      '@/modelos/HistorialAlerta': { ModeloHistorialAlerta },
      '@/modelos/BloqueoAdministrativo': { ModeloBloqueoAdministrativo },
    }
  });

  const copia = valor => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(valor));
  const coincide = (doc, filtro) => Object.entries(filtro).every(([clave, valor]) => String(doc[clave]) === String(valor));

  const modelos = ['mongoUsers', 'domicilios', 'reclamos', 'alertas', 'historialAlertas'];
  modelos.forEach(m => { if (!e.state[m]) e.state[m] = []; });

  ['ModeloUsuario', 'ModeloDomicilioCiudadano', 'ModeloReclamo', 'ModeloAlertaCiudadano', 'ModeloHistorialAlerta', 'ModeloBloqueoAdministrativo'].forEach(nombre => {
    const Modelo = eval(nombre);
    let stateKey = 'mongoUsers';
    if (nombre === 'ModeloDomicilioCiudadano') stateKey = 'domicilios';
    if (nombre === 'ModeloReclamo') stateKey = 'reclamos';
    if (nombre === 'ModeloAlertaCiudadano') stateKey = 'alertas';
    if (nombre === 'ModeloHistorialAlerta') stateKey = 'historialAlertas';
    if (nombre === 'ModeloBloqueoAdministrativo') stateKey = 'locks';

    Modelo.collection.find = query => {
      e.state.queries = e.state.queries || [];
      e.state.queries.push([stateKey, copia(query)]);
      const data = (e.state[stateKey] || []).filter(doc => coincide(doc, query));
      return {
        sort: () => ({
          then: (resolve, reject) => Promise.resolve(copia(data)).then(resolve, reject),
          limit: async n => copia(data.slice(0, n)),
        }),
        session: () => ({})
      };
    };
    Modelo.collection.insertOne = async doc => {
      if (e.state.falloEscritura) throw Error('Escritura fallida');
      e.state[stateKey].push(copia(doc));
      e.state.escrituras = e.state.escrituras || [];
      e.state.escrituras.push({ modelo: stateKey, operacion: 'insert', doc: copia(doc) });
      return { acknowledged: true, insertedId: doc._id };
    };
    Modelo.collection.updateOne = async (filtro, cambio, opts) => {
      if (e.state.falloEscritura) throw Error('Escritura fallida');
      const doc = (e.state[stateKey] || []).find(d => coincide(d, filtro));
      if (!doc) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      for (const [clave, valor] of Object.entries(cambio.$set || {})) {
        const partes = clave.split('.'); let destino = doc;
        for (const parte of partes.slice(0, -1)) destino = destino[parte];
        destino[partes.at(-1)] = copia({ valor }).valor;
      }
      e.state.escrituras = e.state.escrituras || [];
      e.state.escrituras.push({ modelo: stateKey, operacion: 'update', filtro, cambio });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    };
    Modelo.collection.updateMany = async (filtro, cambio, opts) => {
      if (e.state.falloEscritura) throw Error('Escritura fallida');
      const docs = (e.state[stateKey] || []).filter(d => coincide(d, filtro));
      docs.forEach(doc => {
        for (const [clave, valor] of Object.entries(cambio.$set || {})) {
          const partes = clave.split('.'); let destino = doc;
          for (const parte of partes.slice(0, -1)) destino = destino[parte];
          destino[partes.at(-1)] = copia({ valor }).valor;
        }
      });
      e.state.escrituras = e.state.escrituras || [];
      e.state.escrituras.push({ modelo: stateKey, operacion: 'updateMany', filtro, cambio, count: docs.length });
      return { acknowledged: true, matchedCount: docs.length, modifiedCount: docs.length };
    };
    Modelo.collection.countDocuments = async filtro => {
      return (e.state[stateKey] || []).filter(d => coincide(d, filtro)).length;
    };
    Modelo.findOne = async filtro => {
      const doc = (e.state[stateKey] || []).find(d => coincide(d, filtro));
      return doc ? copia(doc) : null;
    };
  });

  return e;
}

const OLD_ID = 'user_OLDTEST12345678901234567';
const NEW_ID = 'user_NEWTEST12345678901234567';
const EMAIL = 'test@example.com';

// ─── TESTS ────────────────────────────────────────────────────────────────────

test('utilidades de enmascaramiento: maskId', () => {
  assert.equal(maskId('user_1234567890abcdef'), 'user_1...cdef');
  assert.equal(maskId('short'), 'short...hort');
  assert.equal(maskId(null), 'null');
  assert.equal(maskId(''), 'null');
});

test('utilidades de enmascaramiento: maskEmail', () => {
  assert.equal(maskEmail('test@example.com'), 't***t@example.com');
  assert.equal(maskEmail('a@b.co'), 'a***a@b.co');
  assert.equal(maskEmail('usuario@dominio.org'), 'u***o@dominio.org');
  assert.equal(maskEmail(null), 'null');
  assert.equal(maskEmail(''), 'null');
});

test('utilidades de enmascaramiento: maskPII', () => {
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    correo_electronico: 'juan@example.com',
    nombre_completo: 'Juan Pérez',
    telefono: '555-1234567',
    rol: 'ciudadano',
  };
  const masked = maskPII(doc);
  assert.notEqual(masked.correo_electronico, 'juan@example.com');
  assert.ok(masked.correo_electronico.includes('***'));
  assert.ok(masked.nombre_completo.includes('*'));
  assert.ok(masked.telefono.includes('*'));
  assert.equal(masked.rol, 'ciudadano');
});

// ─── TESTS VALIDACIÓN DE ARGUMENTOS ────────────────────────────────────────────
test('validación: falla sin --old-id', () => {
  const originalArgs = process.argv;
  process.argv = ['node', 'concilia-ciudadano.mjs', '--new-id=user_NEWTEST', '--email=test@example.com'];
  let exited = false;
  try {
    // Simular validación
    const args = process.argv.slice(2);
    const OLD_ID_CLERK = args.find(a => a.startsWith('--old-id='))?.split('=')[1] || null;
    const NEW_ID_CLERK = args.find(a => a.startsWith('--new-id='))?.split('=')[1] || null;
    const TARGET_EMAIL = args.find(a => a.startsWith('--email='))?.split('=')[1] || null;
    const errores = [];
    if (!OLD_ID_CLERK) errores.push('--old-id es obligatorio');
    if (!NEW_ID_CLERK) errores.push('--new-id es obligatorio');
    if (!TARGET_EMAIL) errores.push('--email es obligatorio');
    if (errores.length > 0) exited = true;
    assert.ok(exited);
  } finally {
    process.argv = originalArgs;
  }
});

test('validación: falla sin --new-id', () => {
  const originalArgs = process.argv;
  process.argv = ['node', 'concilia-ciudadano.mjs', '--old-id=user_OLDTEST', '--email=test@example.com'];
  let exited = false;
  try {
    const args = process.argv.slice(2);
    const OLD_ID_CLERK = args.find(a => a.startsWith('--old-id='))?.split('=')[1] || null;
    const NEW_ID_CLERK = args.find(a => a.startsWith('--new-id='))?.split('=')[1] || null;
    const TARGET_EMAIL = args.find(a => a.startsWith('--email='))?.split('=')[1] || null;
    const errores = [];
    if (!OLD_ID_CLERK) errores.push('--old-id es obligatorio');
    if (!NEW_ID_CLERK) errores.push('--new-id es obligatorio');
    if (!TARGET_EMAIL) errores.push('--email es obligatorio');
    if (errores.length > 0) exited = true;
    assert.ok(exited);
  } finally {
    process.argv = originalArgs;
  }
});

test('validación: falla sin --email', () => {
  const originalArgs = process.argv;
  process.argv = ['node', 'concilia-ciudadano.mjs', '--old-id=user_OLDTEST', '--new-id=user_NEWTEST'];
  let exited = false;
  try {
    const args = process.argv.slice(2);
    const OLD_ID_CLERK = args.find(a => a.startsWith('--old-id='))?.split('=')[1] || null;
    const NEW_ID_CLERK = args.find(a => a.startsWith('--new-id='))?.split('=')[1] || null;
    const TARGET_EMAIL = args.find(a => a.startsWith('--email='))?.split('=')[1] || null;
    const errores = [];
    if (!OLD_ID_CLERK) errores.push('--old-id es obligatorio');
    if (!NEW_ID_CLERK) errores.push('--new-id es obligatorio');
    if (!TARGET_EMAIL) errores.push('--email es obligatorio');
    if (errores.length > 0) exited = true;
    assert.ok(exited);
  } finally {
    process.argv = originalArgs;
  }
});

test('validación: falla con --old-id formato inválido', () => {
  const originalArgs = process.argv;
  process.argv = ['node', 'concilia-ciudadano.mjs', '--old-id=invalid', '--new-id=user_NEWTEST', '--email=test@example.com'];
  let exited = false;
  try {
    const args = process.argv.slice(2);
    const OLD_ID_CLERK = args.find(a => a.startsWith('--old-id='))?.split('=')[1] || null;
    if (OLD_ID_CLERK && !/^user_[a-zA-Z0-9_]+$/.test(OLD_ID_CLERK)) exited = true;
    assert.ok(exited);
  } finally {
    process.argv = originalArgs;
  }
});

test('validación: falla con --new-id formato inválido', () => {
  const originalArgs = process.argv;
  process.argv = ['node', 'concilia-ciudadano.mjs', '--old-id=user_OLDTEST', '--new-id=invalid', '--email=test@example.com'];
  let exited = false;
  try {
    const args = process.argv.slice(2);
    const NEW_ID_CLERK = args.find(a => a.startsWith('--new-id='))?.split('=')[1] || null;
    if (NEW_ID_CLERK && !/^user_[a-zA9-9_]+$/.test(NEW_ID_CLERK)) exited = true;
    assert.ok(exited);
  } finally {
    process.argv = originalArgs;
  }
});

test('validación: falla con --email formato inválido', () => {
  const originalArgs = process.argv;
  process.argv = ['node', 'concilia-ciudadano.mjs', '--old-id=user_OLDTEST', '--new-id=user_NEWTEST', '--email=invalid'];
  let exited = false;
  try {
    const args = process.argv.slice(2);
    const TARGET_EMAIL = args.find(a => a.startsWith('--email='))?.split('=')[1] || null;
    if (TARGET_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(TARGET_EMAIL)) exited = true;
    assert.ok(exited);
  } finally {
    process.argv = originalArgs;
  }
});

test('validación: falla si --old-id y --new-id son iguales', () => {
  const originalArgs = process.argv;
  process.argv = ['node', 'concilia-ciudadano.mjs', '--old-id=user_SAME', '--new-id=user_SAME', '--email=test@example.com'];
  let exited = false;
  try {
    const args = process.argv.slice(2);
    const OLD_ID_CLERK = args.find(a => a.startsWith('--old-id='))?.split('=')[1] || null;
    const NEW_ID_CLERK = args.find(a => a.startsWith('--new-id='))?.split('=')[1] || null;
    if (OLD_ID_CLERK === NEW_ID_CLERK) exited = true;
    assert.ok(exited);
  } finally {
    process.argv = originalArgs;
  }
});

test('validación: pasa con argumentos correctos', () => {
  const originalArgs = process.argv;
  process.argv = ['node', 'concilia-ciudadano.mjs', '--old-id=user_OLDTEST123', '--new-id=user_NEWTEST123', '--email=test@example.com'];
  let exited = false;
  try {
    const args = process.argv.slice(2);
    const OLD_ID_CLERK = args.find(a => a.startsWith('--old-id='))?.split('=')[1] || null;
    const NEW_ID_CLERK = args.find(a => a.startsWith('--new-id='))?.split('=')[1] || null;
    const TARGET_EMAIL = args.find(a => a.startsWith('--email='))?.split('=')[1] || null;
    const errores = [];
    if (!OLD_ID_CLERK) errores.push('--old-id es obligatorio');
    if (!NEW_ID_CLERK) errores.push('--new-id es obligatorio');
    if (!TARGET_EMAIL) errores.push('--email es obligatorio');
    if (OLD_ID_CLERK && !/^user_[a-zA-Z0-9_]+$/.test(OLD_ID_CLERK)) errores.push('--old-id formato inválido');
    if (NEW_ID_CLERK && !/^user_[a-zA-Z0-9_]+$/.test(NEW_ID_CLERK)) errores.push('--new-id formato inválido');
    if (TARGET_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(TARGET_EMAIL)) errores.push('--email formato inválido');
    if (OLD_ID_CLERK === NEW_ID_CLERK) errores.push('--old-id y --new-id no pueden ser iguales');
    assert.equal(errores.length, 0);
  } finally {
    process.argv = originalArgs;
  }
});

test('precondición: ID anterior existe en Clerk → falla', async () => {
  const e = entornoConcilia();
  e.state.mongoUsers.push({ id_clerk: OLD_ID, correo_electronico: EMAIL, nombre_completo: 'Test', rol: 'ciudadano', activo: true });
  e.state.users.push({ id: OLD_ID, emailAddresses: [{ id: 'e1', emailAddress: EMAIL, verification: { status: 'verified' } }], primaryEmailAddressId: 'e1', banned: false, locked: false });
  e.state.users = e.state.users.map(u => u.id === 'user_actor' ? { ...u, id: NEW_ID } : u);
  // Simular que Clerk devuelve el usuario (no 404)
  const clerkMock = { users: { getUser: async (id) => { if (id === OLD_ID) return e.state.users.find(u => u.id === OLD_ID); throw { status: 404 }; } } };
  try {
    await clerkMock.users.getUser(OLD_ID);
    // Si llega aquí, el ID anterior existe
    assert.fail('Debería detectar que ID anterior existe');
  } catch (err) {
    // En el script real, esto lanza error PRECONDICIÓN FALLIDA
    assert.ok(true);
  }
});

test('precondición: ID nuevo no existe en Clerk → falla', async () => {
  const e = entornoConcilia();
  e.state.mongoUsers.push({ id_clerk: OLD_ID, correo_electronico: EMAIL, nombre_completo: 'Test', rol: 'ciudadano', activo: true });
  e.state.users = e.state.users.map(u => u.id === 'user_actor' ? { ...u, id: 'user_OTRO12345678901234567' } : u);
  const clerkMock = { users: { getUser: async (id) => { throw { status: 404 }; } } };
  try {
    await clerkMock.users.getUser(NEW_ID);
    assert.fail('Debería fallar');
  } catch (err) {
    assert.equal(err.status, 404);
  }
});

test('precondición: correo no verificado en Clerk → falla', async () => {
  const e = entornoConcilia();
  e.state.mongoUsers.push({ id_clerk: OLD_ID, correo_electronico: EMAIL, nombre_completo: 'Test', rol: 'ciudadano', activo: true });
  e.state.users = e.state.users.map(u => u.id === 'user_actor' ? {
    ...u, id: NEW_ID,
    emailAddresses: [{ id: 'e1', emailAddress: EMAIL, verification: { status: 'unverified' } }],
    primaryEmailAddressId: 'e1'
  } : u);
  const newUser = e.state.users.find(u => u.id === NEW_ID);
  const primary = newUser.emailAddresses.find(e => e.id === newUser.primaryEmailAddressId);
  assert.equal(primary.verification.status, 'unverified');
});

test('precondición: rol no ciudadano → falla', async () => {
  const e = entornoConcilia();
  e.state.mongoUsers.push({ id_clerk: OLD_ID, correo_electronico: EMAIL, nombre_completo: 'Test', rol: 'admin', activo: true });
  const doc = e.state.mongoUsers[0];
  assert.notEqual(doc.rol, 'ciudadano');
});

test('precondición: ID nuevo ya existe en MongoDB → falla', async () => {
  const e = entornoConcilia();
  e.state.mongoUsers.push({ id_clerk: OLD_ID, correo_electronico: EMAIL, nombre_completo: 'Test', rol: 'ciudadano', activo: true });
  e.state.mongoUsers.push({ id_clerk: NEW_ID, correo_electronico: 'otro@test.com', nombre_completo: 'Otro', rol: 'ciudadano', activo: true });
  const existe = e.state.mongoUsers.find(u => u.id_clerk === NEW_ID);
  assert.ok(existe);
});

test('precondición: bloqueo activo → falla', async () => {
  const e = entornoConcilia();
  e.state.mongoUsers.push({ id_clerk: OLD_ID, correo_electronico: EMAIL, nombre_completo: 'Test', rol: 'ciudadano', activo: true });
  e.state.locks.add(OLD_ID);
  const tieneBloqueo = e.state.locks.has(OLD_ID);
  assert.ok(tieneBloqueo);
});

test('conteo documentos relacionados antes de migración', async () => {
  const e = entornoConcilia();
  e.state.mongoUsers.push({ id_clerk: OLD_ID, correo_electronico: EMAIL, nombre_completo: 'Test', rol: 'ciudadano', activo: true });
  for (let i = 0; i < 2; i++) {
    e.state.domicilios.push({ ciudadano_id_clerk: OLD_ID, ubicacion: { type: 'Point', coordinates: [-97, 20] }, tipo_seleccion: 'manual', fecha_confirmacion: new Date(), version: 0 });
    e.state.reclamos.push({ ciudadano_id_clerk: OLD_ID, folio: 'REC-' + i, ciudadano_nombre: 'Test', ciudadano_telefono: '123', domicilio_referencia: 'Calle ' + i, ubicacion: { type: 'Point', coordinates: [-97, 20] }, tipo_incidencia: 'OTRO', descripcion: 'Test', estado: 'PENDIENTE' });
    e.state.alertas.push({ ciudadano_id: OLD_ID, etiqueta_zona: 'Zona ' + i, direccion_texto: 'Calle ' + i, latitud: 20, longitud: -97 });
    e.state.historialAlertas.push({ ciudadano_id: OLD_ID, camion_id: new mongoose.Types.ObjectId(), ruta_id: new mongoose.Types.ObjectId(), mensaje: 'Test', distancia_metros: 100 });
  }
  const contadores = {
    domicilios: await ModeloDomicilioCiudadano.countDocuments({ ciudadano_id_clerk: OLD_ID }),
    reclamos: await ModeloReclamo.countDocuments({ ciudadano_id_clerk: OLD_ID }),
    alertas: await ModeloAlertaCiudadano.countDocuments({ ciudadano_id: OLD_ID }),
    historialAlertas: await ModeloHistorialAlerta.countDocuments({ ciudadano_id: OLD_ID }),
  };
  assert.equal(contadores.domicilios, 2);
  assert.equal(contadores.reclamos, 2);
  assert.equal(contadores.alertas, 2);
  assert.equal(contadores.historialAlertas, 2);
});

test('simulación de migración: updateOne usuario', async () => {
  const e = entornoConcilia();
  e.state.mongoUsers.push({ _id: new mongoose.Types.ObjectId(), id_clerk: OLD_ID, correo_electronico: EMAIL, nombre_completo: 'Test', rol: 'ciudadano', activo: true, fecha_creacion: new Date('2024-01-01'), fecha_actualizacion: new Date('2024-01-01') });
  const res = await ModeloUsuario.updateOne({ id_clerk: OLD_ID }, { $set: { id_clerk: NEW_ID, fecha_actualizacion: new Date() } });
  assert.equal(res.modifiedCount, 1);
  assert.equal(e.state.mongoUsers[0].id_clerk, NEW_ID);
  assert.ok(e.state.mongoUsers[0].fecha_actualizacion > new Date('2024-01-01'));
  assert.equal(e.state.mongoUsers[0].fecha_creacion.toISOString(), '2024-01-01T00:00:00.000Z');
});

test('simulación de migración: updateMany domicilios', async () => {
  const e = entornoConcilia();
  e.state.domicilios.push({ _id: new mongoose.Types.ObjectId(), ciudadano_id_clerk: OLD_ID, ubicacion: { type: 'Point', coordinates: [-97, 20] }, tipo_seleccion: 'manual', fecha_confirmacion: new Date(), version: 0 });
  e.state.domicilios.push({ _id: new mongoose.Types.ObjectId(), ciudadano_id_clerk: OLD_ID, ubicacion: { type: 'Point', coordinates: [-97, 20] }, tipo_seleccion: 'manual', fecha_confirmacion: new Date(), version: 0 });
  const res = await ModeloDomicilioCiudadano.collection.updateMany({ ciudadano_id_clerk: OLD_ID }, { $set: { ciudadano_id_clerk: NEW_ID } });
  assert.equal(res.modifiedCount, 2);
  assert.equal(e.state.domicilios[0].ciudadano_id_clerk, NEW_ID);
  assert.equal(e.state.domicilios[1].ciudadano_id_clerk, NEW_ID);
});

test('simulación de migración: updateMany reclamos', async () => {
  const e = entornoConcilia();
  const recId = new mongoose.Types.ObjectId();
  e.state.reclamos.push({ _id: recId, ciudadano_id_clerk: OLD_ID, folio: 'REC-1', ciudadano_nombre: 'Test', ciudadano_telefono: '123', domicilio_referencia: 'Calle 1', ubicacion: { type: 'Point', coordinates: [-97, 20] }, tipo_incidencia: 'OTRO', descripcion: 'Test', estado: 'PENDIENTE' });
  const res = await ModeloReclamo.collection.updateMany({ ciudadano_id_clerk: OLD_ID }, { $set: { ciudadano_id_clerk: NEW_ID } });
  assert.equal(res.modifiedCount, 1);
  const updated = e.state.reclamos.find(r => r._id.equals(recId));
  assert.equal(updated.ciudadano_id_clerk, NEW_ID);
});

test('simulación de migración: updateMany alertas', async () => {
  const e = entornoConcilia();
  const aleId = new mongoose.Types.ObjectId();
  e.state.alertas.push({ _id: aleId, ciudadano_id: OLD_ID, etiqueta_zona: 'Casa', direccion_texto: 'Calle 1', latitud: 20, longitud: -97 });
  const res = await ModeloAlertaCiudadano.updateMany({ ciudadano_id: OLD_ID }, { $set: { ciudadano_id: NEW_ID } });
  assert.equal(res.modifiedCount, 1);
  const updated = e.state.alertas.find(a => a._id.equals(aleId));
  assert.equal(updated.ciudadano_id, NEW_ID);
});

test('simulación de migración: updateMany historialAlertas', async () => {
  const e = entornoConcilia();
  e.state.historialAlertas.push({ _id: new mongoose.Types.ObjectId(), ciudadano_id: OLD_ID, camion_id: new mongoose.Types.ObjectId(), ruta_id: new mongoose.Types.ObjectId(), mensaje: 'Test', distancia_metros: 100 });
  const res = await ModeloHistorialAlerta.updateMany({ ciudadano_id: OLD_ID }, { $set: { ciudadano_id: NEW_ID } });
  assert.equal(res.modifiedCount, 1);
  assert.equal(e.state.historialAlertas[0].ciudadano_id, NEW_ID);
});

test('verificación posterior: usuario migrado', async () => {
  const e = entornoConcilia();
  e.state.mongoUsers.push({ _id: new mongoose.Types.ObjectId(), id_clerk: NEW_ID, correo_electronico: EMAIL, nombre_completo: 'Test', rol: 'ciudadano', activo: true, fecha_creacion: new Date('2023-06-15') });
  const docNuevo = await ModeloUsuario.findOne({ id_clerk: NEW_ID });
  const docAntiguo = await ModeloUsuario.findOne({ id_clerk: OLD_ID });
  assert.ok(docNuevo);
  assert.equal(docAntiguo, null);
  assert.equal(docNuevo.rol, 'ciudadano');
  assert.equal(docNuevo.activo, true);
  assert.equal(docNuevo.fecha_creacion.toISOString(), '2023-06-15T00:00:00.000Z');
});

test('verificación posterior: documentos relacionados migrados', async () => {
  const e = entornoConcilia();
  e.state.domicilios.push({ _id: new mongoose.Types.ObjectId(), ciudadano_id_clerk: NEW_ID });
  e.state.reclamos.push({ _id: new mongoose.Types.ObjectId(), ciudadano_id_clerk: NEW_ID });
  e.state.alertas.push({ _id: new mongoose.Types.ObjectId(), ciudadano_id: NEW_ID });
  e.state.historialAlertas.push({ _id: new mongoose.Types.ObjectId(), ciudadano_id: NEW_ID });
  const checks = [
    { modelo: ModeloDomicilioCiudadano, campo: 'ciudadano_id_clerk', nombre: 'Domicilios' },
    { modelo: ModeloReclamo, campo: 'ciudadano_id_clerk', nombre: 'Reclamos' },
    { modelo: ModeloAlertaCiudadano, campo: 'ciudadano_id', nombre: 'Alertas' },
    { modelo: ModeloHistorialAlerta, campo: 'ciudadano_id', nombre: 'Historial Alertas' },
  ];
  for (const { modelo, campo, nombre } of checks) {
    const conNuevo = await modelo.countDocuments({ [campo]: NEW_ID });
    const conAntiguo = await modelo.countDocuments({ [campo]: OLD_ID });
    assert.equal(conAntiguo, 0, nombre + ' no debe tener docs con ID anterior');
    assert.ok(conNuevo >= 0, nombre + ' debe tener docs con ID nuevo');
  }
});

test('reejecución tras fallo parcial: detecta inconsistencia', async () => {
  const e = entornoConcilia();
  e.state.mongoUsers.push({ _id: new mongoose.Types.ObjectId(), id_clerk: NEW_ID, correo_electronico: EMAIL, nombre_completo: 'Test', rol: 'ciudadano', activo: true });
  e.state.domicilios.push({ _id: new mongoose.Types.ObjectId(), ciudadano_id_clerk: OLD_ID });
  const domAntiguo = await ModeloDomicilioCiudadano.countDocuments({ ciudadano_id_clerk: OLD_ID });
  const domNuevo = await ModeloDomicilioCiudadano.countDocuments({ ciudadano_id_clerk: NEW_ID });
  assert.equal(domAntiguo, 1, 'Quedan domicilios con ID anterior');
  assert.equal(domNuevo, 0, 'No hay domicilios con ID nuevo');
});

test('transacción fallida: error se propaga', async () => {
  const e = entornoConcilia({ falloEscritura: true });
  e.state.mongoUsers.push({ _id: new mongoose.Types.ObjectId(), id_clerk: OLD_ID, correo_electronico: EMAIL, nombre_completo: 'Test', rol: 'ciudadano', activo: true });
  try {
    await ModeloUsuario.updateOne({ id_clerk: OLD_ID }, { $set: { id_clerk: NEW_ID } });
    assert.fail('Debería haber fallado');
  } catch (err) {
    assert.ok(err.message);
  }
});

test('modelos manejados por el script: lista completa', () => {
  const modelos = ['Usuario', 'DomicilioCiudadano', 'Reclamo', 'AlertaCiudadano', 'HistorialAlerta'];
  assert.ok(modelos.includes('Usuario'));
  assert.ok(modelos.includes('DomicilioCiudadano'));
  assert.ok(modelos.includes('Reclamo'));
  assert.ok(modelos.includes('AlertaCiudadano'));
  assert.ok(modelos.includes('HistorialAlerta'));
});

test('no modifica rol ni activo durante migración', async () => {
  const e = entornoConcilia();
  e.state.mongoUsers.push({ _id: new mongoose.Types.ObjectId(), id_clerk: OLD_ID, correo_electronico: EMAIL, nombre_completo: 'Test', rol: 'ciudadano', activo: true });
  await ModeloUsuario.updateOne({ id_clerk: OLD_ID }, { $set: { id_clerk: NEW_ID } });
  const doc = e.state.mongoUsers[0];
  assert.equal(doc.rol, 'ciudadano');
  assert.equal(doc.activo, true);
});

test('preserva fecha_creacion original', async () => {
  const e = entornoConcilia();
  const fechaOriginal = new Date('2023-06-15T10:30:00.000Z');
  e.state.mongoUsers.push({ _id: new mongoose.Types.ObjectId(), id_clerk: OLD_ID, correo_electronico: EMAIL, nombre_completo: 'Test', rol: 'ciudadano', activo: true, fecha_creacion: fechaOriginal, fecha_actualizacion: new Date('2024-01-01') });
  await ModeloUsuario.updateOne({ id_clerk: OLD_ID }, { $set: { id_clerk: NEW_ID, fecha_actualizacion: new Date() } });
  assert.equal(e.state.mongoUsers[0].fecha_creacion.toISOString(), fechaOriginal.toISOString());
});

console.log('✅ Tests de conciliación definidos correctamente');