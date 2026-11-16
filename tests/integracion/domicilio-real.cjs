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
const prefijo = `user_it323_${crypto.randomBytes(5).toString('hex')}_`;
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
    assert.equal(Modelo.collection.name, 'domiciliociudadanos');
    const otro = await abrir(claves.aplicacion);
    const ModeloB = loader(otro)('src/modelos/DomicilioCiudadano.ts').ModeloDomicilioCiudadano;
    const servicio = carga('src/lib/domicilio_ciudadano.ts');

    await caso('mongo', 'Creación y lectura persistidas desde conexión independiente', async () => {
      const id = prefijo + 'crear'; await new Modelo(dato(id)).save();
      const leido = await ModeloB.findOne({ ciudadano_id_clerk: id });
      assert.ok(leido); assert.equal(leido.version, 0); assert.equal(leido.tipo_seleccion, 'manual');
      assert.equal(leido.asignacion.estado, 'pendiente'); assert.equal(leido.asignacion.ruta_id, null);
      assert.deepEqual(Array.from(leido.ubicacion.coordinates), [-97.01, 20.01]);
      return { documentos: await ModeloB.countDocuments({ ciudadano_id_clerk: id }), version: leido.version };
    });
    await caso('mongo', 'Rechazo real de duplicado con código 11000', async () => {
      const id = prefijo + 'duplicado'; await new Modelo(dato(id)).save();
      await assert.rejects(new ModeloB(dato(id)).save(), e => e.code === 11000);
      assert.equal(await Modelo.countDocuments({ ciudadano_id_clerk: id }), 1);
      return { codigo: 11000, documentos_finales: 1 };
    });
    await caso('mongo', 'Actualización manual a GPS con versión correcta', async () => {
      const id = prefijo + 'actualizar'; await new Modelo(dato(id)).save();
      const doc = await ModeloB.findOne({ ciudadano_id_clerk: id });
      doc.ubicacion = { type: 'Point', coordinates: [-97.02, 20.02] }; doc.tipo_seleccion = 'gps';
      await doc.save();
      const final = await Modelo.findOne({ ciudadano_id_clerk: id });
      assert.equal(final.version, 1); assert.equal(final.tipo_seleccion, 'gps');
      assert.equal(final.ciudadano_id_clerk, id); assert.deepEqual(Array.from(final.ubicacion.coordinates), [-97.02, 20.02]);
      return { version_final: final.version, seleccion: final.tipo_seleccion };
    });
    await caso('mongo', 'Cambiar propietario rechaza la escritura completa y conserva Mongo intacto', async () => {
      const id = prefijo + 'inmutable'; await new Modelo(dato(id)).save();
      const doc = await ModeloB.findOne({ ciudadano_id_clerk: id });
      doc.ciudadano_id_clerk = prefijo + 'ajeno';
      await assert.rejects(doc.save(), e => e.name === 'ValidationError' && Object.hasOwn(e.errors, 'ciudadano_id_clerk'));
      const final = await Modelo.findOne({ ciudadano_id_clerk: id });
      assert.equal(final.ciudadano_id_clerk, id); assert.equal(final.version, 0);
      assert.equal(await Modelo.countDocuments({ ciudadano_id_clerk: prefijo + 'ajeno' }), 0);
    });
    await caso('mongo', 'Coordenadas inválidas no llegan al servidor', async () => {
      for (const [n, coordinates] of [null, [NaN, 20], [-97, Infinity], ['-97', 20], [0, 91], [181, 0], [0], [0, 0, 0]].entries()) {
        const id = prefijo + 'invalido' + n;
        await assert.rejects(new Modelo(dato(id, { ubicacion: { type: 'Point', coordinates } })).save());
        assert.equal(await ModeloB.countDocuments({ ciudadano_id_clerk: id }), 0);
      }
      return { rechazadas: 8, documentos: 0 };
    });
    await caso('mongo', 'Separación de documentos entre propietarios', async () => {
      const a = prefijo + 'propA', b = prefijo + 'propB';
      await new Modelo(dato(a)).save(); await new ModeloB(dato(b)).save();
      const da = await Modelo.findOne({ ciudadano_id_clerk: a });
      const db = await ModeloB.findOne({ ciudadano_id_clerk: b });
      assert.notEqual(String(da._id), String(db._id)); assert.equal(da.ciudadano_id_clerk, a); assert.equal(db.ciudadano_id_clerk, b);
    });
    await caso('concurrencia_mongo', 'Dos inserciones simultáneas desde clientes independientes', async () => {
      const id = prefijo + 'carreraAlta';
      const rs = await Promise.allSettled([new Modelo(dato(id)).save(), new ModeloB(dato(id)).save()]);
      assert.equal(rs.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(rs.find(r => r.status === 'rejected').reason.code, 11000);
      assert.equal(await Modelo.countDocuments({ ciudadano_id_clerk: id }), 1);
      return { exitos: 1, duplicados: 1, documentos_finales: 1 };
    });
    await caso('concurrencia_mongo', 'Dos actualizaciones de versión cero: un ganador y un VersionError', async () => {
      const id = prefijo + 'carreraEdicion'; await new Modelo(dato(id)).save();
      const [a, b] = await Promise.all([Modelo.findOne({ ciudadano_id_clerk: id }), ModeloB.findOne({ ciudadano_id_clerk: id })]);
      a.ubicacion = { type: 'Point', coordinates: [-97.03, 20.03] };
      b.ubicacion = { type: 'Point', coordinates: [-97.04, 20.04] };
      const rs = await Promise.allSettled([a.save(), b.save()]);
      assert.equal(rs.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(rs.find(r => r.status === 'rejected').reason.name, 'VersionError');
      const final = await Modelo.findOne({ ciudadano_id_clerk: id }); assert.equal(final.version, 1);
      const ganador = rs[0].status === 'fulfilled' ? [-97.03, 20.03] : [-97.04, 20.04];
      assert.deepEqual(Array.from(final.ubicacion.coordinates), ganador);
      return { exitos: 1, version_errors: 1, version_final: final.version };
    });
    await caso('servicio', 'Contrato de actualización obsoleta y estado pendiente atómicos', async () => {
      const id = prefijo + 'servicio';
      const entrada = { latitud: 20.05, longitud: -97.05, tipo_seleccion: 'manual', confirmada: true };
      await (await servicio.preparar_guardado_domicilio(id, entrada, false))();
      const final = await (await servicio.preparar_guardado_domicilio(id, { ...entrada, tipo_seleccion: 'gps', version: 0 }, true))();
      assert.equal(final.version, 1); assert.equal(final.asignacion.estado, 'pendiente');
      await assert.rejects(servicio.preparar_guardado_domicilio(id, { ...entrada, version: 0 }, true), e => e.status === 409);
      assert.equal((await ModeloB.findOne({ ciudadano_id_clerk: id })).version, 1);
    });
    await caso('servicio', 'Documento final sin coordenadas históricas ni campos extra', async () => {
      const doc = await Modelo.collection.findOne({ ciudadano_id_clerk: prefijo + 'servicio' });
      assert.deepEqual(Object.keys(doc).sort(), ['_id', 'ciudadano_id_clerk', 'ubicacion', 'tipo_seleccion', 'fecha_confirmacion', 'fecha_creacion', 'fecha_actualizacion', 'version', 'asignacion'].sort());
      assert.deepEqual(Object.keys(doc.ubicacion).sort(), ['coordinates', 'type']);
      assert.equal(doc.ubicacion.coordinates.length, 2);
      const colecciones = await principal.connection.db.listCollections({}, { nameOnly: true }).toArray();
      assert.equal(colecciones.some(x => /historial.*domicilio/i.test(x.name)), false);
    });
    await caso('fallo_controlado', 'Credenciales ficticias erróneas rechazadas por Mongo real', async () => {
      const mal = new mongoose.mongo.MongoClient('mongodb://127.0.0.1:27018', { dbName: destino.base,
        authSource: destino.base, auth: { username: 'ecotrack_pruebas', password: crypto.randomBytes(24).toString('hex') },
        directConnection: true, serverSelectionTimeoutMS: 1000 });
      try { await assert.rejects(mal.connect(), e => e.code === 18); }
      finally { await mal.close(); }
    });

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
    await caso('http_clerk_simulado', 'GET sin sesión devuelve 401', async () => { assert.equal((await solicitud('GET')).status, 401); });
    for (const [nombre, opciones] of [['inactivo', { activo: false }], ['admin', { rol: 'admin' }], ['sinVerificar', { verificado: false }]]) {
      await caso('http_clerk_simulado', `Cuenta ${nombre} rechazada con 403`, async () => {
        const id = await actor('http' + nombre, opciones); assert.equal((await solicitud('POST', id, entrada)).status, 403);
        assert.equal(await Modelo.countDocuments({ ciudadano_id_clerk: id }), 0);
      });
    }
    await caso('http_clerk_simulado', 'GET null, POST 201, GET 200 y PUT 200 persistidos en Mongo', async () => {
      const id = await actor('httpFlujo');
      const inicial = await solicitud('GET', id); assert.equal(inicial.status, 200); assert.equal(inicial.body.datos, null);
      const creada = await solicitud('POST', id, entrada); assert.equal(creada.status, 201); assert.equal(creada.body.datos.version, 0);
      const actualizada = await solicitud('PUT', id, { ...entrada, tipo_seleccion: 'gps', version: 0 });
      assert.equal(actualizada.status, 200); assert.equal(actualizada.body.datos.version, 1);
      const lectura = await solicitud('GET', id); assert.equal(lectura.status, 200); assert.equal(lectura.body.datos.tipo_seleccion, 'gps');
      assert.equal(Object.hasOwn(lectura.body.datos, 'ciudadano_id_clerk'), false);
      assert.equal((await ModeloB.findOne({ ciudadano_id_clerk: id })).version, 1);
      const otroId = await actor('httpOtro'); assert.equal((await solicitud('GET', otroId)).body.datos, null);
      assert.equal(await Bloqueos.countDocuments({ _id: id }), 0);
      return { codigos: [200, 201, 200, 200], version_final: 1 };
    });
    await caso('http_clerk_simulado', 'POST duplicado y PUT obsoleto devuelven 409 sin cambiar Mongo', async () => {
      const id = await actor('httpConflictos'); assert.equal((await solicitud('POST', id, entrada)).status, 201);
      assert.equal((await solicitud('POST', id, entrada)).status, 409);
      assert.equal((await solicitud('PUT', id, { ...entrada, version: 7 })).status, 409);
      assert.equal((await ModeloB.findOne({ ciudadano_id_clerk: id })).version, 0);
    });
    await caso('http_clerk_simulado', '400 por coordenadas inválidas y propietario enviado por cliente', async () => {
      const id = await actor('httpInvalidos');
      for (const cambios of [{ latitud: 91 }, { longitud: null }, { ciudadano_id_clerk: prefijo + 'ajeno' }, { asignacion: { estado: 'asignada' } }]) {
        assert.equal((await solicitud('POST', id, { ...entrada, ...cambios })).status, 400);
      }
      assert.equal(await Modelo.countDocuments({ ciudadano_id_clerk: id }), 0);
    });
    await caso('http_clerk_simulado', '503 por conector rechazado solo en adaptador de pruebas', async () => {
      const id = await actor('httpSinConexion');
      const r = await solicitud('POST', id, entrada, { 'x-ecotrack-test-conexion': 'rechazada' });
      assert.equal(r.status, 503); assert.equal(r.body.exito, false);
      assert.equal(await Modelo.countDocuments({ ciudadano_id_clerk: id }), 0);
      return { codigo: 503, origen_fallo: 'simulado_en_conector_no_caida_real_de_mongo' };
    });
    await caso('http_concurrencia', 'Dos POST HTTP simultáneos: 201 y 409 con bloqueo Mongo real', async () => {
      const id = await actor('httpCarreraAlta');
      const rs = await Promise.all([solicitud('POST', id, entrada), solicitud('POST', id, entrada)]);
      assert.deepEqual(rs.map(r => r.status).sort(), [201, 409]);
      assert.equal(await ModeloB.countDocuments({ ciudadano_id_clerk: id }), 1);
      assert.equal(await Bloqueos.countDocuments({ _id: id }), 0);
      return { codigos: [201, 409], documentos_finales: 1 };
    });
    await caso('http_concurrencia', 'Dos PUT HTTP de misma versión: 200 y 409; un incremento', async () => {
      const id = await actor('httpCarreraPut'); assert.equal((await solicitud('POST', id, entrada)).status, 201);
      const rs = await Promise.all([solicitud('PUT', id, { ...entrada, version: 0 }),
        solicitud('PUT', id, { ...entrada, latitud: 20.07, version: 0 })]);
      assert.deepEqual(rs.map(r => r.status).sort(), [200, 409]);
      const final = await ModeloB.findOne({ ciudadano_id_clerk: id }); assert.equal(final.version, 1);
      assert.equal(final.asignacion.estado, 'pendiente');
      assert.equal(await Bloqueos.countDocuments({ _id: id }), 0);
      return { codigos: [200, 409], version_final: 1 };
    });

    const documentos = await Modelo.collection.find({ ciudadano_id_clerk: { $regex: '^' + prefijo } }).toArray();
    const resumen = { preflight: 'aprobado', prefijo_ficticio: prefijo,
      total: resultados.length, aprobadas: resultados.filter(r => r.estado === 'aprobada').length,
      fallidas: resultados.filter(r => r.estado === 'fallida').length,
      documentos_ficticios: documentos.length,
      duplicados: (await Modelo.aggregate([{ $group: { _id: '$ciudadano_id_clerk', cantidad: { $sum: 1 } } }, { $match: { cantidad: { $gt: 1 } } }])).length,
      bloqueos_pendientes: await Bloqueos.countDocuments({}),
      todas_asignaciones_pendientes: documentos.every(d => d.asignacion.estado === 'pendiente' && d.asignacion.ruta_id === null),
      resultados, http: { adaptador: 'node_http_loopback_Request_NextResponse_handlers_reales', clerk: 'simulado_solo_en_loader', autenticacion_real: false },
      pendientes: ['fallo_de_red_antes_despues_de_ack', 'escritura_real_de_resultado_incierto', 'Next_middleware_completo_y_Clerk_real'],
    };
    const salida = path.join(destino.directorio, `resultado-323-${Date.now()}.json`);
    fs.writeFileSync(salida, JSON.stringify(resumen, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ resumen: { ...resumen, resultados: undefined }, evidencia: salida }));
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
