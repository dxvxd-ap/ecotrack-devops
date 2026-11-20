const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {entorno}=require('./helpers/entorno.cjs');
const clave='4b80d965-625c-4cad-a7a4-5ace8313e1db';
const cuerpo={confirmada:true,domicilio_referencia:' Parque ',descripcion:'Basura acumulada junto al parque.',latitud:20,longitud:-97,tipo_incidencia:'OTRO'};
function preparar(){
 const docs=[];let indices=[],modo=null;let inserts=0;
 const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
 const f=path.resolve(__dirname,'../src/modelos/Reclamo.ts'),m=new Module(f,module);m.filename=f;m.paths=Module._nodeModulePaths(path.dirname(f));
 m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
 const Modelo=m.exports.ModeloReclamo;
 const coincide=(d,q)=>Object.entries(q).every(([k,v])=>k==='operacion.id'?d.operacion?.id===v:d[k]===v);
 Modelo.collection.indexes=async()=>indices;
 Modelo.collection.findOne=async(q,opts)=>{assert.equal(opts.readPreference,'primary');assert.equal(opts.readConcern.level,'majority');return structuredClone(docs.find(d=>coincide(d,q))||null);};
 Modelo.collection.insertOne=async(d,opts)=>{
  assert.deepEqual(JSON.parse(JSON.stringify(opts.writeConcern)),{w:'majority',j:true,wtimeout:5000});inserts++;
  if(modo==='antes')throw Error('timeout privado');
  if(docs.some(x=>x.ciudadano_id_clerk===d.ciudadano_id_clerk&&x.operacion.id===d.operacion.id))throw Object.assign(Error('duplicado'),{code:11000,keyPattern:{ciudadano_id_clerk:1,'operacion.id':1}});
  if(modo==='folio'){modo=null;throw Object.assign(Error('folio'),{code:11000,keyPattern:{folio:1}});}
  docs.push(structuredClone(d));if(modo==='despues')throw Error('timeout privado');return{acknowledged:true,insertedId:d._id};
 };
 const e=entorno('ciudadano',{dependencias:{'@/modelos/Reclamo':{ModeloReclamo:Modelo},'node:crypto':require('node:crypto')}});
 const perfil=u=>({id_clerk:u.id,correo_electronico:u.emailAddresses[0].emailAddress,rol:'ciudadano',activo:true});e.state.mongoUsers.push(perfil(e.actor),perfil(e.target));
 const errores=[];const http=e.load(path.resolve(__dirname,'../src/lib/http_reclamos.ts'));const original=http.errorReclamos;http.errorReclamos=err=>{errores.push(err);return original(err);};
 const h=e.load(path.resolve(__dirname,'../src/app/api/v1/reclamos/route.ts'));
 const specs=e.load(path.resolve(__dirname,'../src/lib/indices_reclamos.ts'));
 indices=structuredClone(specs.INDICES_RECLAMOS_R1);
 const post=(body=cuerpo,id=clave)=>h.POST(new Request('http://localhost/api/v1/reclamos',{method:'POST',headers:{'Content-Type':'application/json','EcoTrack-Contrato':'reclamos-r1',...(id===null?{}:{'Idempotency-Key':id})},body:JSON.stringify(body)}));
 const recuperar=(id=clave)=>e.load(path.resolve(__dirname,'../src/app/api/v1/reclamos/operaciones/[operacion_id]/route.ts')).GET(new Request('http://localhost/api/v1/reclamos/operaciones/'+id),{params:Promise.resolve({operacion_id:id})});
 return{e,docs,post,recuperar,Modelo,errores,setIndices:x=>indices=x,setModo:x=>modo=x,get inserts(){return inserts;}};
}
function privada(r){assert.equal(r.headers.get('cache-control'),'private, no-store');}
test('crea 201 sin teléfono ni domicilio registrado; repite 200 y recupera acuse original',async()=>{
 const p=preparar();const a=await p.post();assert.equal(a.status,201,p.errores[0]?.stack);privada(a);const acuse=(await a.json()).datos;
 assert.equal(p.docs.length,1);assert.equal(p.docs[0].ciudadano_id_clerk,p.e.actor.id);assert.equal(p.docs[0].ciudadano_telefono,undefined);
 p.docs[0].estado='RESUELTO';p.docs[0].solucion_notas='PRIVADA';
 const b=await p.post({...cuerpo,domicilio_referencia:'Parque'});assert.equal(b.status,200);assert.deepEqual((await b.json()).datos,acuse);
 const r=await p.recuperar();assert.equal(r.status,200);privada(r);assert.deepEqual((await r.json()).datos,acuse);
 assert.doesNotMatch(JSON.stringify(acuse),/hash|operacion|user_actor|telefono|coordenadas|PRIVADA|RESUELTO/);
 assert.equal(p.docs.length,1);
});
test('misma clave y distinto contenido devuelve CLAVE_REUTILIZADA',async()=>{const p=preparar();await p.post();const r=await p.post({...cuerpo,descripcion:'Una descripción diferente.'});assert.equal(r.status,409);assert.equal((await r.json()).codigo,'CLAVE_REUTILIZADA');privada(r);assert.equal(p.docs.length,1);});
test('dos ciudadanos pueden usar la misma clave sin compartir acuse',async()=>{const p=preparar();const a=await(await p.post()).json();p.e.state.sesion=p.e.target.id;const r=await p.post();assert.equal(r.status,201);assert.notEqual((await r.json()).datos.id,a.datos.id);assert.equal(p.docs.length,2);});
test('dos solicitudes simultáneas generan una sola escritura lógica',async()=>{const p=preparar();const r=await Promise.all([p.post(),p.post()]);assert.deepEqual(r.map(x=>x.status).sort(),[200,201]);assert.deepEqual((await r[0].json()).datos,(await r[1].json()).datos);assert.equal(p.docs.length,1);});
for(const modo of ['antes','despues'])test('timeout '+modo+' de escritura conserva la operación recuperable',async()=>{
 const p=preparar();p.setModo(modo);const r=await p.post();assert.equal(r.status,503);assert.equal((await r.json()).codigo,'RESULTADO_INCIERTO');privada(r);
 const q=await p.recuperar();assert.equal(q.status,modo==='antes'?404:200);
 p.setModo(null);const retry=await p.post();assert.equal(retry.status,modo==='antes'?201:200);assert.equal(p.docs.length,1);
});
test('operación ajena e inexistente devuelven el mismo 404 privado',async()=>{const p=preparar();await p.post();p.e.state.sesion=p.e.target.id;const r=await p.recuperar();assert.equal(r.status,404);const a=await r.json();privada(r);const b=await p.recuperar('00000000-0000-4000-8000-000000000000');assert.equal(b.status,404);assert.deepEqual(await b.json(),a);});
for(const tipo of ['ausente','noUnico','parcialIncorrecto','collation','folioAusente'])test('bloquea índice '+tipo,async()=>{
 const p=preparar();const specs=p.e.load(path.resolve(__dirname,'../src/lib/indices_reclamos.ts'));const ix=structuredClone(specs.INDICES_RECLAMOS_R1);
 if(tipo==='ausente')ix.length=0;if(tipo==='noUnico')ix[0].unique=false;if(tipo==='parcialIncorrecto')ix[0].partialFilterExpression={};if(tipo==='collation')ix[0].collation={locale:'en',strength:2};if(tipo==='folioAusente')ix.pop();p.setIndices(ix);
 const r=await p.post();assert.equal(r.status,503);assert.equal((await r.json()).codigo,'INDICE_NO_DISPONIBLE');assert.equal(p.inserts,0);
});
test('colisión de folio reintenta otro folio con la misma operación',async()=>{const p=preparar();p.setModo('folio');assert.equal((await p.post()).status,201);assert.equal(p.inserts,2);assert.equal(p.docs.length,1);});
for(const cambio of [{confirmada:false},{confirmada:undefined},{fotografia_url:'x'},{ciudadano_id_clerk:'ajeno'}])test('rechaza entrada R1 '+JSON.stringify(cambio),async()=>{const p=preparar();assert.equal((await p.post({...cuerpo,...cambio})).status,400);assert.equal(p.inserts,0);});
for(const id of [null,'no','00000000-0000-1000-8000-000000000000'])test('rechaza clave '+id,async()=>{const p=preparar();assert.equal((await p.post(cuerpo,id)).status,400);assert.equal(p.inserts,0);});
test('perfil sin sincronizar no crea',async()=>{const p=preparar();p.e.state.mongoUsers=[];assert.equal((await p.post()).status,409);assert.equal(p.inserts,0);});
test('ruta opcional debe existir y estar activa; repetición no se invalida por baja posterior',async()=>{
 const p=preparar(),id='000000000000000000000001';assert.equal((await p.post({...cuerpo,ruta_id:id})).status,400);
 p.e.state.rutas.push({_id:id,activa:false});assert.equal((await p.post({...cuerpo,ruta_id:id})).status,400);
 p.e.state.rutas[0].activa=true;assert.equal((await p.post({...cuerpo,ruta_id:id})).status,201);p.e.state.rutas[0].activa=false;assert.equal((await p.post({...cuerpo,ruta_id:id})).status,200);
});
test('hash determinista: texto NFC/CRLF y orden de campos no cambian la operación',async()=>{
 const p=preparar(),a={...cuerpo,descripcion:'Basura junto al cafe\u0301.\r\nRevisar.'};
 const r=await p.post(a);assert.equal(r.status,201);
 const b={longitud:-97,latitud:20,tipo_incidencia:'OTRO',descripcion:'Basura junto al café.\nRevisar.',domicilio_referencia:'Parque',ruta_id:null,origen_ubicacion:'manual',confirmada:true};
 const q=await p.post(b,clave.toUpperCase());assert.equal(q.status,200);assert.deepEqual((await r.json()).datos,(await q.json()).datos);
});
test('metadatos y acuse son inmutables en documento Mongoose hidratado',async()=>{
 const p=preparar();await p.post();
 const d=p.Modelo.hydrate(p.docs[0]),antes=JSON.parse(JSON.stringify(d.operacion));
 d.operacion={id:crypto.randomUUID(),hash:'otro',normalizacion_version:1,acuse:{id:'otro'}};
 d.operacion.acuse.folio='OTRO';d.operacion.hash='otro';d.contrato_creacion=undefined;
 assert.deepEqual(JSON.parse(JSON.stringify(d.operacion)),antes);assert.equal(d.contrato_creacion,'reclamos-r1');
});
test('histórico mantiene teléfono obligatorio y no necesita operación; R1 permite teléfono ausente',async()=>{
 const p=preparar();const antiguo=new p.Modelo({folio:'ANTERIOR',ciudadano_nombre:'Histórico',domicilio_referencia:'Lugar',ubicacion:{type:'Point',coordinates:[-97,20]},descripcion:'Histórico'});
 await assert.rejects(antiguo.validate(),e=>Boolean(e.errors.ciudadano_telefono));antiguo.ciudadano_telefono='123';await antiguo.validate();
 assert.equal(antiguo.operacion,undefined);assert.equal((await p.post()).status,201);
});
test('preparador de índices nunca admite Atlas, red externa ni base no ficticia',()=>{
 const {validarDestino}=require('../scripts/preparar-reclamos-r1.cjs');
 for(const u of ['mongodb+srv://no-usar.example/ecotrack_reclamos_test_x','mongodb://192.168.1.1:27017/ecotrack_reclamos_test_x','mongodb://127.0.0.1:27029/produccion','mongodb://u:p@127.0.0.1:27029/ecotrack_reclamos_test_x','mongodb://127.0.0.1:27029/ecotrack_reclamos_test_x?replicaSet=x'])assert.throws(()=>validarDestino(u));
 assert.equal(validarDestino('mongodb://127.0.0.1:27029/ecotrack_reclamos_test_x').base,'ecotrack_reclamos_test_x');
});
test('modelo Reclamo no crea colecciones ni índices implícitos al arrancar',()=>{
 const p=preparar();assert.equal(p.Modelo.schema.options.autoIndex,false);assert.equal(p.Modelo.schema.options.autoCreate,false);
});
