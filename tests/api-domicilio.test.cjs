const { test } = require('node:test');
const assert = require('node:assert/strict');
const { entornoDomicilio } = require('./helpers/domicilio.cjs');

const entrada = { latitud: 20.46, longitud: -97.08, tipo_seleccion: 'gps', confirmada: true };
const privados = resp => assert.equal(resp.headers.get('cache-control'), 'private, no-store');
const metodos = ['GET', 'POST', 'PUT'];

for (const metodo of metodos) {
  for (const caso of ['anonimo', 'inactivoMongo', 'banned', 'locked', 'inactivoClerk', 'bloqueo', 'bloqueoCorreo',
    'admin', 'conductor', 'rolMongo', 'correoNoVerificado', 'sinPerfil', 'identidadCorreo', 'mongo', 'clerk']) {
    test(`${metodo}: rechaza ${caso} sin leer ni escribir domicilios`, async () => {
      const e = entornoDomicilio(); let status = 403;
      if (caso === 'anonimo') { e.state.sesion = null; status = 401; }
      if (caso === 'inactivoMongo') e.state.mongoUsers[0].activo = false;
      if (caso === 'banned' || caso === 'locked') e.actor[caso] = true;
      if (caso === 'inactivoClerk') e.actor.publicMetadata.activo = false;
      if (caso === 'bloqueo' || caso === 'bloqueoCorreo') { e.state.locks.add(caso === 'bloqueo' ? e.actor.id : 'correo:' + e.actor.emailAddresses[0].emailAddress); status = 409; }
      if (caso === 'admin' || caso === 'conductor') e.actor.publicMetadata.rol = caso;
      if (caso === 'rolMongo') e.state.mongoUsers[0].rol = 'admin';
      if (caso === 'correoNoVerificado') e.actor.emailAddresses[0].verification.status = 'unverified';
      if (caso === 'sinPerfil') { e.state.mongoUsers = []; status = 409; }
      if (caso === 'identidadCorreo') { e.state.mongoUsers[0].correo_electronico = 'otro@example.test'; status = 409; }
      if (caso === 'mongo') { e.state.failDB = true; status = 503; }
      if (caso === 'clerk') { e.state.failClerk = true; status = 503; }
      const r = await e.call('ciudadano/domicilio', metodo, metodo === 'GET' ? undefined : { ...entrada, ...(metodo === 'PUT' ? { version: 0 } : {}) });
      assert.equal(r.status, status); privados(r);
      assert.equal(e.state.consultasDomicilio.length, 0); assert.equal(e.state.escriturasDomicilio.length, 0);
    });
  }
}

test('GET sin domicilio devuelve null y GET propio no expone dueño, _id ni campos internos', async () => {
  const e = entornoDomicilio();
  let r = await e.call('ciudadano/domicilio', 'GET'); privados(r);
  assert.equal(r.status, 200); assert.equal((await r.json()).datos, null);
  e.sembrar(e.target.id); const propio = e.sembrar();
  r = await e.call('ciudadano/domicilio', 'GET'); const body = await r.json();
  assert.equal(r.status, 200); assert.deepEqual(body.datos.ubicacion.coordinates, [-97.09, 20.45]);
  assert.equal(body.datos.version, 0); assert.equal(body.datos.asignacion.estado, 'pendiente');
  assert.equal(body.datos.fecha_confirmacion, propio.fecha_confirmacion.toISOString());
  for (const clave of ['ciudadano_id_clerk', '_id', '__v', 'correo_electronico', 'rol']) assert.equal(Object.hasOwn(body.datos, clave), false);
  assert.ok(e.state.consultasDomicilio.every(q => q.ciudadano_id_clerk === e.actor.id));
});

test('POST crea solo el domicilio propio confirmado con fechas servidor y estado pendiente', async () => {
  const e = entornoDomicilio(); const inicio = Date.now();
  const r = await e.call('ciudadano/domicilio', 'POST', entrada); privados(r);
  assert.equal(r.status, 201); const body = await r.json();
  assert.deepEqual(body.datos.ubicacion, { type: 'Point', coordinates: [-97.08, 20.46] });
  assert.equal(body.datos.version, 0); assert.equal(body.datos.asignacion.ruta_id, null);
  assert.ok(Date.parse(body.datos.fecha_confirmacion) >= inicio);
  assert.equal(e.state.domicilios[0].ciudadano_id_clerk, e.actor.id);
  assert.equal(e.state.locks.size, 0); assert.equal(e.state.writes.some(w => String(w[0]).startsWith('local:')), false);
});

test('POST duplicado devuelve 409 sin alterar el domicilio', async () => {
  const e = entornoDomicilio(); e.sembrar(); const antes = JSON.stringify(e.state.domicilios);
  const r = await e.call('ciudadano/domicilio', 'POST', entrada);
  assert.equal(r.status, 409); assert.equal(JSON.stringify(e.state.domicilios), antes); assert.equal(e.state.locks.size, 0);
});

test('PUT actualiza punto y reinicia asignación juntos, incrementando versión', async () => {
  const e = entornoDomicilio(); const ajeno = e.sembrar(e.target.id); const ahora = new Date();
  e.sembrar(e.actor.id, { asignacion: { estado: 'asignada', ruta_id: '507f1f77bcf86cd799439011', metodo: 'cobertura_oficial',
    fecha_evaluacion: ahora, version_politica: '1', huella_catalogo: '1', motivo: 'oficial' } });
  const r = await e.call('ciudadano/domicilio', 'PUT', { ...entrada, version: 0 }); privados(r);
  assert.equal(r.status, 200); const doc = (await r.json()).datos;
  assert.equal(doc.version, 1); assert.equal(doc.asignacion.estado, 'pendiente');
  for (const campo of ['ruta_id', 'metodo', 'fecha_evaluacion', 'version_politica', 'huella_catalogo', 'motivo']) assert.equal(doc.asignacion[campo], null);
  assert.deepEqual(doc.ubicacion.coordinates, [-97.08, 20.46]);
  assert.deepEqual(e.state.domicilios[0].ubicacion, ajeno.ubicacion);
});

test('PUT sin domicilio es 404 y con versión obsoleta es 409', async () => {
  const e = entornoDomicilio();
  assert.equal((await e.call('ciudadano/domicilio', 'PUT', { ...entrada, version: 0 })).status, 404);
  e.sembrar(); assert.equal((await e.call('ciudadano/domicilio', 'PUT', { ...entrada, version: 2 })).status, 409);
  assert.equal(e.state.escriturasDomicilio.length, 0); assert.equal(e.state.locks.size, 0);
});

for (const metodo of ['POST', 'PUT']) test(`${metodo}: valida coordenadas, confirmación y campos desconocidos antes de escribir`, async () => {
  const e = entornoDomicilio(); e.sembrar();
  for (const cambio of [{ latitud: null }, { longitud: '20' }, { latitud: 91 }, { longitud: 181 }, { confirmada: false },
    { tipo_seleccion: 'otro' }, { ciudadano_id_clerk: e.target.id }, { propietario: e.target.id }, { _id: 'ajeno' },
    { rol: 'admin' }, { ruta_id: 'ruta_local' }, { asignacion: {} }, { fecha_confirmacion: 'ayer' }, { estado: 'asignada' }]) {
    const r = await e.call('ciudadano/domicilio', metodo, { ...entrada, ...(metodo === 'PUT' ? { version: 0 } : {}), ...cambio });
    assert.equal(r.status, 400, JSON.stringify(cambio)); privados(r);
  }
  assert.equal(e.state.escriturasDomicilio.length, 0); assert.equal(e.state.locks.size, 0);
});

test('parámetros de propietario ajeno nunca seleccionan otro domicilio', async () => {
  const e = entornoDomicilio(); e.sembrar(e.target.id);
  for (const metodo of metodos) {
    const r = await e.call('ciudadano/domicilio', metodo, metodo === 'GET' ? undefined : entrada, '?ciudadano_id_clerk=' + e.target.id);
    assert.equal(r.status, 400); privados(r);
  }
  assert.equal(e.state.consultasDomicilio.length, 0);
});

test('limita bytes reales, rechaza JSON inválido y exige application/json', async () => {
  const e = entornoDomicilio();
  for (const [texto, headers, status] of [['{', {}, 400], ['null', {}, 400], ['[]', {}, 400],
    [' '.repeat(4097), {}, 413], ['"' + 'ñ'.repeat(2050) + '"', { 'content-length': '1' }, 413],
    [JSON.stringify(entrada), { 'content-type': 'text/plain' }, 415],
    [JSON.stringify(entrada), { 'content-length': '9000' }, 413]]) {
    const r = await e.directa('POST', texto, headers); assert.equal(r.status, status); privados(r);
  }
  assert.equal(e.state.escriturasDomicilio.length, 0);
});

test('petición con cookies de origen ajeno se rechaza, Bearer conserva compatibilidad del proxy PWA', async () => {
  const e = entornoDomicilio();
  assert.equal((await e.directa('POST', JSON.stringify(entrada), { origin: 'https://ajeno.test' })).status, 403);
  assert.equal((await e.directa('POST', JSON.stringify(entrada), { origin: 'https://iphone.local', authorization: 'Bearer token-verificado-por-clerk' })).status, 201);
});

test('índice ausente, parcial o sparse impide escrituras sin crearlo', async () => {
  const e = entornoDomicilio(); e.sembrar();
  for (const indices of [[], [{ key: { ciudadano_id_clerk: 1 }, unique: false }],
    [{ key: { ciudadano_id_clerk: 1, otro: 1 }, unique: true }],
    [{ key: { ciudadano_id_clerk: 1 }, unique: true, sparse: true }],
    [{ key: { ciudadano_id_clerk: 1 }, unique: true, partialFilterExpression: { activo: true } }]]) {
    e.state.indices = indices;
    for (const metodo of ['POST', 'PUT']) {
      const r = await e.call('ciudadano/domicilio', metodo, { ...entrada, ...(metodo === 'PUT' ? { version: 0 } : {}) });
      assert.equal(r.status, 503); privados(r);
    }
  }
  assert.equal(e.state.escriturasDomicilio.length, 0); assert.equal(e.state.locks.size, 0);
});

test('errores Mongo no exponen coordenadas, URI ni mensajes internos', async () => {
  const e = entornoDomicilio(); e.state.falloDomicilio = true;
  for (const metodo of metodos) {
    const r = await e.call('ciudadano/domicilio', metodo, metodo === 'GET' ? undefined : { ...entrada, ...(metodo === 'PUT' ? { version: 0 } : {}) });
    assert.equal(r.status, 503); privados(r); assert.doesNotMatch(await r.text(), /secreto|97\.09|20\.45|mongodb/);
  }
});

test('creación concurrente produce un solo domicilio y un conflicto', async () => {
  const e = entornoDomicilio();
  const rs = await Promise.all([e.call('ciudadano/domicilio', 'POST', entrada), e.call('ciudadano/domicilio', 'POST', entrada)]);
  assert.deepEqual(rs.map(r => r.status).sort(), [201, 409]);
  assert.equal(e.state.domicilios.length, 1); assert.equal(e.state.escriturasDomicilio.length, 1);
});

test('actualización concurrente no sobrescribe otra edición', async () => {
  const e = entornoDomicilio(); e.sembrar();
  const rs = await Promise.all([e.call('ciudadano/domicilio', 'PUT', { ...entrada, version: 0 }),
    e.call('ciudadano/domicilio', 'PUT', { ...entrada, latitud: 20.47, version: 0 })]);
  assert.deepEqual(rs.map(r => r.status).sort(), [200, 409]);
  assert.equal(e.state.domicilios[0].version, 1); assert.equal(e.state.escriturasDomicilio.length, 1);
});

test('CAS de Mongoose detecta modificación externa después de leer el documento', async () => {
  const e = entornoDomicilio(); e.sembrar();
  e.state.antesGuardar = async () => { e.state.domicilios[0].version++; };
  const r = await e.call('ciudadano/domicilio', 'PUT', { ...entrada, version: 0 });
  assert.equal(r.status, 409); assert.equal(e.state.escriturasDomicilio.length, 0); assert.equal(e.state.locks.size, 0);
});

test('un duplicado Mongo detectado durante insert devuelve 409 y libera el bloqueo', async () => {
  const e = entornoDomicilio();
  e.state.antesInsertar = async () => { e.sembrar(); };
  const r = await e.call('ciudadano/domicilio', 'POST', entrada);
  assert.equal(r.status, 409); privados(r);
  assert.equal(e.state.domicilios.length, 1); assert.equal(e.state.locks.size, 0);
});

test('fallo posterior a una escritura conserva bloqueo y no filtra datos en respuesta ni logs', async () => {
  const logs = [];
  const e = entornoDomicilio({ console: { log: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) } });
  e.state.despuesInsertar = async () => { throw Error('mongodb://secreto coordenadas [-97.08,20.46]'); };
  const r = await e.call('ciudadano/domicilio', 'POST', entrada);
  assert.equal(r.status, 503); privados(r);
  assert.equal(e.state.domicilios.length, 1); assert.ok(e.state.locks.has(e.actor.id));
  assert.doesNotMatch(await r.text(), /mongodb|secreto|97\.08|20\.46/);
  assert.doesNotMatch(JSON.stringify(logs), /mongodb|secreto|97\.08|20\.46/);
  assert.equal((await e.call('ciudadano/domicilio', 'GET')).status, 409);
});

test('restricción introducida al adquirir exclusión impide guardar domicilio', async () => {
  const e = entornoDomicilio();
  e.state.afterLock = async () => { e.actor.banned = true; };
  const r = await e.call('ciudadano/domicilio', 'POST', entrada);
  assert.equal(r.status, 403); assert.equal(e.state.escriturasDomicilio.length, 0); assert.equal(e.state.locks.size, 0);
});

test('secuencia sincronizar, crear, consultar y actualizar conserva contrato y aislamiento', async () => {
  const e = entornoDomicilio(); e.state.mongoUsers = [];
  assert.equal((await e.call('ciudadano/domicilio', 'GET')).status, 409);
  assert.equal((await e.call('ciudadano/sincronizar', 'POST')).status, 200);
  assert.equal((await e.call('ciudadano/domicilio', 'POST', entrada)).status, 201);
  assert.equal((await (await e.call('ciudadano/domicilio', 'GET')).json()).datos.version, 0);
  assert.equal((await e.call('ciudadano/domicilio', 'PUT', { ...entrada, version: 0 })).status, 200);
  e.state.sesion = e.target.id;
  e.state.mongoUsers.push({ id_clerk: e.target.id, correo_electronico: e.target.emailAddresses[0].emailAddress, rol: 'ciudadano', activo: true });
  const r = await e.call('ciudadano/domicilio', 'GET');
  assert.equal(r.status, 200); assert.equal((await r.json()).datos, null);
});
