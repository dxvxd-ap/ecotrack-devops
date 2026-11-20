'use strict';
// Opt-in, solo base ficticia loopback validada. Ningún transporte Clerk o Atlas real.
const{test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),mongoose=require('mongoose');
const{entorno}=require('../helpers/entorno.cjs');
const{validarDestino}=require('../../scripts/preparar-reclamos-r1.cjs');
const destino=validarDestino(process.argv.find(x=>x.startsWith('--uri='))?.slice(6));
test('atenciones administrativas CAS con Mongo real aislado',async t=>{
 const aislado=new mongoose.Mongoose({autoIndex:false,autoCreate:false,bufferCommands:false});
 await aislado.connect(destino.uri,{directConnection:true,serverSelectionTimeoutMS:3000});t.after(()=>aislado.disconnect());
 const f=path.resolve(__dirname,'../../src/modelos/Reclamo.ts'),m=new Module(f,module);m.filename=f;m.paths=Module._nodeModulePaths(path.dirname(f));const req=m.require.bind(m);m.require=n=>n==='mongoose'?aislado:req(n);
 m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
 const Modelo=m.exports.ModeloReclamo,col=Modelo.collection;assert.equal(await col.countDocuments({}),0,'Se exige base ficticia vacía');
 const e=entorno('admin',{dependencias:{'@/modelos/Reclamo':{ModeloReclamo:Modelo}}});
 const raiz=path.resolve(__dirname,'../../src/app/api/v1/admin/reclamos');
 const h=e.load(path.join(raiz,'[id]/atenciones/route.ts')),detalle=e.load(path.join(raiz,'[id]/route.ts')),lista=e.load(path.join(raiz,'route.ts'));
 const insertar=async(estado='PENDIENTE')=>{const d=new Modelo({folio:'HIST-'+crypto.randomUUID(),ciudadano_nombre:'Histórico',ciudadano_telefono:'1234567',domicilio_referencia:'Sitio ficticio',descripcion:'Descripción original ficticia',ubicacion:{type:'Point',coordinates:[-97,20]},estado,tipo_incidencia:'OTRO',solucion_notas:'PRIVADA'});await d.validate();await col.insertOne(d.toObject(),{writeConcern:{w:'majority',j:true}});return String(d._id);};
 const post=(id,body,key=crypto.randomUUID())=>h.POST(new Request('http://localhost/api/v1/admin/reclamos/'+id+'/atenciones',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)}),{params:Promise.resolve({id})});
 const get=id=>detalle.GET(new Request('http://localhost/api/v1/admin/reclamos/'+id),{params:Promise.resolve({id})});
 const buscar=id=>col.findOne({_id:new mongoose.Types.ObjectId(id)});
 await t.test('ocho solicitudes con misma clave aplican un evento y versión con mismo resultado',async()=>{
  const id=await insertar(),key=crypto.randomUUID(),body={accion:'CAMBIAR_ESTADO',estado:'EN_REVISION',version:0};
  const rs=await Promise.all(Array.from({length:8},()=>post(id,body,key)));assert.equal(rs.filter(r=>r.status===201).length,1);assert.equal(rs.filter(r=>r.status===200).length,7);
  const original=(await rs[0].json()).datos;for(const r of rs.slice(1))assert.deepEqual((await r.json()).datos,original);
  const d=await buscar(id);assert.equal(d.version_atencion,1);assert.equal(d.historial_atencion.length,1);assert.equal(d.estado,'EN_REVISION');assert.equal(d.__v,undefined);assert.equal(d.ciudadano_id_clerk,undefined);
  const hidratado=Modelo.hydrate(d);await hidratado.validate();assert.equal(hidratado.historial_atencion[0].funcionario_id_clerk,e.actor.id);
  const clash=await post(id,{...body,estado:'RECHAZADO',respuesta_publica:'Motivo de rechazo explicado.'},key);assert.equal(clash.status,409);assert.equal((await clash.json()).codigo,'CLAVE_REUTILIZADA');
 });
 await t.test('dos claves/versiones esperadas iguales: un ganador y conflicto sin evento huérfano',async()=>{
  const id=await insertar(),body={accion:'AGREGAR_NOTA',version:0,nota_interna:'Nota concurrente'};
  const rs=await Promise.all([post(id,body),post(id,body)]);assert.deepEqual(rs.map(r=>r.status).sort(),[201,409]);const d=await buscar(id);assert.equal(d.historial_atencion.length,1);assert.equal(d.version_atencion,1);assert.equal(d.estado,'PENDIENTE');assert.equal(d.respuesta_publica,undefined);
 });
 await t.test('flujo revisión/cierre y rechazo directo con respuesta sin copiar nota antigua',async()=>{
  const id=await insertar();assert.equal((await post(id,{accion:'CAMBIAR_ESTADO',estado:'ATENDIDO',version:0,respuesta_publica:'Respuesta suficientemente larga.'})).status,409);
  assert.equal((await post(id,{accion:'CAMBIAR_ESTADO',estado:'EN_REVISION',version:0})).status,201);
  assert.equal((await post(id,{accion:'CAMBIAR_ESTADO',estado:'ATENDIDO',version:1})).status,400);
  assert.equal((await post(id,{accion:'CAMBIAR_ESTADO',estado:'ATENDIDO',version:1,respuesta_publica:'Se atendió el reporte del ciudadano.'})).status,201);
  const d=await buscar(id);assert.equal(d.historial_atencion.length,2);assert.equal(d.version_atencion,2);assert.equal(d.fecha_resolucion instanceof Date,true);assert.equal(d.solucion_notas,'PRIVADA');
  assert.equal((await post(id,{accion:'CAMBIAR_ESTADO',estado:'EN_REVISION',version:2})).status,409);
  const rechazo=await insertar();assert.equal((await post(rechazo,{accion:'CAMBIAR_ESTADO',estado:'RECHAZADO',version:0,respuesta_publica:'El reporte no corresponde al servicio municipal.'})).status,201);
 });
 for(const despues of [false,true])await t.test('timeout simulado '+(despues?'después':'antes')+' de actualización real se recupera por repetición',async()=>{
  const id=await insertar(),key=crypto.randomUUID(),body={accion:'AGREGAR_NOTA',version:0,nota_interna:'Nota única del funcionario'};
  const orig=col.updateOne.bind(col);col.updateOne=async(...args)=>{if(despues)await orig(...args);throw Error('timeout simulado');};
  try{const r=await post(id,body,key);assert.equal(r.status,503);assert.equal((await r.json()).codigo,'RESULTADO_INCIERTO');}finally{col.updateOne=orig;}
  assert.equal((await post(id,body,key)).status,despues?200:201);const d=await buscar(id);assert.equal(d.historial_atencion.length,1);assert.equal(d.version_atencion,1);
 });
 await t.test('listado y detalle de histórico: privacidad, filtro real y cursor real',async()=>{
  const id=await insertar();const r=await get(id),d=(await r.json()).datos;assert.equal(d.version,0);assert.deepEqual(d.historial,[]);assert.equal(d.respuesta_publica,null);assert.equal(d.propietario_vinculado,false);
  const a=await lista.GET(new Request('http://localhost/api/v1/admin/reclamos?limite=2&categoria=OTRO'));assert.equal(a.status,200);const b=(await a.json()).datos;assert.equal(b.elementos.length,2);assert.ok(b.siguiente_cursor);assert.doesNotMatch(JSON.stringify(b),/PRIVADA|1234567|Histórico|idempotencia|hash/);
  const c=(await(await lista.GET(new Request('http://localhost/api/v1/admin/reclamos?limite=2&cursor='+b.siguiente_cursor))).json()).datos;assert.ok(!c.elementos.some(x=>b.elementos.some(y=>x.id===y.id)));
  const ciudadano=e.load(path.resolve(__dirname,'../../src/contratos/reclamos.ts')).serializarDetalleCiudadano(await buscar(id));assert.doesNotMatch(JSON.stringify(ciudadano),/PRIVADA|1234567|idempotencia|hash/);
 });
});
