'use strict';
// Ejecución explícita. Nunca forma parte de npm test ni carga dotenv/base_datos.ts.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const net = require('node:net');
const http = require('node:http');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { Readable } = require('node:stream');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const ts = require('typescript');
const mongoose = require('mongoose');
const { NextResponse } = require('next/server');

const raiz = path.resolve(__dirname, '../..');
const destino = Object.freeze({
  id: 'f4e95d3a33837be25a672f4bc1df3f9517dbd910971c317e11e7bce633591b00',
  nombre: 'ecotrack-mongo-322-d8d77bcd3c02', base: 'ecotrack_pruebas_322_d8d77bcd3c02',
  directorio: '/private/tmp/ecotrack-mongo-322-BXtinf', host: '127.0.0.1', puerto: 27018,
});
const resultados = [];
const conexiones = [];
const contexto = new AsyncLocalStorage();
const prefijo = `user_it325_${crypto.randomBytes(5).toString('hex')}_`;
let servidor, puertoHttp, precondiciones = false;
let redRechazada = null;
const conectarOriginal = net.Socket.prototype.connect;
// Impide conexiones TCP a cualquier destino que no sea el Mongo aprobado o el HTTP local de esta suite.
net.Socket.prototype.connect = function (...args) {
  // net.createConnection entrega a Socket.connect un array ya normalizado en Node 22.
  const normalizados = net._normalizeArgs(Array.isArray(args[0]) ? args[0] : args)[0];
  if (normalizados.path || normalizados.host !== destino.host ||
      ![destino.puerto, puertoHttp].includes(Number(normalizados.port))) {
    redRechazada = { host: normalizados.host === destino.host ? 'loopback' : normalizados.host ? 'otro' : 'ausente',
      puerto: Number(normalizados.port) || null, socket: !!normalizados.path, argumento_array: Array.isArray(args[0]) };
    throw new Error('DESTINO_DE_RED_NO_AUTORIZADO');
  }
  return conectarOriginal.apply(this, args);
};

function cli(args) {
  const r = spawnSync('/Users/baldo/.docker/bin/docker', ['--context', 'desktop-linux', ...args], {
    encoding: 'utf8', timeout: 15000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
  });
  if (r.status !== 0 || r.error) throw new Error('PREFLIGHT_DOCKER_FALLIDO');
  return r.stdout.trim();
}
function loader(instancia, usuariosClerk = new Map(), opcion = {}) {
  const cache = new Map();
  const cargar = relativa => {
    const archivo = path.resolve(raiz, relativa);
    if (!archivo.startsWith(raiz + '/src/')) throw new Error('ARCHIVO_NO_AUTORIZADO');
    if (archivo.endsWith('/lib/base_datos.ts')) throw new Error('CONECTOR_DE_PRODUCCION_PROHIBIDO');
    if (cache.has(archivo)) return cache.get(archivo).exports;
    const modulo = { exports: {} }; cache.set(archivo, modulo);
    const requerir = nombre => {
      if (nombre === 'mongoose') return instancia;
      if (nombre === 'next/server') return { NextResponse };
      if (nombre === '@clerk/nextjs/server') return { auth: async () => ({ userId: contexto.getStore()?.id || null }) };
      if (nombre === '@clerk/backend') return { createClerkClient: () => ({ users: {
        getUser: async id => {
          const u = usuariosClerk.get(id);
          if (!u) throw Object.assign(new Error('IDENTIDAD_FICTICIA_DESCONOCIDA'), { status: 404 });
          return structuredClone(u);
        },
      } }) };
      if (nombre === '@/lib/base_datos') return { conectar_base_datos: async () => {
        if (opcion.conexionRechazada) throw new Error('CONEXION_DE_PRUEBA_RECHAZADA');
        assert.equal(instancia.connection.readyState, 1);
        assert.equal(instancia.connection.name, destino.base);
        return instancia;
      } };
      if (nombre.startsWith('@/')) return cargar(`src/${nombre.slice(2)}.ts`);
      if (nombre.startsWith('.')) return cargar(path.relative(raiz, path.resolve(path.dirname(archivo), nombre + '.ts')));
      throw new Error('DEPENDENCIA_NO_AUTORIZADA');
    };
    const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext('(function(require,module,exports){' + codigo + '\n})', {
      process: { env: {}, cwd: () => raiz }, console: { error() {}, warn() {}, log() {} },
      Response, URL, Date, Set, Map, TextDecoder,
    }, { filename: archivo })(requerir, modulo, modulo.exports);
    return modulo.exports;
  };
  return cargar;
}
async function abrir(clave) {
  const m = new mongoose.Mongoose();
  m.set('autoCreate', false); m.set('autoIndex', false); m.set('bufferCommands', false);
  await m.connect('mongodb://127.0.0.1:27018', {
    dbName: destino.base, authSource: destino.base,
    auth: { username: 'ecotrack_pruebas', password: clave },
    directConnection: true, retryWrites: false, serverSelectionTimeoutMS: 1500,
  });
  conexiones.push(m);
  const hosts = m.connection.getClient().options.hosts;
  assert.equal(hosts.length, 1); assert.equal(hosts[0].host, destino.host); assert.equal(hosts[0].port, destino.puerto);
  assert.equal(m.connection.name, destino.base);
  return m;
}
function dato(id, cambios = {}) {
  return { ciudadano_id_clerk: id, ubicacion: { type: 'Point', coordinates: [-97.01, 20.01] },
    tipo_seleccion: 'manual', fecha_confirmacion: new Date(), ...cambios };
}
function ficticio(id, rol = 'ciudadano') {
  return { id, primaryEmailAddressId: 'correo_prueba', firstName: 'Identidad', lastName: 'Ficticia',
    publicMetadata: { rol, activo: true }, banned: false, locked: false,
    emailAddresses: [{ id: 'correo_prueba', emailAddress: `${id}@example.test`, verification: { status: 'verified' } }] };
}
async function caso(categoria, nombre, ejecutar) {
  assert.ok(precondiciones);
  try { const evidencia = await ejecutar(); resultados.push({ categoria, nombre, estado: 'aprobada', ...(evidencia ? { evidencia } : {}) }); }
  catch (error) { resultados.push({ categoria, nombre, estado: 'fallida', tipo: error.name,
    codigo: typeof error.code === 'number' ? error.code : undefined }); }
  console.log(JSON.stringify(resultados.at(-1)));
}

(async () => {
  try {
    // Estas verificaciones preceden a toda escritura de prueba.
    const manifiesto = JSON.parse(fs.readFileSync(`${destino.directorio}/entorno.json`, 'utf8'));
    assert.equal(manifiesto.id, destino.id); assert.equal(manifiesto.base, destino.base);
    assert.equal(manifiesto.nombre, destino.nombre); assert.equal(manifiesto.fase, 'verificado');
    const ctx = JSON.parse(cli(['context', 'inspect', 'desktop-linux']))[0];
    assert.equal(ctx.Endpoints.docker.Host, 'unix:///Users/baldo/.docker/run/docker.sock');
    const inspeccion = JSON.parse(cli(['container', 'inspect', destino.id, '--format',
      '{"id":{{json .Id}},"estado":{{json .State.Status}},"etiquetas":{{json .Config.Labels}},"puertos":{{json .HostConfig.PortBindings}}}']));
    assert.equal(inspeccion.id, destino.id); assert.equal(inspeccion.estado, 'running');
    assert.equal(inspeccion.etiquetas['ecotrack.entorno'], 'pruebas-322');
    assert.equal(inspeccion.etiquetas['ecotrack.sesion'], destino.nombre);
    assert.deepEqual(inspeccion.puertos['27017/tcp'], [{ HostIp: destino.host, HostPort: String(destino.puerto) }]);
    const claves = JSON.parse(fs.readFileSync(`${destino.directorio}/credenciales.json`, 'utf8'));
    const principal = await abrir(claves.aplicacion);
    const estadoAuth = await principal.connection.db.command({ connectionStatus: 1 });
    assert.deepEqual(estadoAuth.authInfo.authenticatedUsers, [{ user: 'ecotrack_pruebas', db: destino.base }]);
    assert.deepEqual(estadoAuth.authInfo.authenticatedUserRoles, [{ role: 'readWrite', db: destino.base }]);
    const indices = await principal.connection.db.collection('domiciliociudadanos').indexes();
    assert.ok(indices.some(i => i.unique === true && i.sparse !== true && !i.partialFilterExpression &&
      Object.keys(i.key).length === 1 && i.key.ciudadano_id_clerk === 1));
    const cantidadInicial = await principal.connection.db.collection('domiciliociudadanos').countDocuments({});
    precondiciones = true;
    console.log(JSON.stringify({ preflight: 'aprobado', base: destino.base, contenedor: destino.id,
      conexion: 'loopback_exclusivo', usuario: 'limitado', indice_unico: true, documentos_iniciales: cantidadInicial }));

    const carga = loader(principal);
    const Modelo = carga('src/modelos/DomicilioCiudadano.ts').ModeloDomicilioCiudadano;
    const otro = await abrir(claves.aplicacion);
    const ModeloB = loader(otro)('src/modelos/DomicilioCiudadano.ts').ModeloDomicilioCiudadano;
    const identidades = new Map();
    const cargaHttp = loader(principal, identidades);
    const Usuarios = cargaHttp('src/modelos/Usuario.ts').ModeloUsuario;
    const Bloqueos = cargaHttp('src/modelos/BloqueoAdministrativo.ts').ModeloBloqueoAdministrativo;
    // Colecciones nuevas de soporte dentro de la misma BD autorizada, sin borrar nada.
    const existentes = (await principal.connection.db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name);
    for (const modelo of [Usuarios, Bloqueos]) {
      if (!existentes.includes(modelo.collection.name)) await principal.connection.db.createCollection(modelo.collection.name);
    }
    async function actor(sufijo, opciones = {}) {
      const id = prefijo + sufijo, u = ficticio(id, opciones.rol || 'ciudadano');
      if (opciones.verificado === false) u.emailAddresses[0].verification.status = 'unverified';
      identidades.set(id, u);
      await new Usuarios({ id_clerk: id, nombre_completo: 'Identidad ficticia', correo_electronico: u.emailAddresses[0].emailAddress,
        rol: opciones.rol || 'ciudadano', activo: opciones.activo !== false }).save();
      return id;
    }
    const ruta = cargaHttp('src/app/api/ciudadano/domicilio/route.ts');
    const rutaSinConexion = loader(principal, identidades, { conexionRechazada: true })('src/app/api/ciudadano/domicilio/route.ts');
    servidor = http.createServer((req, res) => {
      const id = typeof req.headers['x-ecotrack-test-actor'] === 'string' ? req.headers['x-ecotrack-test-actor'] : null;
      contexto.run({ id }, async () => {
        try {
          const url = `http://127.0.0.1:${puertoHttp}${req.url}`;
          const peticion = new Request(url, { method: req.method, headers: req.headers,
            ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Readable.toWeb(req), duplex: 'half' }) });
          const modulo = req.headers['x-ecotrack-test-conexion'] === 'rechazada' ? rutaSinConexion : ruta;
          const respuesta = await modulo[req.method](peticion);
          if (req.headers['x-ecotrack-test-cortar-http'] === 'despues' && id?.startsWith(prefijo) && respuesta.status === 201) { res.destroy(); return; }
          res.writeHead(respuesta.status, Object.fromEntries(respuesta.headers));
          res.end(Buffer.from(await respuesta.arrayBuffer()));
        } catch { res.writeHead(500, { 'cache-control': 'private, no-store' }); res.end('{"exito":false}'); }
      });
    });
    await new Promise((resolve, reject) => { servidor.once('error', reject); servidor.listen(0, '127.0.0.1', resolve); });
    puertoHttp = servidor.address().port;
    async function solicitud(metodo, id, cuerpo, cabeceras = {}) {
      const r = await fetch(`http://127.0.0.1:${puertoHttp}/api/ciudadano/domicilio`, {
        method: metodo, headers: { 'content-type': 'application/json', ...(id ? { 'x-ecotrack-test-actor': id } : {}), ...cabeceras },
        ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
      });
      assert.equal(r.headers.get('cache-control'), 'private, no-store');
      return { status: r.status, body: await r.json() };
    }
    const entrada = { latitud: 20.06, longitud: -97.06, tipo_seleccion: 'manual', confirmada: true };

    const evidencias = [];
    const insertar = Modelo.collection.insertOne;
    const actualizar = Modelo.collection.updateOne;
    const buscar = Modelo.collection.findOne;
    const indicesOriginal = Modelo.collection.indexes;
    const ajeno = prefijo + 'centinela_otra_operacion';
    await Bloqueos.create({ _id: ajeno });
    async function conciliar(id, estadoEsperado) {
      // La solicitud y sus hooks ya finalizaron; clientes con retryWrites:false.
      const doc = await ModeloB.findOne({ ciudadano_id_clerk: id });
      assert.equal(!!doc, estadoEsperado);
      const clavesActor = [id, 'correo:' + identidades.get(id).emailAddresses[0].emailAddress.toLowerCase()];
      const locks = await Bloqueos.find({ _id: { $in: clavesActor } }).lean();
      assert.equal(locks.length, 2);
      assert.ok(locks.every(l => clavesActor.includes(l._id) && l.fecha_creacion instanceof Date));
      for (const l of locks) {
        const r = await Bloqueos.deleteOne({ _id: l._id, fecha_creacion: l.fecha_creacion });
        assert.equal(r.deletedCount, 1);
      }
      assert.equal(await Bloqueos.countDocuments({ _id: { $in: clavesActor } }), 0);
      assert.ok(await Bloqueos.findById(ajeno));
      evidencias.push({ caso: id.slice(prefijo.length), conciliado: true, bloqueos_retirados: locks.length,
        escritor_finalizado: true, estado_comprobado_independientemente: true, centinela_preservado: true });
    }
    await caso('nativo_http', '11000 real dentro de POST se traduce en 409', async () => {
      const id = await actor('duplicado'); let codigo;
      Modelo.collection.insertOne = async function(doc, ...args) {
        if (doc.ciudadano_id_clerk === id) {
          await new ModeloB(dato(id)).save();
          try { return await insertar.call(this, doc, ...args); }
          catch(e) { codigo = e.code; throw e; }
        }
        return insertar.call(this, doc, ...args);
      };
      try {
        const r = await solicitud('POST', id, entrada);
        assert.equal(codigo, 11000); assert.equal(r.status, 409);
        assert.equal(r.body.codigo, 'CONFLICTO_PERSISTENCIA');
        assert.equal(await ModeloB.countDocuments({ ciudadano_id_clerk: id }), 1);
        assert.equal(await Bloqueos.countDocuments({ _id: id }), 0);
        return { nativo: 11000, http: 409 };
      } finally { Modelo.collection.insertOne = insertar; }
    });
    await caso('nativo_http', 'VersionError real dentro de PUT se traduce en 409', async () => {
      const id = await actor('version'); await new ModeloB(dato(id)).save(); let conflicto = false, errorNativo;
      const guardarOriginal = Modelo.prototype.save;
      Modelo.prototype.save = async function(...args) { try { return await guardarOriginal.apply(this,args); } catch(e) { if(this.ciudadano_id_clerk === id) errorNativo=e.name; throw e; } };
      Modelo.collection.updateOne = async function(filtro, ...args) {
        if (filtro.ciudadano_id_clerk === id) {
          const externo = await ModeloB.findOne({ ciudadano_id_clerk: id });
          externo.tipo_seleccion = 'gps'; await externo.save();
        }
        const r = await actualizar.call(this, filtro, ...args);
        if (filtro.ciudadano_id_clerk === id) conflicto = r.matchedCount === 0;
        return r;
      };
      try {
        const r = await solicitud('PUT', id, { ...entrada, version: 0 });
        assert.ok(conflicto); assert.equal(errorNativo, 'VersionError'); assert.equal(r.status, 409); assert.equal(r.body.codigo, 'CONFLICTO_PERSISTENCIA');
        const final = await ModeloB.findOne({ ciudadano_id_clerk: id });
        assert.equal(final.version, 1); assert.equal(final.tipo_seleccion, 'gps');
        assert.equal(await Bloqueos.countDocuments({ _id: id }), 0);
        return { matchedCount: 0, http: 409, version_final: 1 };
      } finally { Modelo.collection.updateOne = actualizar; Modelo.prototype.save = guardarOriginal; }
    });
    await caso('contencion', 'Segunda solicitud rechazada mientras primera mantiene bloqueo', async () => {
      const id = await actor('contencion'); let soltar, avisar;
      const retenida = new Promise(r => { soltar = r; });
      const preparada = new Promise(r => { avisar = r; });
      Modelo.collection.insertOne = async function(doc, ...args) {
        if (doc.ciudadano_id_clerk === id) { avisar(); await retenida; }
        return insertar.call(this, doc, ...args);
      };
      const primera = solicitud('POST', id, entrada);
      try {
        await Promise.race([preparada, new Promise((_,r) => setTimeout(() => r(Error('BARRERA_TIMEOUT')), 5000))]);
        assert.ok(await Bloqueos.findById(id));
        const segunda = await solicitud('POST', id, entrada);
        assert.equal(segunda.status, 409); assert.ok(await Bloqueos.findById(id));
        assert.equal(await ModeloB.countDocuments({ ciudadano_id_clerk: id }), 0);
        soltar(); assert.equal((await primera).status, 201);
        assert.equal(await Bloqueos.countDocuments({ _id: id }), 0);
        assert.ok(await Bloqueos.findById(ajeno));
      } finally { soltar(); await primera; Modelo.collection.insertOne = insertar; }
    });
    await caso('fallo_simulado', 'Fallo de preparación devuelve 503 sin escritura ni bloqueo huérfano', async () => {
      const id = await actor('preparacion');
      Modelo.collection.indexes = async () => { throw Error('FALLO_PREPARACION_CONTROLADO'); };
      try {
        const r = await solicitud('POST', id, entrada); assert.equal(r.status, 503);
        assert.equal(await ModeloB.countDocuments({ ciudadano_id_clerk: id }), 0);
        assert.equal(await Bloqueos.countDocuments({ _id: id }), 0);
      } finally { Modelo.collection.indexes = indicesOriginal; }
    });
    await caso('fallo_simulado', 'Escritor iniciado sin enviar operación: 503 y conciliación conservadora', async () => {
      const id = await actor('antesInsert');
      Modelo.collection.insertOne = async function(doc, ...args) {
        if (doc.ciudadano_id_clerk === id) throw Error('ANTES_DE_ENVIAR');
        return insertar.call(this, doc, ...args);
      };
      try {
        const r = await solicitud('POST', id, entrada); assert.equal(r.status, 503);
        assert.equal(await ModeloB.countDocuments({ ciudadano_id_clerk: id }), 0);
        assert.equal((await solicitud('GET', id)).status, 409);
        await conciliar(id, false);
        assert.equal((await solicitud('GET', id)).status, 200);
      } finally { Modelo.collection.insertOne = insertar; }
    });
    await caso('fallo_simulado', 'Escritura real aplicada y error simulado al devolver confirmación', async () => {
      const id = await actor('despuesInsert');
      Modelo.collection.insertOne = async function(doc, ...args) {
        const r = await insertar.call(this, doc, ...args);
        if (doc.ciudadano_id_clerk === id) throw Error('CONFIRMACION_OCULTADA_EN_HOOK');
        return r;
      };
      try {
        const r = await solicitud('POST', id, entrada); assert.equal(r.status, 503);
        assert.equal(await ModeloB.countDocuments({ ciudadano_id_clerk: id }), 1);
        assert.equal((await solicitud('GET', id)).status, 409);
        await conciliar(id, true);
        assert.equal((await solicitud('GET', id)).status, 200);
        return { escritura_mongo: 'real', perdida_confirmacion: 'simulada_en_hook_no_red', http: 503 };
      } finally { Modelo.collection.insertOne = insertar; }
    });
    await caso('fallo_simulado', 'Fallo previo al escritor mediante conector rechazado', async () => {
      const id = await actor('conector');
      const r = await solicitud('POST', id, entrada, { 'x-ecotrack-test-conexion': 'rechazada' });
      assert.equal(r.status, 503); assert.equal(await ModeloB.countDocuments({ ciudadano_id_clerk: id }), 0);
      assert.equal(await Bloqueos.countDocuments({ _id: id }), 0);
    });
    await caso('red_http_real', 'Respuesta HTTP cortada después de escritura confirmada', async () => {
      const id = await actor('respuestaPerdida');
      await assert.rejects(solicitud('POST', id, entrada, { 'x-ecotrack-test-cortar-http': 'despues' }));
      assert.equal(await ModeloB.countDocuments({ ciudadano_id_clerk: id }), 1);
      assert.equal(await Bloqueos.countDocuments({ _id: id }), 0);
      assert.equal((await solicitud('GET', id)).status, 200);
      assert.equal((await solicitud('POST', id, entrada)).status, 409);
      return { resultado_http: 'sin_respuesta_socket_cerrado', escritura_confirmada: true, recuperacion: 'GET_200_sin_desbloqueo' };
    });
    // El centinela es fixture de esta ejecución, no un bloqueo ajeno real. Solo retirarlo tras todas las solicitudes.
    assert.ok(await Bloqueos.findById(ajeno));
    const centinela = await Bloqueos.findById(ajeno).lean();
    await Bloqueos.deleteOne({ _id: ajeno, fecha_creacion: centinela.fecha_creacion });
    const clavesLocales = [...identidades.values()].flatMap(u => [u.id, ...u.emailAddresses.map(e => 'correo:' + e.emailAddress.toLowerCase())]);
    const resumen = { total: resultados.length, aprobadas: resultados.filter(r => r.estado === 'aprobada').length,
      fallidas: resultados.filter(r => r.estado === 'fallida').length, resultados, conciliaciones: evidencias,
      prefijo_ficticio: prefijo, bloqueos_propios_pendientes: await Bloqueos.countDocuments({ _id: { $in: clavesLocales } }),
      documentos_propios: await ModeloB.countDocuments({ ciudadano_id_clerk: { $regex: '^' + prefijo } }),
      proxy_tcp: 'no_ejecutado_no_identificacion_wire_validada', respuesta_http_perdida: 'corte_real_solo_socket_http_del_caso' };
    const archivo = path.join(destino.directorio, 'resultado-325-' + Date.now() + '.json');
    fs.writeFileSync(archivo, JSON.stringify(resumen, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ resumen, evidencia: archivo }));
    if (resumen.fallidas) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ejecucion: 'detenida', precondiciones, tipo: error.name,
      red_rechazada: redRechazada,
      codigo: typeof error.code === 'number' ? error.code : undefined }));
    process.exitCode = 1;
  } finally {
    if (servidor?.listening) await new Promise(resolve => servidor.close(resolve));
    await Promise.all(conexiones.map(m => m.disconnect().catch(() => {})));
    net.Socket.prototype.connect = conectarOriginal;
  }
})();
