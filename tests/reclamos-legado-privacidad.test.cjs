const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { entorno } = require('./helpers/entorno.cjs');

const id = '000000000000000000000001';

function preparar(rol, marcadores = {}) {
  const consultas = [];
  const escrituras = [];
  let protegidos = marcadores;
  const reclamo = {
    _id: id, folio: 'REC-PRUEBA', estado: 'PENDIENTE', solucion_notas: 'Nota reservada',
    historial_atencion: [{ nota_interna: 'Interna R1' }], operacion: { hash: 'OP-R1' },
  };
  const e = entorno(rol, { dependencias: {
    '@/modelos/Reclamo': { ModeloReclamo: {
      find(filtro) {
        consultas.push(filtro);
        return { sort: () => ({ limit: () => ({ lean: async () => [reclamo] }) }) };
      },
      async findOneAndUpdate(filtro, cambio) {
        assert.equal(filtro._id, id);
        assert.deepEqual(Object.keys(filtro).sort(),
          ['_id', 'contrato_creacion', 'historial_atencion', 'operacion', 'respuesta_publica', 'version_atencion']);
        const campos = Object.keys(filtro).filter(campo => campo !== '_id');
        for (const campo of campos) assert.equal(filtro[campo].$exists, false);
        if (!protegidos || campos.some(campo => Object.hasOwn(protegidos, campo))) return null;
        escrituras.push({ id: filtro._id, ...cambio.$set });
        return { ...reclamo, ...cambio.$set };
      },
      async exists() { return protegidos ? { _id: id } : null; },
    } },
  } });
  const patch = e.load(path.join(__dirname, '../src/app/api/reclamos/[id]/route.ts')).PATCH;
  return { ...e, consultas, escrituras, versionar: () => { protegidos = { version_atencion: 1, historial_atencion: [{}] }; },
    listar: () => e.call('reclamos', 'GET', undefined, '?solo_propios=true&ruta_id=R1&estado=resuelto'),
    actualizar: (body = { estado: 'ATENDIDO' }) => patch(new Request('http://localhost/api/reclamos/' + id, {
      method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
    }), { params: Promise.resolve({ id }) }),
  };
}

for (const [caso, rol, status, configurar] of [
  ['sin sesión', 'admin', 401, e => { e.state.sesion = null; }],
  ['sin permiso', 'ciudadano', 403, () => {}],
  ['Clerk indisponible', 'admin', 503, e => { e.state.failClerk = true; }],
  ['estado de permisos indisponible', 'admin', 503, e => { e.state.failDB = true; }],
  ['rol divergente', 'admin', 403, e => {
    e.state.mongoUsers.push({ id_clerk: e.actor.id, rol: 'ciudadano', activo: true });
  }],
]) {
  test('GET y PATCH heredados deniegan ' + caso + ' sin consultar ni escribir reclamos', async () => {
    const e = preparar(rol);
    configurar(e);
    assert.equal((await e.listar()).status, status);
    assert.equal((await e.actualizar()).status, status);
    assert.deepEqual(e.consultas, []);
    assert.deepEqual(e.escrituras, []);
  });
}

test('GET administrativo conserva filtros y alias; PATCH responde con un DTO mínimo y ambos alias', async () => {
  const e = preparar('admin');
  const listado = await e.listar();
  assert.equal(listado.status, 200);
  const [registro] = (await listado.json()).datos;
  assert.equal(registro.solucion_notas, 'Nota reservada');
  assert.equal(registro.notasAdmin, 'Nota reservada');
  const filtro = e.consultas[0];
  assert.equal(filtro.ciudadano_id_clerk, e.actor.id);
  assert.equal(filtro.ruta_id, 'R1');
  assert.equal(filtro.estado, 'ATENDIDO');
  for (const entrada of [{ notasAdmin: 'Alias' }, { solucion_notas: 'Principal', notasAdmin: 'Ignorado' }]) {
    const respuesta = await e.actualizar({ estado: 'en_proceso', ...entrada });
    assert.equal(respuesta.status, 200);
    const nota = entrada.solucion_notas ?? entrada.notasAdmin;
    const { datos } = await respuesta.json();
    assert.deepEqual(datos, {
      _id: id, estado: 'EN_REVISION', fecha_resolucion: null, solucion_notas: nota, notasAdmin: nota,
    });
    assert.equal(e.escrituras.at(-1).solucion_notas, nota);
  }
});


for (const [caso, marcadores] of [
  ['R1 recién creado', { contrato_creacion: 'reclamos-r1' }],
  ['histórico atendido', { version_atencion: 1, historial_atencion: [{}] }],
  ['marca de contrato desconocida', { contrato_creacion: 'otro' }],
  ['versión nula', { version_atencion: null }],
  ['historial vacío', { historial_atencion: [] }],
  ['operación aislada', { operacion: {} }],
  ['respuesta aislada', { respuesta_publica: '' }],
]) {
  test('PATCH heredado no escribe sobre ' + caso, async () => {
    const e = preparar('admin', marcadores);
    const r = await e.actualizar({ notasAdmin: 'Intento' });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).codigo, 'RECLAMO_REQUIERE_R1');
    assert.deepEqual(e.escrituras, []);
  });
}
test('PATCH heredado distingue el documento inexistente', async () => {
  const e = preparar('admin', null);
  assert.equal((await e.actualizar()).status, 404);
  assert.deepEqual(e.escrituras, []);
});
test('PATCH heredado evalúa el versionamiento en la escritura, después de la autorización', async () => {
  const e = preparar('admin');
  e.state.beforeConnect = async () => e.versionar();
  assert.equal((await e.actualizar()).status, 409);
  assert.deepEqual(e.escrituras, []);
});
