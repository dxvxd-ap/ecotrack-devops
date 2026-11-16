const { test } = require('node:test');
const assert = require('node:assert/strict');
const { entorno } = require('./helpers/entorno.cjs');
const nuevaRuta = { id_ruta: 'R1', nombre: 'Ruta prueba', trazado_geojson: { type: 'LineString', coordinates: [[-97,20],[-97,21]] } };
const reclamo = { ciudadano_telefono: '1234567890', domicilio_referencia: 'Referencia', latitud: 20, longitud: -97, descripcion: 'Prueba' };
const propio = '000000000000000000000001', ajeno = '000000000000000000000002';
function preparar(rol = 'ciudadano') {
  const e = entorno(rol);
  e.state.reclamos = [
    {_id: propio, folio: 'PROPIO', ciudadano_id_clerk: e.actor.id, estado: 'PENDIENTE', ruta_id: 'R1'},
    {_id: ajeno, folio: 'AJENO', ciudadano_id_clerk: e.target.id, estado: 'PENDIENTE', ruta_id: 'R1'},
    {_id: '000000000000000000000003', folio: 'HISTORICO', ciudadano_email: e.actor.emailAddresses[0].emailAddress},
  ];
  return e;
}
test('GET rutas permanece público en handler y middleware', async () => {
  const e = preparar(); e.state.sesion = null;
  e.state.rutas = [{...nuevaRuta, activa:true}, {...nuevaRuta, activa:false}];
  const r = await e.call('rutas','GET'); assert.equal(r.status,200);
  assert.equal((await r.json()).datos.length,1);
  assert.equal((await e.middle('rutas','GET')).status,200);
  assert.equal(e.state.writes.length,0);
});
for (const rol of [null, 'ciudadano', 'conductor', 'secretario', 'moderador', 'camion', 'desconocido']) {
  for (const method of ['POST','PUT','DELETE']) test(`${rol || 'anónimo'} no escribe rutas: ${method}`, async () => {
    const e = preparar(rol || 'ciudadano'); if (!rol) e.state.sesion = null;
    const body = method === 'POST' ? nuevaRuta : method === 'PUT' ? {id_ruta:'R1',nombre:'Cambio'} : undefined;
    const r = await e.call('rutas',method,body,'?id=R1');
    assert.equal(r.status,rol ? 403 : 401); assert.equal(e.state.writes.length,0);
    assert.equal((await e.middle('rutas',method)).status,rol ? 403 : 401);
  });
}
for (const rol of ['admin','superadmin']) for (const method of ['POST','PUT','DELETE']) test(`${rol} puede ${method} rutas`, async () => {
  const e = preparar(rol); e.state.local.rutas = [{...nuevaRuta,_id:'R1'}];
  e.state.rutas = [{...nuevaRuta,_id:'R1',activa:true}];
  const body = method === 'POST' ? nuevaRuta : method === 'PUT' ? {id_ruta:'R1',nombre:'Cambio'} : undefined;
  assert.equal((await e.call('rutas',method,body,'?id=R1')).status,200);
  assert.ok(e.state.writes.length > 0);
  assert.equal((await e.middle('rutas',method)).status,200);
});
for (const method of ['GET','POST']) test(`reclamos ${method} sin sesión devuelve 401`, async () => {
  const e = preparar(); e.state.sesion = null;
  assert.equal((await e.call('v1/reclamos',method,method==='POST'?reclamo:undefined)).status,401);
  assert.equal(e.state.queries.length,0); assert.equal(e.state.writes.length,0);
});
test('ciudadano recibe solo propios con filtro Mongo, incluso históricos con su correo', async () => {
  const e = preparar(); const antes = structuredClone(e.state.reclamos);
  const r = await e.call('v1/reclamos','GET'); assert.equal(r.status,200);
  assert.deepEqual((await r.json()).datos.map(d=>d.folio),['PROPIO']);
  assert.equal(e.state.queries[0][1].ciudadano_id_clerk,e.actor.id);
  assert.deepEqual(e.state.reclamos,antes); assert.equal(e.state.writes.length,0);
});
for (const query of [`?id=${ajeno}`,`?_id=${ajeno}`,'?folio=AJENO']) test(`identificador ajeno no permite lectura: ${query}`,async()=>{
  const e=preparar(); const r=await e.call('v1/reclamos','GET',undefined,query);
  assert.equal(r.status,200); assert.deepEqual((await r.json()).datos,[]);
  assert.equal(e.state.queries[0][1].ciudadano_id_clerk,e.actor.id);
});
test('filtros de estado y ruta conservan propiedad',async()=>{
  const e=preparar(); const r=await e.call('v1/reclamos','GET',undefined,'?estado=PENDIENTE&ruta_id=R1&ciudadano_id_clerk=user_target');
  assert.deepEqual((await r.json()).datos.map(d=>d.folio),['PROPIO']);
  assert.deepEqual(e.state.queries[0][1],{ciudadano_id_clerk:e.actor.id,estado:'PENDIENTE',ruta_id:'R1'});
});
for (const rol of ['admin','superadmin']) test(`${rol} conserva históricos y consulta por identificador`,async()=>{
  const e=preparar(rol); const antes=structuredClone(e.state.reclamos);
  const r=await e.call('v1/reclamos','GET'); assert.equal(r.status,200);
  assert.equal((await r.json()).datos.length,3);
  const directo=await e.call('v1/reclamos','GET',undefined,'?folio=HISTORICO');
  assert.deepEqual((await directo.json()).datos.map(d=>d.folio),['HISTORICO']);
  assert.deepEqual(e.state.reclamos,antes); assert.equal(e.state.writes.length,0);
});
for (const rol of ['conductor','secretario','moderador','camion','desconocido']) test(`${rol} no accede a reclamos`,async()=>{
  const e=preparar(rol);
  for (const method of ['GET','POST']) assert.equal((await e.call('v1/reclamos',method,method==='POST'?reclamo:undefined)).status,403);
  assert.equal(e.state.writes.length,0); assert.equal(e.state.queries.length,0);
});
test('POST obtiene propietario, nombre y correo de Clerk e ignora privilegios enviados',async()=>{
  const e=preparar(); const r=await e.call('v1/reclamos','POST',{...reclamo,ciudadano_nombre:'Suplantado',ciudadano_email:'ajeno@example.test',rol:'superadmin',activo:true});
  assert.equal(r.status,200); const d=(await r.json()).datos;
  assert.equal(d.ciudadano_id_clerk,e.actor.id); assert.equal(d.ciudadano_nombre,'Nombre Prueba');
  assert.equal(d.ciudadano_email,e.actor.emailAddresses[0].emailAddress); assert.equal(d.rol,undefined);
  assert.equal(e.actor.publicMetadata.rol,'ciudadano');
});
for (const id of ['user_target','user_actor',null,{$ne:null}]) test(`rechaza propietario explícito ${JSON.stringify(id)}`,async()=>{
  const e=preparar(); const r=await e.call('v1/reclamos','POST',{...reclamo,ciudadano_nombre:'Nombre cliente',ciudadano_id_clerk:id});
  assert.equal(r.status,400); assert.equal(e.state.writes.length,0);
});
for (const causa of ['mongo','clerk','banned','locked','metadata','divergente','bloqueo']) test(`cuenta restringida (${causa}) no accede a rutas ni reclamos`,async()=>{
  for (const [endpoint,method,body] of [['rutas','POST',nuevaRuta],['v1/reclamos','GET'],['v1/reclamos','POST',reclamo]]) {
    const e=preparar('admin');
    if(causa==='mongo') e.state.mongoUsers.push({id_clerk:e.actor.id,rol:'admin',activo:false});
    if(causa==='clerk') e.state.failClerk=true;
    if(causa==='banned') e.actor.banned=true;
    if(causa==='locked') e.actor.locked=true;
    if(causa==='metadata') e.actor.publicMetadata.activo=false;
    if(causa==='divergente') e.state.mongoUsers.push({id_clerk:e.actor.id,rol:'ciudadano',activo:true});
    if(causa==='bloqueo') e.state.locks.add(e.actor.id);
    const r=await e.call(endpoint,method,body);
    assert.equal(r.status,causa==='clerk'?503:causa==='bloqueo'?409:403);
    assert.equal(e.state.writes.length,0); assert.equal(e.state.queries.length,0);
  }
});
test('fallo Mongo en reclamos devuelve error genérico sin datos internos',async()=>{
  const e=preparar(); e.state.failDB=true; const r=await e.call('v1/reclamos','GET');
  assert.equal(r.status,503); const b=await r.json(); assert.equal(b.exito,false);
  assert.equal(JSON.stringify(b).includes('BD no disponible'),false);
});
test('sincronizar ignora elevación en cuerpo y metadatos editables del ciudadano',async()=>{
  const e=preparar(); e.actor.unsafeMetadata={rol:'superadmin',acceso_dashboard:true};
  const r=await e.call('autenticacion/sincronizar','POST',{rol:'superadmin',publicMetadata:{rol:'admin'},id_clerk:e.target.id});
  assert.equal(r.status,200); assert.equal((await r.json()).datos.rol,'ciudadano');
  assert.equal(e.actor.publicMetadata.rol,'ciudadano'); assert.equal(e.target.publicMetadata.rol,'ciudadano');
  assert.equal((await e.call('rutas','POST',nuevaRuta)).status,403);
});

test('modelo Mongoose admite históricos sin propietario y conserva propietario inmutable', async () => {
  const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
  const ts = require('typescript');
  const filename = path.resolve(__dirname, '../src/modelos/Reclamo.ts');
  const mod = new Module(filename, module); mod.filename=filename;
  mod.paths=Module._nodeModulePaths(path.dirname(filename));
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
  }).outputText,filename);
  const { ModeloReclamo }=mod.exports;
  const historico=new ModeloReclamo({folio:'HISTORICO',ciudadano_nombre:'Histórico',ciudadano_telefono:'123',
    domicilio_referencia:'Referencia',ubicacion:{type:'Point',coordinates:[-97,20]},descripcion:'Histórico'});
  await historico.validate();
  assert.equal(historico.ciudadano_id_clerk,undefined);
  assert.equal(Object.hasOwn(historico.toObject(),'ciudadano_id_clerk'),false);
  const persistido=ModeloReclamo.hydrate({...historico.toObject(),ciudadano_id_clerk:'user_actor'});
  persistido.ciudadano_id_clerk='user_target';
  assert.equal(persistido.ciudadano_id_clerk,'user_actor');
});
test('ciudadano consulta un identificador propio conservando filtros Mongo',async()=>{
  const e=preparar(); const r=await e.call('v1/reclamos','GET',undefined,`?id=${propio}`);
  assert.equal(r.status,200); assert.deepEqual((await r.json()).datos.map(d=>d.folio),['PROPIO']);
  assert.equal(e.state.queries[0][1]._id,propio);
});
test('correo sin verificar impide crear reclamo y no escribe',async()=>{
  const e=preparar(); e.actor.emailAddresses[0].verification.status='unverified';
  assert.equal((await e.call('v1/reclamos','POST',reclamo)).status,403);
  assert.equal(e.state.writes.length,0);
});
