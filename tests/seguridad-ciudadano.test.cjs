const { test } = require('node:test');
const assert = require('node:assert/strict');
const { entorno } = require('./helpers/entorno.cjs');

test('sincronización ciudadana anónima falla con 401', async () => {
  const e = entorno(); e.state.sesion = null;
  const resp = await e.call('ciudadano/sincronizar', 'POST');
  assert.equal(resp.status, 401);
});

test('sincronización ciudadana asigna exclusivamente rol ciudadano', async () => {
  const e = entorno('ciudadano');
  const resp = await e.call('ciudadano/sincronizar', 'POST');
  assert.equal(resp.status, 200);
  const data = await resp.json();
  assert.equal(data.exito, true);
  assert.equal(data.datos.rol, 'ciudadano');
});

test('ciudadano no puede acceder a endpoints administrativos tras sincronizar', async () => {
  const e = entorno('ciudadano');
  await e.call('ciudadano/sincronizar', 'POST');
  const rUsuarios = await e.call('usuarios', 'GET');
  assert.equal(rUsuarios.status, 403);
});

for (const causa of ['banned', 'locked', 'inactivoClerk', 'inactivoMongo', 'bloqueo', 'bloqueoCorreo', 'rolClerk', 'rolMongo', 'sinVerificar', 'correoAjeno', 'correoCambiado']) {
  test(`sincronización ciudadana rechaza ${causa} sin escribir perfiles`, async () => {
    const e = entorno('ciudadano'); let status = 403;
    if (causa === 'banned' || causa === 'locked') e.actor[causa] = true;
    if (causa === 'inactivoClerk') e.actor.publicMetadata.activo = false;
    if (causa === 'inactivoMongo') e.state.mongoUsers.push({ id_clerk: e.actor.id, activo: false, rol: 'ciudadano' });
    if (causa === 'bloqueo' || causa === 'bloqueoCorreo') { e.state.locks.add(causa === 'bloqueo' ? e.actor.id : `correo:${e.actor.emailAddresses[0].emailAddress}`); status = 409; }
    if (causa === 'rolClerk') e.actor.publicMetadata.rol = 'admin';
    if (causa === 'rolMongo') e.state.mongoUsers.push({ id_clerk: e.actor.id, activo: true, rol: 'admin' });
    if (causa === 'sinVerificar') e.actor.emailAddresses[0].verification.status = 'unverified';
    if (causa === 'correoAjeno') { e.state.mongoUsers.push({ id_clerk: e.target.id, activo: true, rol: 'ciudadano', correo_electronico: e.actor.emailAddresses[0].emailAddress }); status = 409; }
    if (causa === 'correoCambiado') { e.state.mongoUsers.push({ id_clerk: e.actor.id, activo: true, rol: 'ciudadano', correo_electronico: 'anterior@example.test' }); status = 409; }
    const r = await e.call('ciudadano/sincronizar', 'POST');
    assert.equal(r.status, status); assert.equal(e.state.writes.length, 0);
  });
}

test('sincronización permite ciudadano nuevo sin cambiar Clerk ni aceptar rol del cliente', async () => {
  const e = entorno('ciudadano');
  const r = await e.call('ciudadano/sincronizar', 'POST', { rol: 'admin', id_clerk: e.target.id });
  assert.equal(r.status, 200); const body = await r.json();
  assert.equal(body.datos.id_clerk, e.actor.id); assert.equal(body.datos.rol, 'ciudadano');
  assert.equal(e.state.mongoUsers.length, 1); assert.equal(e.state.mongoUsers[0].activo, true);
  assert.equal(e.state.writes.some(w => String(w[0]).startsWith('clerk:')), false);
  assert.equal(e.state.locks.size, 0);
});

test('sincronizador relee restricciones dentro del bloqueo', async () => {
  const e = entorno('ciudadano');
  e.state.afterLock = async () => { e.actor.locked = true; };
  const r = await e.call('ciudadano/sincronizar', 'POST');
  assert.equal(r.status, 403); assert.equal(e.state.writes.length, 0); assert.equal(e.state.locks.size, 0);
});

test('sincronización existente preserva perfil ciudadano, responde no-store y no duplica', async () => {
  const e = entorno('ciudadano'); const correo = e.actor.emailAddresses[0].emailAddress;
  e.state.mongoUsers.push({ id_clerk: e.actor.id, correo_electronico: correo, rol: 'ciudadano', activo: true, telefono: 'conservado' });
  for (let intento = 0; intento < 2; intento++) {
    const r = await e.call('ciudadano/sincronizar', 'POST');
    assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'private, no-store');
  }
  assert.equal(e.state.mongoUsers.length, 1); assert.equal(e.state.mongoUsers[0].telefono, 'conservado');
});

test('sincronizaciones concurrentes no duplican perfiles ni dejan bloqueo tras éxito', async () => {
  const e = entorno('ciudadano');
  const rs = await Promise.all([e.call('ciudadano/sincronizar', 'POST'), e.call('ciudadano/sincronizar', 'POST')]);
  assert.deepEqual(rs.map(r => r.status).sort(), [200, 409]);
  assert.equal(e.state.mongoUsers.length, 1); assert.equal(e.state.locks.size, 0);
});

test('sincronización de resultado incierto no habilita nuevo intento ni bootstrap', async () => {
  const e = entorno('ciudadano'); e.state.failUserWrite = true;
  assert.equal((await e.call('ciudadano/sincronizar', 'POST')).status, 503);
  assert.equal((await e.call('ciudadano/sincronizar', 'POST')).status, 409);
  assert.equal(e.state.mongoUsers.length, 0);
});
