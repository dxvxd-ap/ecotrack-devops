const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function cargar(ruta, dobles = {}, cache = new Map()) {
  const rutaNormalizada = ruta.replace(/\\/g, '/');
  if (dobles[rutaNormalizada]) return dobles[rutaNormalizada];
  if (cache.has(rutaNormalizada)) return cache.get(rutaNormalizada);
  const archivo = path.join(root, 'src', rutaNormalizada + '.ts');
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const modulo = { exports: {} };
  cache.set(rutaNormalizada, modulo.exports);
  new Function('require', 'module', 'exports', codigo)(nombre => {
    const nombreNormalizado = nombre.replace(/\\/g, '/');
    if (dobles[nombreNormalizado]) return dobles[nombreNormalizado];
    if (nombreNormalizado.startsWith('@/')) return cargar(nombreNormalizado.slice(2), dobles, cache);
    if (nombreNormalizado.startsWith('.')) return cargar(path.join(path.dirname(rutaNormalizada), nombreNormalizado).replace(/\\/g, '/'), dobles, cache);
    return require(nombre);
  }, modulo, modulo.exports);
  return modulo.exports;
}
module.exports = { cargar };

if (require.main === module) {
  process.env.CLERK_SECRET_KEY = "fixture-cursor";
  class ErrorAdministrativo extends Error {
    constructor(status, mensaje) { super(mensaje); this.status = status; }
  }
  const dobles = { 'lib/autorizacion': { ErrorAdministrativo } };
  const contrato = () => cargar('contratos/avisos', dobles);
  test('consulta: filtros, límites, repetidos y cursor aislado', () => {
    const c = contrato();
    assert.equal(c.consulta(new URLSearchParams()).limite, 20);
    assert.throws(() => c.consulta(new URLSearchParams('filtro=todos&filtro=sin_leer')));
    assert.throws(() => c.consulta(new URLSearchParams('limite=51')));
    const cursor = c.crearCursor('user_a', 'todos', { publicado_en: new Date(), id: 'a'.repeat(64) });
    assert.ok(c.leerCursor(cursor, 'user_a', 'todos'));
    assert.throws(() => c.leerCursor(cursor, 'user_b', 'todos'));
    assert.throws(() => c.leerCursor(cursor, 'user_a', 'mi_zona'));
    const partes = JSON.parse(Buffer.from(cursor, 'base64url'));
    partes[2] = 'b'.repeat(64);
    const alterado = Buffer.from(JSON.stringify(partes)).toString('base64url');
    assert.throws(() => c.leerCursor(alterado, 'user_a', 'todos'));
  });
  test('borrador: valida prioridad, vigencia y alcance', () => {
    const c = contrato();
    const base = { tipo: 'comunicado', audiencia: 'municipio', titulo: ' Aviso ', mensaje: 'Contenido', prioridad: 'normal' };
    assert.equal(c.borrador(base).titulo, 'Aviso');
    assert.throws(() => c.borrador({ ...base, prioridad: 'inventada' }));
    assert.throws(() => c.borrador({ ...base, audiencia: 'ruta' }));
    assert.throws(() => c.borrador({ ...base, vigente_desde: '2027-01-02T00:00:00Z', vigente_hasta: '2027-01-01T00:00:00Z' }));
    assert.throws(() => c.borrador({ ...base, ciudadano_id_clerk: 'user_ajeno' }));
  });
}


const { entorno } = require('./helpers/entorno.cjs');

test('la bandeja toma la identidad de Clerk y rechaza visitantes y cuentas sin perfil sincronizado', async () => {
  const actores = [];
  const e = entorno('ciudadano', { dependencias: {
    'node:crypto': require('node:crypto'),
    '@/lib/avisos': { listarAvisos: async actor => { actores.push(actor); return []; } },
  } });
  const consultar = () => e.call('ciudadano/avisos', 'GET');
  e.state.sesion = null;
  assert.equal((await consultar()).status, 401);
  e.state.sesion = e.actor.id;
  assert.equal((await consultar()).status, 409);
  assert.deepEqual(actores, []);
  e.state.mongoUsers.push({
    id_clerk: e.actor.id, rol: 'ciudadano', activo: true,
    correo_electronico: e.actor.emailAddresses[0].emailAddress,
  });
  assert.equal((await consultar()).status, 200);
  assert.deepEqual(actores, [e.actor.id]);
});

test('la API administrativa de Avisos exige su permiso en el handler y en middleware', async () => {
  for (const [rol, esperado] of [['ciudadano', 403], ['admin', 200]]) {
    const e = entorno(rol, { dependencias: {
      'node:crypto': require('node:crypto'),
      '@/lib/avisos_admin': { listarAvisosAdmin: async () => [] },
    } });
    assert.equal((await e.call('v1/admin/avisos', 'GET')).status, esperado);
    assert.equal((await e.middle('v1/admin/avisos', 'GET')).status, esperado);
  }
});
