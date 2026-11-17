const {test}=require('node:test');
const assert=require('node:assert/strict');
const {preparar,entrada,A,B}=require('./helpers/rutas.cjs');
const doc=(id=A,codigo='R1')=>({...entrada(),_id:id,id_ruta:codigo,activa:true});
test('GET vacío no recupera JSON antiguo y no depende del archivo',async()=>{
 const{e,estado}=preparar();e.state.sesion=null;
 const r=await e.call('rutas','GET');assert.equal(r.status,200);assert.deepEqual((await r.json()).datos,[]);assert.equal(estado.lecturasJSON,0);
});
test('GET devuelve solo activas, incluso con rutas inactivas y respaldo antiguo',async()=>{
 const{e,estado}=preparar();estado.docs=[{...doc(),activa:false}];
 assert.deepEqual((await(await e.call('rutas','GET')).json()).datos,[]);assert.equal(estado.lecturasJSON,0);
});
for(const metodo of ['GET','POST','PUT','DELETE'])test(`${metodo} fallo de Mongo nunca es éxito ni filtra detalles`,async()=>{
 const{e,estado}=preparar();estado.fallo=Error('URI y detalle internos privados');
 const r=await e.call('rutas',metodo,metodo==='POST'?entrada():metodo==='PUT'?{_id:A,nombre:'Cambio'}:undefined,'?id='+A);
 assert.equal(r.status,503);const b=await r.json();assert.equal(b.exito,false);assert.equal(b.codigo,'BASE_DATOS_NO_DISPONIBLE');assert.doesNotMatch(JSON.stringify(b),/privados|URI/);assert.equal(estado.lecturasJSON+estado.escriturasJSON,0);
});
test('POST espera persistencia, conserva contrato y deja generar el ObjectId',async()=>{
 const{e,estado}=preparar();let resolver;estado.antesCrear=()=>new Promise(r=>resolver=r);
 let terminado=false;const pendiente=e.call('rutas','POST',entrada()).then(r=>{terminado=true;return r;});
 while(!resolver)await new Promise(r=>setImmediate(r));assert.equal(terminado,false);resolver();
 const r=await pendiente;assert.equal(r.status,200);const b=await r.json();assert.equal(b.exito,true);assert.match(b.datos._id,/^[a-f0-9]{24}$/);assert.equal(estado.docs.length,1);
 assert.equal(estado.creaciones[0].datos[0]._id,undefined);assert.equal(estado.creaciones[0].opciones.w,'majority');assert.equal(estado.lecturasJSON+estado.escriturasJSON,0);
});
test('POST duplicado devuelve 409 sin divulgar el valor ni insertar otro',async()=>{
 const{e,estado}=preparar();estado.docs=[doc()];const r=await e.call('rutas','POST',entrada());assert.equal(r.status,409);const b=await r.json();assert.equal(b.codigo,'RUTA_EN_CONFLICTO');assert.doesNotMatch(JSON.stringify(b),/privado/);assert.equal(estado.docs.length,1);
});
test('PUT modifica exclusivamente el selector y conserva IDs estables',async()=>{
 const{e,estado}=preparar();estado.docs=[doc(),doc(B,'R2')];const ajena=structuredClone(estado.docs[1]);
 const r=await e.call('rutas','PUT',{_id:A,id_ruta:'R1',nombre:'Modificada',distancia_estimada_km:0});assert.equal(r.status,200);assert.equal((await r.json()).datos._id,A);assert.equal(estado.docs[0].nombre,'Modificada');assert.deepEqual(estado.docs[1],ajena);assert.equal(estado.lecturasJSON+estado.escriturasJSON,0);
});
test('PUT con _id y código divergentes no toca ninguna ruta',async()=>{
 const{e,estado}=preparar();estado.docs=[doc(),doc(B,'R2')];const antes=structuredClone(estado.docs);
 const r=await e.call('rutas','PUT',{_id:A,id_ruta:'R2',nombre:'No aplicar'});assert.equal(r.status,404);assert.deepEqual(estado.docs,antes);
});
for(const metodo of ['PUT','DELETE'])test(`${metodo} ruta inexistente devuelve 404`,async()=>{
 const{e}=preparar();const r=await e.call('rutas',metodo,metodo==='PUT'?{_id:A,nombre:'Cambio'}:undefined,'?id='+A);assert.equal(r.status,404);assert.equal((await r.json()).codigo,'RUTA_NO_ENCONTRADA');
});
test('DELETE confirma baja lógica exclusivamente en la ruta indicada',async()=>{
 const{e,estado}=preparar();estado.docs=[doc(),doc(B,'R2')];const r=await e.call('rutas','DELETE',undefined,'?id='+A);assert.equal(r.status,200);assert.equal(estado.docs[0].activa,false);assert.equal(estado.docs[1].activa,true);assert.equal(estado.docs.length,2);assert.equal((await r.json()).exito,true);assert.equal(estado.lecturasJSON+estado.escriturasJSON,0);
});
test('selectores por id_ruta siguen funcionando',async()=>{
 const{e,estado}=preparar();estado.docs=[doc()];assert.equal((await e.call('rutas','PUT',{id_ruta:'R1',nombre:'Cambio'})).status,200);assert.equal((await e.call('rutas','DELETE',undefined,'?id=R1')).status,200);
});
for(const [metodo,cuerpo,query] of [
 ['POST',{...entrada(),_id:A},''],['POST',{...entrada(),trazado_geojson:{type:'LineString',coordinates:[[181,0],[0,0]]}},''],
 ['POST',{...entrada(),nombre:'   '},''],['POST',{...entrada(),distancia_estimada_km:-1},''],
 ['PUT',{_id:{$ne:null},nombre:'Ataque'},''],['PUT',{_id:'ruta_local',id_ruta:'R1',nombre:'Ataque'},''],['PUT',{id_ruta:'R1'},''],
 ['PUT',{_id:A,nombre:'Cambio',rol:'admin'},''],['DELETE',undefined,'?id[$ne]=x'],
])test(`entrada inválida ${metodo} ${JSON.stringify(cuerpo||query)} no escribe`,async()=>{
 const{e,estado}=preparar();estado.docs=[doc()];const antes=structuredClone(estado.docs);const r=await e.call('rutas',metodo,cuerpo,query);assert.equal(r.status,400);assert.deepEqual(estado.docs,antes);assert.equal(estado.escriturasJSON,0);
});
for(const indices of [[],[{key:{id_ruta:1},unique:false}],[{key:{id_ruta:1},unique:true,sparse:true}],[{key:{id_ruta:1},unique:true,partialFilterExpression:{activa:true}}]])test('escritura sin índice único completo se rechaza sin modificar rutas',async()=>{
 const{e,estado,modelo}=preparar();modelo.collection={indexes:async()=>indices};estado.docs=[doc()];const antes=structuredClone(estado.docs);
 for(const method of ['POST','PUT','DELETE']){const r=await e.call('rutas',method,method==='POST'?entrada():method==='PUT'?{_id:A,nombre:'No aplicar'}:undefined,'?id='+A);assert.equal(r.status,503);assert.equal((await r.json()).codigo,'INDICE_NO_DISPONIBLE');}
 assert.deepEqual(estado.docs,antes);
});
test('PUT espera la confirmación de Mongo y no anuncia cambios anticipados',async()=>{
 const{e,estado}=preparar();estado.docs=[doc()];let resolver;estado.antesActualizar=()=>new Promise(r=>resolver=r);let terminado=false;
 const p=e.call('rutas','PUT',{_id:A,nombre:'Cambio confirmado'}).then(r=>{terminado=true;return r;});
 while(!resolver)await new Promise(r=>setImmediate(r));assert.equal(terminado,false);assert.equal(estado.docs[0].nombre,'Ruta ficticia');resolver();assert.equal((await p).status,200);assert.equal(estado.docs[0].nombre,'Cambio confirmado');
});
test('POST sin documento de confirmación se trata como fallo',async()=>{
 const{e,modelo}=preparar();modelo.create=async()=>[];const r=await e.call('rutas','POST',entrada());assert.equal(r.status,503);assert.equal((await r.json()).exito,false);
});
test('JSON malformado devuelve 400 y no escribe',async()=>{
 const{e,estado}=preparar();const path=require('node:path');const h=e.load(path.resolve(__dirname,'../src/app/api/rutas/route.ts'));
 const r=await h.POST(new Request('http://localhost/api/rutas',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}));assert.equal(r.status,400);assert.equal(estado.docs.length,0);
});
test('catálogo LineString y MultiLineString conserva los campos públicos del dashboard',async()=>{
 const{e,estado}=preparar();const uno=await e.call('rutas','POST',entrada());assert.equal(uno.status,200);const b=(await uno.json()).datos;
 for(const key of ['_id','id_ruta','nombre','trazado_geojson','color_mapa','activa','fecha_creacion'])assert.ok(Object.hasOwn(b,key),key);
 const varios={...entrada(),id_ruta:'R2',trazado_geojson:{type:'MultiLineString',coordinates:[[[0,0],[0.01,0.01]]]}};assert.equal((await e.call('rutas','POST',varios)).status,200);assert.equal(estado.docs.length,2);
});
test('PUT no reactiva una ruta heredada incompleta',async()=>{
 const{e,estado}=preparar();estado.docs=[{_id:A,activa:false,nombre_ruta:'Heredada ficticia'}];const antes=structuredClone(estado.docs);
 const r=await e.call('rutas','PUT',{_id:A,activa:true});assert.equal(r.status,400);assert.deepEqual(estado.docs,antes);
});
test('PUT detecta cambios concurrentes entre validar y escribir',async()=>{
 const{e,estado}=preparar();estado.docs=[doc()];estado.antesActualizar=async()=>{delete estado.docs[0].trazado_geojson;};
 const r=await e.call('rutas','PUT',{_id:A,nombre:'No aplicar'});assert.equal(r.status,409);assert.equal(estado.docs[0].nombre,'Ruta ficticia');
});
