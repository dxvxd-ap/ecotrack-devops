const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {entorno}=require('./helpers/entorno.cjs');
const id='000000000000000000000001',key='4b80d965-625c-4cad-a7a4-5ace8313e1db';
const raiz=path.resolve(__dirname,'../src/app/api/v1/admin/reclamos');
function preparar(rol='admin'){
 const f=path.resolve(__dirname,'../src/modelos/Reclamo.ts'),m=new Module(f,module);m.filename=f;m.paths=Module._nodeModulePaths(path.dirname(f));m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
 const Modelo=m.exports.ModeloReclamo,docs=[{_id:Modelo.schema.path('_id').cast(id),folio:'REC-HIST',estado:'PENDIENTE',tipo_incidencia:'OTRO',ciudadano_nombre:'PRIVADO',ciudadano_telefono:'2291234567',ciudadano_email:'privado@example.test',solucion_notas:'NOTA HEREDADA',descripcion:'Descripción original',ubicacion:{type:'Point',coordinates:[-97,20]},operacion:{hash:'HASH-SECRETO'}}];
 let writes=0,modo=null,consultas=[];
 const get=(d,k)=>k.split('.').reduce((a,b)=>a?.[b],d);
 const eq=(a,b)=>String(a)===String(b);
 function match(d,q){return Object.entries(q).every(([k,v])=>{
  if(k==='$or')return v.some(x=>match(d,x));if(k==='$and')return v.every(x=>match(d,x));
  const a=get(d,k);if(v&&typeof v==='object'&&!v.toHexString&&!Array.isArray(v))return Object.entries(v).every(([op,x])=>op==='$exists'?(a!==undefined)===x:op==='$lt'?String(a)<String(x):op==='$gte'?a>=x:op==='$lte'?a<=x:op==='$not'?!((a||[]).some(y=>match(y,x.$elemMatch))):false);
  return eq(a,v);
 });}
 Modelo.collection.findOne=async(q,o)=>{consultas.push(q);if(modo==='lectura')throw Error('Mongo secreto');return docs.find(d=>match(d,q))||null;};
 Modelo.collection.find=(q,o)=>{consultas.push(q);let n=26;return{sort(){return this;},limit(x){n=x;return this;},async toArray(){return docs.filter(d=>match(d,q)).sort((a,b)=>String(b._id).localeCompare(String(a._id))).slice(0,n);}};};
 Modelo.collection.updateOne=async(q,u,o)=>{
  assert.deepEqual(JSON.parse(JSON.stringify(o.writeConcern)),{w:'majority',j:true,wtimeout:5000});writes++;
  if(modo==='antes')throw Error('timeout secreto');
  if(modo==='pendiente')return{acknowledged:true,matchedCount:0};
  const d=docs.find(d=>match(d,q));if(!d)return{acknowledged:true,matchedCount:0};
  Object.assign(d,u.$set);d.historial_atencion??=[];d.historial_atencion.push(u.$push.historial_atencion);
  if(modo==='despues')throw Error('timeout secreto');return{acknowledged:true,matchedCount:1};
 };
 const e=entorno(rol,{dependencias:{'@/modelos/Reclamo':{ModeloReclamo:Modelo}}});
 const detalle=(ident=id)=>e.load(path.join(raiz,'[id]/route.ts')).GET(new Request('http://localhost/api/v1/admin/reclamos/'+ident),{params:Promise.resolve({id:ident})});
 const lista=(q='')=>e.load(path.join(raiz,'route.ts')).GET(new Request('http://localhost/api/v1/admin/reclamos'+q));
 const post=(body={accion:'CAMBIAR_ESTADO',estado:'EN_REVISION',version:0},clave=key,ident=id)=>e.load(path.join(raiz,'[id]/atenciones/route.ts')).POST(new Request('http://localhost/api/v1/admin/reclamos/'+ident+'/atenciones',{method:'POST',headers:{'Content-Type':'application/json',...(clave===null?{}:{'Idempotency-Key':clave})},body:JSON.stringify(body)}),{params:Promise.resolve({id:ident})});
 return{e,docs,Modelo,detalle,lista,post,consultas,setModo:x=>modo=x,get writes(){return writes;}};
}
const privada=r=>assert.equal(r.headers.get('cache-control'),'private, no-store');
for(const rol of [null,'ciudadano','conductor','moderador','secretario','camion','desconocido','__proto__'])test('admin rechaza rol '+rol,async()=>{
 const p=preparar(rol||'admin');if(!rol)p.e.state.sesion=null;
 for(const call of [p.lista,p.detalle,p.post]){const r=await call();assert.equal(r.status,rol?403:401);privada(r);}assert.equal(p.writes,0);
});
for(const rol of ['admin','superadmin'])test(rol+' consulta lista privada y detalle sin metadatos de operación',async()=>{
 const p=preparar(rol);const r=await p.lista();assert.equal(r.status,200);privada(r);const b=await r.json();assert.equal(b.datos.elementos.length,1);
 assert.doesNotMatch(JSON.stringify(b),/PRIVADO|2291234567|privado@example|NOTA HEREDADA|HASH-SECRETO|operacion/);
 const d=await p.detalle();assert.equal(d.status,200);const t=(await d.json()).datos;assert.equal(t.contacto.telefono,'2291234567');assert.equal(t.version,0);assert.equal(t.respuesta_publica,null);assert.deepEqual(t.historial,[]);assert.doesNotMatch(JSON.stringify(t),/HASH-SECRETO|operacion/);
});
test('cambia estado de histórico con evento y versión; repetición antes de conflicto por versión',async()=>{
 const p=preparar(),antes=JSON.stringify(p.docs[0].ubicacion);const a=await p.post();assert.equal(a.status,201);const acuse=(await a.json()).datos;
 assert.equal(p.docs[0].estado,'EN_REVISION');assert.equal(p.docs[0].version_atencion,1);assert.equal(p.docs[0].historial_atencion.length,1);assert.equal(p.docs[0].historial_atencion[0].funcionario_id_clerk,p.e.actor.id);
 const b=await p.post();assert.equal(b.status,200);assert.deepEqual((await b.json()).datos,acuse);assert.equal(p.writes,1);
 const c=await p.post({accion:'AGREGAR_NOTA',version:0,nota_interna:'Nota distinta'});assert.equal(c.status,409);assert.equal((await c.json()).codigo,'CLAVE_REUTILIZADA');assert.equal(JSON.stringify(p.docs[0].ubicacion),antes);assert.equal(p.docs[0].ciudadano_id_clerk,undefined);
});
for(const [inicio,destino] of [['PENDIENTE','EN_REVISION'],['PENDIENTE','RECHAZADO'],['EN_REVISION','ATENDIDO'],['EN_REVISION','RECHAZADO']])test(`transición ${inicio} → ${destino}`,async()=>{
 const p=preparar();p.docs[0].estado=inicio;const r=await p.post({accion:'CAMBIAR_ESTADO',estado:destino,version:0,respuesta_publica:'Motivo público suficientemente explicado.'});assert.equal(r.status,201);assert.equal(p.docs[0].estado,destino);assert.equal(p.docs[0].historial_atencion[0].estado_anterior,inicio);assert.equal(p.docs[0].historial_atencion[0].estado_nuevo,destino);
});
for(const [inicio,destino] of [['PENDIENTE','ATENDIDO'],['ATENDIDO','EN_REVISION'],['RECHAZADO','PENDIENTE'],['EN_REVISION','PENDIENTE'],['PENDIENTE','PENDIENTE']])test(`rechaza transición ${inicio} → ${destino}`,async()=>{const p=preparar();p.docs[0].estado=inicio;assert.equal((await p.post({accion:'CAMBIAR_ESTADO',estado:destino,version:0,respuesta_publica:'Texto de respuesta suficiente.'})).status,409);assert.equal(p.writes,0);});
for(const destino of ['RECHAZADO','ATENDIDO'])test('cierre requiere respuesta '+destino,async()=>{const p=preparar();p.docs[0].estado='EN_REVISION';assert.equal((await p.post({accion:'CAMBIAR_ESTADO',estado:destino,version:0})).status,400);assert.equal(p.writes,0);});
test('respuesta pública y nota interna separadas en historial; ciudadano no recibe notas',async()=>{
 const p=preparar();assert.equal((await p.post({accion:'AGREGAR_NOTA',version:0,nota_interna:'NOTA SECRETA'})).status,201);
 assert.equal(p.docs[0].respuesta_publica,undefined);assert.equal(p.docs[0].estado,'PENDIENTE');
 assert.equal((await p.post({accion:'RESPONDER',version:1,respuesta_publica:'Una respuesta pública explícita.'},crypto.randomUUID())).status,201);
 const d=(await(await p.detalle()).json()).datos;assert.equal(d.historial.length,2);assert.equal(d.historial[0].nota_interna,'NOTA SECRETA');
 const c=p.e.load(path.resolve(__dirname,'../src/contratos/reclamos.ts')).serializarDetalleCiudadano(p.docs[0]);assert.equal(c.respuesta_publica,'Una respuesta pública explícita.');assert.doesNotMatch(JSON.stringify(c),/NOTA SECRETA|NOTA HEREDADA|HASH-SECRETO|user_actor/);
});
test('versiones concurrentes con claves distintas solo aplican un evento',async()=>{const p=preparar();const a={accion:'AGREGAR_NOTA',version:0,nota_interna:'Nota concurrente'};const rs=await Promise.all([p.post(a),p.post(a,crypto.randomUUID())]);assert.deepEqual(rs.map(r=>r.status).sort(),[201,409]);assert.equal(p.docs[0].historial_atencion.length,1);});
test('misma clave concurrente solo aplica un evento y devuelve el mismo resultado',async()=>{const p=preparar();const rs=await Promise.all([p.post(),p.post()]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,201]);assert.deepEqual((await rs[0].json()).datos,(await rs[1].json()).datos);assert.equal(p.docs[0].historial_atencion.length,1);});
for(const modo of ['antes','despues'])test('resultado incierto '+modo+' conserva clave y evento único',async()=>{const p=preparar();p.setModo(modo);const r=await p.post();assert.equal(r.status,503);assert.equal((await r.json()).codigo,'RESULTADO_INCIERTO');privada(r);p.setModo(null);assert.equal((await p.post()).status,modo==='antes'?201:200);assert.equal(p.docs[0].historial_atencion.length,1);});
for(const cuerpo of [{accion:'RESPONDER',version:0,respuesta_publica:'corta'},{accion:'AGREGAR_NOTA',version:0,nota_interna:' '},{accion:'OTRA',version:0},{accion:'AGREGAR_NOTA',version:-1,nota_interna:'Texto'},{accion:'AGREGAR_NOTA',version:0,nota_interna:'Texto',funcionario_id_clerk:'otro'},{accion:'AGREGAR_NOTA',version:0,nota_interna:'Texto',descripcion:'Cambio'}])test('rechaza cuerpo '+JSON.stringify(cuerpo),async()=>{const p=preparar();assert.equal((await p.post(cuerpo)).status,400);assert.equal(p.writes,0);});
for(const q of ['?extra=1','?estado=OTRO','?categoria=INVALIDA','?desde=ayer','?hasta=2026-01-01','?limite=101','?limite=0','?cursor=invalido','?folio=','?estado=PENDIENTE&estado=ATENDIDO','?bbox=1,2,3,4','?desde=2026-02-01T00:00:00.000Z&hasta=2026-01-01T00:00:00.000Z'])test('filtro inválido '+q,async()=>{const p=preparar();assert.equal((await p.lista(q)).status,400);assert.equal(p.consultas.length,0);});
test('filtros cerrados y paginación por cursor sin duplicación',async()=>{
 const p=preparar();p.docs.push({...p.docs[0],_id:p.Modelo.schema.path('_id').cast('000000000000000000000002'),folio:'REC-DOS'});
 const a=await p.lista('?estado=PENDIENTE&categoria=OTRO&limite=1');assert.equal(a.status,200);const b=(await a.json()).datos;assert.equal(b.elementos[0].folio,'REC-DOS');assert.equal(b.siguiente_cursor,'000000000000000000000002');
 const c=(await(await p.lista('?limite=1&cursor='+b.siguiente_cursor)).json()).datos;assert.equal(c.elementos[0].folio,'REC-HIST');assert.equal(c.siguiente_cursor,null);
});
test('404 indistinguible, id inválido 400 y fallo de dependencia 503 privados',async()=>{
 const p=preparar();for(const call of [()=>p.detalle('000000000000000000000099'),()=>p.post(undefined,key,'000000000000000000000099')]){const r=await call();assert.equal(r.status,404);privada(r);}
 assert.equal((await p.detalle('no')).status,400);assert.equal((await p.post(undefined,null)).status,400);p.setModo('lectura');const r=await p.detalle();assert.equal(r.status,503);assert.doesNotMatch(JSON.stringify(await r.json()),/Mongo secreto/);
});
test('responder en terminal se rechaza pero nota interna mantiene el estado cerrado',async()=>{
 const p=preparar();p.docs[0].estado='ATENDIDO';
 assert.equal((await p.post({accion:'RESPONDER',version:0,respuesta_publica:'Otra respuesta pública distinta.'})).status,409);
 assert.equal((await p.post({accion:'AGREGAR_NOTA',version:0,nota_interna:'Aclaración interna posterior.'})).status,201);
 assert.equal(p.docs[0].estado,'ATENDIDO');assert.equal(p.docs[0].fecha_resolucion,undefined);
});
for(const causa of ['locked','inactivo','rolDivergente','bloqueo','clerk','mongo'])test('administrador restringido '+causa,async()=>{
 const p=preparar();let status=403;
 if(causa==='locked')p.e.actor.locked=true;
 if(causa==='inactivo')p.e.actor.publicMetadata.activo=false;
 if(causa==='rolDivergente')p.e.state.mongoUsers.push({id_clerk:p.e.actor.id,activo:true,rol:'ciudadano'});
 if(causa==='bloqueo'){p.e.state.locks.add(p.e.actor.id);status=409;}
 if(causa==='clerk'){p.e.state.failClerk=true;status=503;}
 if(causa==='mongo'){p.e.state.failDB=true;status=503;}
 for(const call of [p.lista,p.detalle,p.post]){const r=await call();assert.equal(r.status,status);privada(r);}assert.equal(p.writes,0);
});
test('UUID inválido y versión string no escriben; entradas excesivas o controles se rechazan',async()=>{
 const p=preparar();assert.equal((await p.post(undefined,'no')).status,400);
 for(const d of [{accion:'AGREGAR_NOTA',version:'0',nota_interna:'Texto'},{accion:'AGREGAR_NOTA',version:0,nota_interna:'x'.repeat(2001)},{accion:'AGREGAR_NOTA',version:0,nota_interna:'Nota\u0000inválida'}])assert.equal((await p.post(d)).status,400);
 assert.equal(p.writes,0);
});
test('filtros exactos de fecha, folio y ruta no aceptan operadores Mongo',async()=>{
 const p=preparar();p.docs[0].fecha_reporte=new Date('2026-01-15T00:00:00.000Z');p.docs[0].ruta_id='RUTA-1';
 const r=await p.lista('?folio=REC-HIST&ruta_id=RUTA-1&desde=2026-01-01T00:00:00.000Z&hasta=2026-01-31T00:00:00.000Z');assert.equal((await r.json()).datos.elementos.length,1);
 assert.equal((await p.lista('?estado[$ne]=RECHAZADO')).status,400);
});
test('clave administrativa se limita a reporte y funcionario, sin deduplicar acciones ajenas',async()=>{
 const p=preparar();await p.post();p.e.target.publicMetadata.rol='admin';p.e.state.sesion=p.e.target.id;
 const r=await p.post({accion:'AGREGAR_NOTA',version:1,nota_interna:'Nota de otro funcionario'});assert.equal(r.status,201);assert.equal(p.docs[0].historial_atencion.length,2);assert.equal(p.docs[0].historial_atencion[1].funcionario_id_clerk,p.e.target.id);
});
test('historial completo bloquea sin truncar y versión inválida falla cerrada',async()=>{
 const p=preparar();p.docs[0].historial_atencion=Array.from({length:500},(_,i)=>({id:String(i),funcionario_id_clerk:'otro',version:i+1}));p.docs[0].version_atencion=500;
 const r=await p.post({accion:'AGREGAR_NOTA',version:500,nota_interna:'No truncar'});assert.equal(r.status,409);assert.equal((await r.json()).codigo,'HISTORIAL_COMPLETO');assert.equal(p.writes,0);
 p.docs[0].version_atencion=null;assert.equal((await p.post()).status,409);assert.equal(p.writes,0);
});
test('versión administrativa no depende de __v y no modifica contenido original',async()=>{
 const p=preparar();p.docs[0].__v=17;const original=JSON.stringify({descripcion:p.docs[0].descripcion,ubicacion:p.docs[0].ubicacion,solucion_notas:p.docs[0].solucion_notas});
 assert.equal((await p.post()).status,201);assert.equal(p.docs[0].version_atencion,1);assert.equal(p.docs[0].__v,17);
 assert.equal(JSON.stringify({descripcion:p.docs[0].descripcion,ubicacion:p.docs[0].ubicacion,solucion_notas:p.docs[0].solucion_notas}),original);
});

test('CAS sin coincidencia y lectura majority aún sin avance se trata como resultado incierto',async()=>{
 const p=preparar();p.setModo('pendiente');const r=await p.post();assert.equal(r.status,503);assert.equal((await r.json()).codigo,'RESULTADO_INCIERTO');assert.equal(p.docs[0].historial_atencion,undefined);
 p.setModo(null);assert.equal((await p.post()).status,201);assert.equal(p.docs[0].historial_atencion.length,1);
});
