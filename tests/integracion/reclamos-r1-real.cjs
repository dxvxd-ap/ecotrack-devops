'use strict';
// Opt-in: URI loopback validada. No .env, auth externa ni base_datos.ts.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),mongoose=require('mongoose');
const {entorno}=require('../helpers/entorno.cjs');
const {validarDestino,main}=require('../../scripts/preparar-reclamos-r1.cjs');
const d=validarDestino(process.argv.find(x=>x.startsWith('--uri='))?.slice(6));
test('R1 con índice y colección Mongo reales en replica set aislado',async t=>{
 const aislado=new mongoose.Mongoose({autoIndex:false,autoCreate:false,bufferCommands:false});
 await aislado.connect(d.uri,{directConnection:true,serverSelectionTimeoutMS:3000});t.after(()=>aislado.disconnect());
 const archivo=path.resolve(__dirname,'../../src/modelos/Reclamo.ts'),m=new Module(archivo,module);m.filename=archivo;m.paths=Module._nodeModulePaths(path.dirname(archivo));const req=m.require.bind(m);m.require=n=>n==='mongoose'?aislado:req(n);
 m._compile(ts.transpileModule(fs.readFileSync(archivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,archivo);
 const Modelo=m.exports.ModeloReclamo,col=Modelo.collection;
 assert.equal(await col.countDocuments({}),0,'Requiere base ficticia vacía');
 const e=entorno('ciudadano',{dependencias:{'@/modelos/Reclamo':{ModeloReclamo:Modelo}}});
 for(const u of [e.actor,e.target])e.state.mongoUsers.push({id_clerk:u.id,correo_electronico:u.emailAddresses[0].emailAddress,rol:'ciudadano',activo:true});
 const h=e.load(path.resolve(__dirname,'../../src/app/api/v1/reclamos/route.ts'));
 const op=e.load(path.resolve(__dirname,'../../src/app/api/v1/reclamos/operaciones/[operacion_id]/route.ts'));
 const cuerpo={confirmada:true,domicilio_referencia:'Referencia ficticia',descripcion:'Basura ficticia de integración.',latitud:20,longitud:-97,tipo_incidencia:'OTRO'};
 const post=(id,body=cuerpo)=>h.POST(new Request('http://localhost/api/v1/reclamos',{method:'POST',headers:{'Content-Type':'application/json','EcoTrack-Contrato':'reclamos-r1','Idempotency-Key':id},body:JSON.stringify(body)}));
 const get=id=>op.GET(new Request('http://localhost/api/v1/reclamos/operaciones/'+id),{params:Promise.resolve({operacion_id:id})});
 await t.test('índice ausente bloquea y preparación explícita verifica ambos índices',async()=>{
  assert.equal((await post(crypto.randomUUID())).status,503);assert.equal(await col.countDocuments({}),0);
  assert.equal((await main(['--uri='+d.uri,'--confirm'])).indices_verificados,true);
 });
 const id=crypto.randomUUID();let acuse;
 await t.test('carrera real de ocho solicitudes: una 201, siete 200, un documento',async()=>{
  const rs=await Promise.all(Array.from({length:8},()=>post(id)));assert.equal(rs.filter(r=>r.status===201).length,1);assert.equal(rs.filter(r=>r.status===200).length,7);
  acuse=(await rs[0].json()).datos;for(const r of rs.slice(1))assert.deepEqual((await r.json()).datos,acuse);
  assert.equal(await col.countDocuments({'operacion.id':id}),1);
  const doc=await col.findOne({'operacion.id':id});assert.equal(doc.ciudadano_telefono,undefined);assert.match(doc.operacion.hash,/^[a-f0-9]{64}$/);
 });
 await t.test('misma clave distinta carga y propietario ajeno',async()=>{
  const r=await post(id,{...cuerpo,descripcion:'Otra descripción ficticia.'});assert.equal(r.status,409);assert.equal((await r.json()).codigo,'CLAVE_REUTILIZADA');
  e.state.sesion=e.target.id;assert.equal((await get(id)).status,404);assert.equal((await post(id)).status,201);e.state.sesion=e.actor.id;
 });
 await t.test('acuse no cambia tras modificación del estado actual',async()=>{
  await col.updateOne({ciudadano_id_clerk:e.actor.id,'operacion.id':id},{$set:{estado:'RESUELTO',solucion_notas:'PRIVADA'}});
  assert.deepEqual((await(await get(id)).json()).datos,acuse);
 });
 for(const despues of [false,true])await t.test('timeout inyectado '+(despues?'después':'antes')+' de escritura real',async()=>{
  const key=crypto.randomUUID(),original=col.insertOne.bind(col);
  col.insertOne=async(...args)=>{if(despues)await original(...args);throw Error('timeout simulado');};
  try{const r=await post(key);assert.equal(r.status,503);assert.equal((await r.json()).codigo,'RESULTADO_INCIERTO');}finally{col.insertOne=original;}
  assert.equal((await get(key)).status,despues?200:404);assert.equal((await post(key)).status,despues?200:201);assert.equal(await col.countDocuments({ciudadano_id_clerk:e.actor.id,'operacion.id':key}),1);
 });
 await t.test('históricos sin operación coexisten y acuse no expone contacto ni hash',async()=>{
  await col.insertMany([{folio:'HISTORICO-1'},{folio:'HISTORICO-2'}]);
  assert.equal(await col.countDocuments({contrato_creacion:{$exists:false}}),2);
  assert.doesNotMatch(JSON.stringify((await(await get(id)).json()).datos),/hash|operacion|ciudadano|telefono|email|ubicacion|PRIVADA/);
 });
});
