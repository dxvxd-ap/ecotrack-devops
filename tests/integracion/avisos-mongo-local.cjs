const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { cargar } = require('../avisos.test.cjs');

const uri = 'mongodb://127.0.0.1:27192';
const dbName = 'avisos_fase_a_' + randomUUID().replaceAll('-', '');
const cuenta = (rol, nombre = rol) => ({
  id: 'user_' + nombre, publicMetadata: { rol }, primaryEmailAddressId: 'email',
  emailAddresses: [{ id: 'email', emailAddress: nombre + '@example.test', verification: { status: 'verified' } }],
});
const admin = cuenta('admin');
const superadmin = cuenta('superadmin');
const ana = cuenta('ciudadano', 'ana');
const bea = cuenta('ciudadano', 'bea');
let actual;
const cache = new Map();
const dobles = {
  'lib/base_datos': { conectar_base_datos: async () => mongoose },
  '@clerk/nextjs/server': { auth: async () => ({ userId: actual?.id }) },
  '@clerk/backend': { createClerkClient: () => ({ users: { getUser: async id => {
    assert.equal(id, actual.id);
    return actual;
  } } }) },
};
process.env.CLERK_SECRET_KEY = "fixture-cursor";
process.env.AVISOS_REPORTES_DESDE = new Date(Date.now() - 60_000).toISOString();
const cargarReal = ruta => cargar(ruta, dobles, cache);
const base = 'app/api';
const ciudadano = '/api/ciudadano/avisos';
const administracion = '/api/v1/admin/avisos';
const handlers = {
  lista: cargarReal(base + '/ciudadano/avisos/route'),
  resumen: cargarReal(base + '/ciudadano/avisos/resumen/route'),
  lectura: cargarReal(base + '/ciudadano/avisos/[id]/lectura/route'),
  admin: cargarReal(base + '/v1/admin/avisos/route'),
  detalle: cargarReal(base + '/v1/admin/avisos/[id]/route'),
};
async function pedir(cuenta, handler, method, ruta, { cuerpo, clave, id } = {}) {
  actual = cuenta;
  const request = new Request('http://localhost' + ruta, {
    method,
    headers: { ...(clave ? { 'Idempotency-Key': clave } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });
  const r = await handlers[handler][method](request, { params: Promise.resolve({ id }) });
  assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
  return { status: r.status, json: await r.json(), replay: r.headers.get('Idempotency-Replayed') };
}
const entrada = { tipo: 'comunicado', audiencia: 'municipio', titulo: 'Comunicado', mensaje: 'Información municipal', prioridad: 'normal' };
const crear = (cuerpo = entrada, clave = randomUUID()) => pedir(admin, 'admin', 'POST', administracion, { cuerpo, clave });
const editar = (id, accion, version, clave = randomUUID(), borrador) => pedir(admin, 'detalle', 'PATCH',
  administracion + '/' + id, { id, cuerpo: { accion, version, ...(borrador && { borrador }) }, clave });
const listar = (actor, query = '') => pedir(actor, 'lista', 'GET', ciudadano + query);
const leer = (actor, id) => pedir(actor, 'lectura', 'PUT', ciudadano + '/' + id + '/lectura', { id });
const resumen = actor => pedir(actor, 'resumen', 'GET', ciudadano + '/resumen');

test('Avisos HTTP con MongoDB local y políticas reales de autorización', async t => {
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000, autoCreate: false, autoIndex: false });
  t.after(async () => {
    try { await mongoose.connection.dropDatabase(); }
    finally { await mongoose.disconnect(); }
  });
  const { Aviso, LecturaAviso, Usuario, Reclamo, DomicilioCiudadano, Ruta } = mongoose.models;
  await Promise.all([Aviso.createIndexes(), LecturaAviso.createIndexes()]);
  await Usuario.collection.insertMany([ana, bea].map(actor => ({
    id_clerk: actor.id, correo_electronico: actor.emailAddresses[0].emailAddress, rol: 'ciudadano', activo: true,
  })));
  const rutaId = new mongoose.Types.ObjectId();
  await Ruta.collection.insertOne({ _id: rutaId, activa: true });
  await DomicilioCiudadano.collection.insertOne({ ciudadano_id_clerk: ana.id, asignacion: { estado: 'asignada', ruta_id: rutaId } });

  await t.test('sesión, roles, origen y filtro de identidad', async () => {
    assert.equal((await listar(null)).status, 401);
    assert.equal((await listar(admin)).status, 403);
    assert.equal((await listar({ ...ana, banned: true })).status, 403);
    assert.equal((await listar(ana, '?ciudadano_id_clerk=user_bea')).status, 400);
    for (const rol of ['ciudadano', 'secretario', 'moderador', 'conductor']) {
      assert.equal((await pedir(cuenta(rol), 'admin', 'GET', administracion)).status, 403);
    }
    assert.equal((await pedir(superadmin, 'admin', 'GET', administracion)).status, 200);
    const autorizacion = cargarReal('lib/autorizacion');
    assert.equal(autorizacion.permiso_api_administrativa(administracion + '/id', 'PATCH'), 'avisos:gestionar');
    actual = ana;
    const req = new Request('http://localhost' + ciudadano + '/id/lectura', { method: 'PUT', headers: { Origin: 'https://example.test' } });
    assert.equal((await handlers.lectura.PUT(req, { params: Promise.resolve({ id: 'a'.repeat(64) }) })).status, 403);
  });

  let id;
  await t.test('creación, edición y publicación concurrentes, con reproducción del resultado original', async () => {
    const clave = randomUUID();
    const borradores = await Promise.all(Array.from({ length: 8 }, () => crear(entrada, clave)));
    assert.equal(borradores.filter(r => r.status === 201).length, 1);
    assert.equal(borradores.filter(r => r.status === 200 && r.replay === 'true').length, 7);
    id = borradores[0].json.datos.id;
    assert.equal(await Aviso.countDocuments(), 1);
    assert.equal((await crear({ ...entrada, titulo: 'Otro' }, clave)).json.codigo, 'CLAVE_REUTILIZADA');
    assert.deepEqual((await listar(ana)).json.datos.avisos, []);
    const versiones = await Promise.all([
      editar(id, 'editar', 0, randomUUID(), { ...entrada, titulo: 'Versión A' }),
      editar(id, 'editar', 0, randomUUID(), { ...entrada, titulo: 'Versión B' }),
    ]);
    assert.deepEqual(versiones.map(r => r.status).sort(), [200, 409]);
    const publicar = randomUUID();
    const resultados = await Promise.all(Array.from({ length: 6 }, () => editar(id, 'publicar', 1, publicar)));
    assert.ok(resultados.every(r => r.status === 200 && r.json.datos.version === 2));
    assert.equal(resultados.filter(r => r.replay === 'true').length, 5);
    assert.equal((await crear(entrada, clave)).json.datos.estado, 'borrador');
    assert.equal((await leer(bea, 'f'.repeat(64))).status, 404);
  });

  await t.test('lectura concurrente, conteo por cuenta y retiro', async () => {
    assert.equal((await resumen(ana)).json.datos.sin_leer_total, 1);
    const lecturas = await Promise.all(Array.from({ length: 10 }, () => leer(ana, id)));
    assert.ok(lecturas.every(r => r.status === 200 && r.json.datos.sin_leer_total === 0));
    assert.equal(new Set(lecturas.map(r => r.json.datos.leido_en)).size, 1);
    assert.equal(await LecturaAviso.countDocuments(), 1);
    assert.equal((await resumen(bea)).json.datos.sin_leer_total, 1);
    assert.equal((await listar(ana, '?filtro=sin_leer')).json.datos.avisos.length, 0);
    assert.ok((await listar(ana)).json.datos.avisos[0].leido_en);
    assert.equal((await editar(id, 'retirar', 2)).status, 200);
    assert.equal((await leer(ana, id)).status, 404);
    assert.equal((await resumen(bea)).json.datos.sin_leer_total, 0);
  });

  await t.test('vigencia, cursor estable y ruta sin confirmar', async () => {
    const futuro = new Date(Date.now() + 600_000).toISOString();
    for (const d of [entrada, entrada, entrada, { ...entrada, vigente_desde: futuro },
      { ...entrada, audiencia: 'ruta', ruta_id: String(rutaId) }]) {
      const borrador = (await crear(d)).json.datos;
      assert.equal((await editar(borrador.id, 'publicar', 0)).status, 200);
    }
    const vencido = (await crear({ ...entrada, vigente_hasta: '2020-01-01T00:00:00.000Z' })).json.datos;
    assert.equal((await editar(vencido.id, 'publicar', 0)).json.codigo, 'VIGENCIA_VENCIDA');
    const pagina = (await listar(ana, '?limite=2')).json.datos;
    assert.equal(pagina.avisos.length, 2);
    assert.equal(pagina.sin_leer_total, 3);
    const siguiente = '?limite=2&cursor=' + pagina.cursor_siguiente;
    const resto = (await listar(ana, siguiente)).json.datos;
    assert.equal(resto.avisos.length, 1);
    assert.ok(!pagina.avisos.some(aviso => aviso.id === resto.avisos[0].id));
    assert.equal((await listar(bea, siguiente)).status, 400);
    assert.deepEqual((await listar(ana, '?filtro=mi_zona')).json.datos, {
      avisos: [], cursor_siguiente: null, sin_leer_total: 3, estado_zona: 'sin_confirmacion',
    });
    assert.equal((await resumen(bea)).json.datos.estado_zona, 'sin_domicilio');
    await Aviso.collection.updateOne({ _id: resto.avisos[0].id }, { $set: { vigente_hasta: new Date(Date.now() - 1) } });
    assert.equal((await leer(ana, resto.avisos[0].id)).status, 404);
    assert.equal((await resumen(ana)).json.datos.sin_leer_total, 2);
  });

  await t.test('proyección pública del propietario, sin escrituras en reportes', async () => {
    const reporte = { _id: new mongoose.Types.ObjectId(), ciudadano_id_clerk: ana.id, ciudadano_email: 'privado@example.test' };
    const evento = (accion, extras = {}) => ({ accion, id: randomUUID(), fecha: new Date().toISOString(), ...extras });
    reporte.historial_atencion = [
      evento('CAMBIAR_ESTADO', { estado_nuevo: 'EN_REVISION', nota_interna: 'privada', respuesta_publica: 'Texto público' }),
      evento('RESPONDER', { respuesta_publica: 'Respuesta' }),
      evento('AGREGAR_NOTA', { nota_interna: 'privada' }),
      evento('RESPONDER', { respuesta_publica: 'Histórica', fecha: '2020-01-01T00:00:00.000Z' }),
    ];
    await Reclamo.collection.insertOne(reporte);
    const totalAvisos = await Aviso.countDocuments();
    const avisos = (await listar(ana)).json.datos.avisos.filter(a => a.tipo === 'reporte');
    assert.equal(avisos.length, 2);
    assert.equal((await resumen(ana)).json.datos.sin_leer_total, 4);
    for (const aviso of avisos) {
      assert.deepEqual(aviso.referencia, { tipo: 'reporte', id: String(reporte._id) });
      assert.doesNotMatch(JSON.stringify(aviso), /privad|ciudadano_id_clerk|funcionario/);
      assert.equal((await leer(bea, aviso.id)).status, 404);
    }
    assert.equal((await listar(bea)).json.datos.avisos.filter(a => a.tipo === 'reporte').length, 0);
    assert.equal((await leer(ana, avisos[0].id)).json.datos.sin_leer_total, 3);
    assert.equal(await Aviso.countDocuments(), totalAvisos);
    assert.deepEqual(await Reclamo.collection.findOne({ _id: reporte._id }), reporte);
  });
});
