// Ejecuta handlers reales; solo los límites externos se sustituyen en memoria.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

function usuario(id, rol, correo = `${id}@example.test`) {
  return { id, publicMetadata: { rol, dato_conservado: 'sí' },
    emailAddresses: [{ id: `email_${id}`, emailAddress: correo, verification: { status: 'verified' } }],
    primaryEmailAddressId: `email_${id}`, firstName: 'Nombre', lastName: 'Prueba',
    banned: false, locked: false, createdAt: 1 };
}

function entorno(rol = 'superadmin', opciones = {}) {
  const actor = usuario('user_actor', rol);
  const target = usuario('user_target', 'ciudadano');
  const state = { sesion: actor.id, users: [actor, target], local: { preasignaciones: [] },
    pre: [], mongoUsers: [], rutas: [], reclamos: [], queries: [], writes: [], locks: new Set(), failClerk: false, failDB: false, beforeUpdate: null, beforeFind: null, beforeConnect: null, failLocalRead: false, failLocalWrite: false };
  const users = {
    getUser: async id => { if (state.failClerk) throw Error('Clerk no disponible');
      const u = state.users.find(u => u.id === id); if (!u) throw Object.assign(Error('No existe'), { status: 404 }); return structuredClone(u); },
    getUserList: async (p = {}) => { if (state.failClerk) throw Error('Clerk no disponible');
      const data = state.users.filter(u => !p.emailAddress || u.emailAddresses.some(e => p.emailAddress.includes(e.emailAddress)));
      return { data: structuredClone(data), totalCount: data.length }; },
    updateUser: async (id, payload) => { if (state.failClerk) throw Error('Clerk no disponible');
      if (state.beforeUpdate) await state.beforeUpdate(id,payload);
      state.writes.push(['clerk:update', id, payload]); const u = state.users.find(u => u.id === id); Object.assign(u, payload); return u; },
    deleteUser: async id => { state.writes.push(['clerk:delete', id]); state.users = state.users.filter(u => u.id !== id); },
  };
  function match(u, q) { return Object.entries(q).every(([k,v]) => k === '$and' ? v.every(f => match(u,f)) : v && typeof v==='object' && '$exists' in v ? Object.hasOwn(u,k)===v.$exists : v && typeof v==='object' && '$eq' in v ? JSON.stringify(u[k])===JSON.stringify(v.$eq) : k === '$or' ? v.some(f => match(u,f)) : u[k] === v); }
  function modelo(key) { return {
    find: () => ({ sort: async () => [], then: (resolve, reject) => Promise.resolve(structuredClone(state[key])).then(resolve,reject) }),
    findOne: async q => { if(state.beforeFind) await state.beforeFind(key,q); return structuredClone(state[key].find(u => match(u,q)) || null); },
    findOneAndUpdate: async (q, update, opts) => {
      if (key==='mongoUsers' && state.failUserWrite) throw Error('Escritura Mongo fallida');
      state.writes.push([`${key}:update`, q, update]); let u = state[key].find(u => match(u,q));
      if (!u && opts?.upsert) state[key].push(u = { ...q, ...update.$setOnInsert });
      if (u) Object.assign(u, update.$set || update); return u || null;
    },
    deleteOne: async q => { state.writes.push([`${key}:delete`,q]); state[key] = state[key].filter(u => !match(u,q)); return { deletedCount: 1 }; },
    create: async data => { state.writes.push([`${key}:create`,data]); return data; },
  }; }
  // Sustituye únicamente MongoDB; conserva filtros y efectos de los handlers reales.
  function coleccion(key) { return {
    find: query => {
      state.queries.push([key, structuredClone(query)]);
      const data = state[key].filter(u => match(u, query));
      return { sort: () => ({
        then: (resolve, reject) => Promise.resolve(structuredClone(data)).then(resolve, reject),
        limit: async n => structuredClone(data.slice(0, n)),
      }) };
    },
    create: async data => { state.writes.push([key + ':create', structuredClone(data)]); state[key].push(structuredClone(data)); return data; },
    findOneAndUpdate: async (query, update) => {
      state.writes.push([key + ':update', query]); const doc = state[key].find(u => match(u, query));
      if (doc) Object.assign(doc, update.$set); return doc || null;
    },
    findByIdAndUpdate: async (id, update) => {
      state.writes.push([key + ':update', {_id: id}]); const doc = state[key].find(u => u._id === id);
      if (doc) Object.assign(doc, update); return doc || null;
    },
  }; }
  let middleware;
  const stubs = {
    '@clerk/backend': { createClerkClient: () => ({ users }) },
    '@clerk/nextjs/server': { currentUser: async () => structuredClone(state.users.find(u => u.id === state.sesion) || null), auth: async () => ({ userId: state.sesion }),
      clerkMiddleware: fn => { middleware = fn; return fn; },
      createRouteMatcher: patterns => req => patterns.some(p => new RegExp('^' + p + '$').test(new URL(req.url).pathname)) },
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init),
      next: () => new Response(null, {status: 200}), redirect: url => Response.redirect(url) } },
    '@/lib/inicializar_datos': { sembrar_datos_iniciales_si_esta_vacio: async () => { state.writes.push(['seed']); } }, '@/lib/base_datos': { conectar_base_datos: async () => { if (state.failDB) throw Error('BD no disponible'); if(state.beforeConnect) await state.beforeConnect(); } },
    '@/lib/almacen_local': { leer_almacen_local: () => { if(state.failLocalRead) throw Error('Lectura local fallida'); return structuredClone(state.local); },
      guardar_almacen_local: data => { if(state.failLocalWrite) throw Error('Escritura local fallida'); state.writes.push(['local:write']); state.local = structuredClone(data); } },
    '@/modelos/Ruta': { ModeloRuta: {
      ...coleccion('rutas'),
      findOne: q => ({ lean: async () => structuredClone(state.rutas.find(u => match(u,q)) || null) }),
      collection: { indexes: async () => [{ key: { id_ruta: 1 }, unique: true }] },
      create: async documentos => {
        const creados = documentos.map((d, i) => ({ ...structuredClone(d),
          _id: (state.rutas.length + i + 1).toString(16).padStart(24, '0') }));
        state.writes.push(['rutas:create', structuredClone(creados)]);
        state.rutas.push(...creados);
        return creados;
      },
    } },
    '@/modelos/Reclamo': { ModeloReclamo: coleccion('reclamos') },
    '@/modelos/Usuario': { ModeloUsuario: modelo('mongoUsers') },
    '@/modelos/PreasignacionUsuario': { ModeloPreasignacionUsuario: modelo('pre') },
    '@/modelos/Rol': { ModeloRol: modelo('pre') },
    '@/modelos/BloqueoAdministrativo': { ModeloBloqueoAdministrativo: {
      findOne: async ({_id}) => state.locks.has(_id) ? {_id} : null,
      create: async ({_id}) => { if (state.locks.has(_id)) throw Object.assign(Error('Bloqueado'),{code:11000}); state.locks.add(_id); if (state.afterLock) await state.afterLock(_id); },
      deleteOne: async ({_id}) => { state.locks.delete(_id); },
    } },
  };
  // Extensión explícita para sustituir transportes adicionales en pruebas aisladas.
  Object.assign(stubs, opciones.dependencias || {});
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file,module);
    const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{ module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }}).outputText;
    const req = name => {
      if (name === "node:fs" && opciones.fs) return opciones.fs;
      if (name === "node:path") return path;
      if (name === "@/lib/almacen_local" && opciones.almacenReal) return load(path.join(root,"src/lib/almacen_local.ts"));
      if (stubs[name]) return stubs[name];
      if (name.startsWith('@/')) return load(path.join(root,'src',name.slice(2)) + '.ts');
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file),name) + '.ts');
      throw Error(`Dependencia externa no permitida en prueba: ${name}`);
    };
    vm.runInNewContext('(function(require,module,exports){' + code + '\n})',
      { process: {env: opciones.env || {}, cwd: () => root}, console: opciones.console || {log(){},warn(){},error(){}}, Response, URL, Date, Set, Map, TextDecoder })(req,module,module.exports);
    return module.exports;
  }
  return { state, actor, target, load,
    async call(endpoint, method, body, query = '') {
      const mod = load(path.join(root,'src/app/api',endpoint,'route.ts'));
      return mod[method](new Request(`http://localhost/api/${endpoint}${query}`, {
        method, ...(body === undefined ? {} : {body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}) }));
    },
    async middle(endpoint, method) {
      load(path.join(root,'src/middleware.ts'));
      return middleware(async () => ({userId:state.sesion,sessionClaims:{metadata:{rol:'superadmin'}}}),
        new Request(`http://localhost/api/${endpoint}`,{method}));
    },
  };
}

module.exports={entorno,usuario};
