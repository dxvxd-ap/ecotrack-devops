'use strict';
// Ejecución explícita con --uri loopback validada. No dotenv, Clerk real, Atlas ni base_datos.ts.
const{test}=require('node:test'),assert=require('node:assert/strict');
const mongoose=require('mongoose'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const{validarDestino,main:sembrar}=require('../../scripts/preparar-rutas-desarrollo.cjs');
const{cargarRutas}=require('../helpers/rutas-reales.cjs');
const parametro=process.argv.slice(2).find(x=>x.startsWith('--uri='));
const destino=validarDestino(parametro?.slice(6));
test('rutas 3.6A con MongoDB real aislado',async t=>{
 const aislado=new mongoose.Mongoose({autoIndex:false,autoCreate:false,bufferCommands:false});
 const lector=new mongoose.mongo.MongoClient(destino.uri,{directConnection:true,serverSelectionTimeoutMS:2000});
 t.after(async()=>{await aislado.disconnect();await lector.close();});
 await aislado.connect(destino.uri,{directConnection:true,serverSelectionTimeoutMS:2000,autoIndex:false,autoCreate:false});await lector.connect();
 const coleccion=lector.db(destino.base).collection('rutas');
 assert.equal(await coleccion.countDocuments({}),0,'El entorno de integración debe estar vacío');
 const api=cargarRutas(aislado);
 const entrada={id_ruta:'IT-FICTICIA',nombre:'Ruta ficticia de integración',trazado_geojson:{type:'LineString',coordinates:[[0,0],[0.01,0.01]]},color_mapa:'#047857',distancia_estimada_km:1,duracion_estimada_min:12};
 let creada;
 await t.test('GET vacío válido no crea colección ni recupera JSON',async()=>{
  const r=await api.call('GET');assert.equal(r.status,200);assert.deepEqual((await r.json()).datos,[]);
  assert.equal((await lector.db(destino.base).listCollections({name:'rutas'}).toArray()).length,0);
 });
 await t.test('datos ficticios explícitos e índice único, sin sobrescribir colección poblada',async()=>{
  await sembrar(['--uri='+destino.uri,'--confirm']);assert.equal(await coleccion.countDocuments({}),2);
  await assert.rejects(sembrar(['--uri='+destino.uri,'--confirm']),/no está vacía/);assert.equal(await coleccion.countDocuments({}),2);
  assert.equal((await coleccion.indexes()).some(i=>i.unique&&i.key.id_ruta===1),true);
 });
 await t.test('POST confirma inserción verificable por un cliente independiente',async()=>{
  const r=await api.call('POST',entrada);assert.equal(r.status,200);creada=(await r.json()).datos;
  assert.match(creada._id,/^[a-f0-9]{24}$/);const persistida=await coleccion.findOne({_id:new mongoose.mongo.ObjectId(creada._id)});
  assert.equal(persistida.nombre,entrada.nombre);assert.deepEqual(persistida.trazado_geojson,entrada.trazado_geojson);
 });
 await t.test('duplicado y carrera de POST no producen documentos duplicados',async()=>{
  assert.equal((await api.call('POST',entrada)).status,409);
  const respuestas=await Promise.all([api.call('POST',{...entrada,id_ruta:'IT-CARRERA'}),api.call('POST',{...entrada,id_ruta:'IT-CARRERA'})]);assert.deepEqual(respuestas.map(r=>r.status).sort(),[200,409]);assert.equal(await coleccion.countDocuments({id_ruta:'IT-CARRERA'}),1);
 });
 await t.test('PUT modifica únicamente la ruta indicada y mantiene ambos IDs',async()=>{
  const ajena=await coleccion.findOne({id_ruta:'DEV-FICTICIA-01'});
  const r=await api.call('PUT',{_id:creada._id,id_ruta:entrada.id_ruta,nombre:'Modificada',distancia_estimada_km:0});assert.equal(r.status,200);assert.equal((await r.json()).datos._id,creada._id);
  assert.equal((await coleccion.findOne({id_ruta:entrada.id_ruta})).nombre,'Modificada');assert.deepEqual(await coleccion.findOne({_id:ajena._id}),ajena);
  assert.equal((await api.call('PUT',{_id:creada._id,id_ruta:ajena.id_ruta,nombre:'No aplicar'})).status,404);
 });
 await t.test('inexistentes y entradas inválidas nunca insertan por upsert',async()=>{
  const n=await coleccion.countDocuments({});
  assert.equal((await api.call('PUT',{_id:'000000000000000000000001',nombre:'No crear'})).status,404);
  assert.equal((await api.call('DELETE',null,'?id=000000000000000000000001')).status,404);
  assert.equal((await api.call('PUT',{_id:{$ne:null},nombre:'No aplicar'})).status,400);assert.equal(await coleccion.countDocuments({}),n);
 });
 await t.test('GET conserva contrato dashboard y normalizador real PWA',async()=>{
  const b=await(await api.call('GET')).json();assert.equal(b.exito,true);assert.ok(b.datos.every(r=>r._id&&r.id_ruta&&r.nombre&&r.trazado_geojson));
  const mod={exports:{}};const codigo=ts.transpileModule(fs.readFileSync('apps/ciudadano/src/servicios/contratos.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext('(function(module,exports){'+codigo+'\n})',{URL})(mod,mod.exports);
  const normalizadas=mod.exports.normalizarRutas(b);assert.equal(normalizadas.features.length,b.datos.length);assert.ok(normalizadas.features.some(f=>f.properties.id===creada._id));
 });
 await t.test('DELETE confirma baja lógica, conserva documento y no afecta a otra ruta',async()=>{
  const n=await coleccion.countDocuments({});const r=await api.call('DELETE',null,'?id='+creada._id);assert.equal(r.status,200);assert.equal((await r.json()).datos.activa,false);
  assert.equal((await coleccion.findOne({id_ruta:entrada.id_ruta})).activa,false);assert.equal(await coleccion.countDocuments({}),n);
  assert.ok((await(await api.call('GET')).json()).datos.every(d=>d._id!==creada._id));assert.equal((await coleccion.findOne({id_ruta:'DEV-FICTICIA-01'})).activa,true);
 });
 await t.test('PUT rechaza reactivación heredada y GET no publica activos incompletos',async()=>{
  const legacy=await coleccion.insertOne({activa:false,nombre_ruta:'Heredada ficticia'});
  const r=await api.call('PUT',{_id:String(legacy.insertedId),activa:true});assert.equal(r.status,400);assert.equal((await coleccion.findOne({_id:legacy.insertedId})).activa,false);
  await coleccion.updateOne({_id:legacy.insertedId},{$set:{activa:true}});
  assert.ok((await(await api.call('GET')).json()).datos.every(d=>d._id!==String(legacy.insertedId)));
 });
 await t.test('PUT detecta escritura concurrente sin pisar cambios ni activar datos inválidos',async()=>{
  const d=await coleccion.findOne({id_ruta:'DEV-FICTICIA-01'});const original=api.modelo.findOneAndUpdate;
  api.modelo.findOneAndUpdate=async(...args)=>{await coleccion.updateOne({_id:d._id},{$unset:{trazado_geojson:''}});return original.apply(api.modelo,args);};
  try{const r=await api.call('PUT',{_id:String(d._id),nombre:'No guardar'});assert.equal(r.status,409);assert.equal((await coleccion.findOne({_id:d._id})).nombre,d.nombre);}finally{api.modelo.findOneAndUpdate=original;}
 });
 await t.test('fallos de escritura y conexión no devuelven éxito',async()=>{
  const original=api.modelo.create;api.modelo.create=async()=>{throw Error('Detalle privado de Mongo');};
  try{const r=await api.call('POST',{...entrada,id_ruta:'IT-NO-GUARDAR'});assert.equal(r.status,503);assert.equal((await r.json()).exito,false);assert.equal(await coleccion.countDocuments({id_ruta:'IT-NO-GUARDAR'}),0);}finally{api.modelo.create=original;}
  await aislado.disconnect();for(const metodo of ['GET','POST','PUT','DELETE']){const r=await api.call(metodo,metodo==='POST'?entrada:metodo==='PUT'?{_id:creada._id,nombre:'No guardar'}:null,'?id='+creada._id);assert.equal(r.status,503);assert.equal((await r.json()).exito,false);}
 });
});
