const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { entorno } = require('./helpers/entorno.cjs');
const entrada={latitud:20.46,longitud:-97.08,confirmada:true};
function preparar(error) {
 let llamadas=[];
 class ErrorGeocodificacion extends Error {
  constructor(status,codigo,mensaje,reintentarEn){super(mensaje);Object.assign(this,{status,codigo,reintentarEn});}
 }
 const e=entorno('ciudadano',{dependencias:{'@/lib/geoapify_servidor':{geocodificadorGeoapify:{consultar:async(id,punto)=>{llamadas.push({id,punto});if(error)throw new ErrorGeocodificacion(...error);return{proveedor:'geoapify',aproximada:true,direccion:null};}},ErrorGeocodificacion}}});
 e.state.mongoUsers.push({id_clerk:e.actor.id,correo_electronico:e.actor.emailAddresses[0].emailAddress,rol:'ciudadano',activo:true});
 const ruta=e.load(path.resolve(__dirname,'../src/app/api/ciudadano/direccion-aproximada/route.ts'));
 const pedir=(body=JSON.stringify(entrada),headers={},query='')=>ruta.POST(new Request('https://ecotrack.test/api/ciudadano/direccion-aproximada'+query,{method:'POST',headers:{'Content-Type':'application/json',...headers},body}));
 return{e,ruta,pedir,llamadas};
}
test('ciudadano autenticado consulta sin escribir en Mongo ni Clerk',async()=>{
 const t=preparar(),r=await t.pedir();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');
 assert.deepEqual((await r.json()).datos,{proveedor:'geoapify',aproximada:true,direccion:null});
 assert.deepEqual(structuredClone(t.llamadas),[{id:t.e.actor.id,punto:entrada}]);assert.deepEqual(t.e.state.writes,[]);
});
for(const caso of ['anonimo','inactivo','rol','sinPerfil','correo'])test(`autorización rechaza ${caso} antes de geocodificar`,async()=>{
 const t=preparar();let status=403;
 if(caso==='anonimo'){t.e.state.sesion=null;status=401;}
 if(caso==='inactivo')t.e.actor.banned=true;
 if(caso==='rol')t.e.actor.publicMetadata.rol='admin';
 if(caso==='sinPerfil'){t.e.state.mongoUsers=[];status=409;}
 if(caso==='correo')t.e.actor.emailAddresses[0].verification.status='unverified';
 const r=await t.pedir();assert.equal(r.status,status);assert.equal(t.llamadas.length,0);assert.deepEqual(t.e.state.writes,[]);
});
for(const cambio of [{latitud:91},{longitud:-181},{latitud:'20'},{longitud:null},{confirmada:false},{confirmada:undefined},{correo:'dato-no-permitido'},{version:1}])test('rechaza coordenadas/campos inválidos sin consultar proveedor',async()=>{
 const t=preparar(),r=await t.pedir(JSON.stringify({...entrada,...cambio}));assert.equal(r.status,400);assert.equal(t.llamadas.length,0);
});
test('valida JSON, content-type, bytes reales y querystring',async()=>{
 for(const [cuerpo,headers,query,status]of [['{',{},'',400],['null',{},'',400],['[]',{},'',400],[' '.repeat(4097),{},'',413],[JSON.stringify(entrada),{'Content-Type':'text/plain'},'',415],[JSON.stringify(entrada),{},'?latitud=20',400]]){
  const t=preparar();assert.equal((await t.pedir(cuerpo,headers,query)).status,status);assert.equal(t.llamadas.length,0);
 }
});
for(const metodo of ['GET','PUT','PATCH','DELETE','HEAD','OPTIONS'])test(`método ${metodo} devuelve 405`,async()=>{
 const t=preparar(),r=await t.ruta[metodo](new Request('https://ecotrack.test/api/ciudadano/direccion-aproximada',{method:metodo}));
 assert.equal(r.status,405);assert.equal(r.headers.get('allow'),'POST');assert.equal(t.llamadas.length,0);
});

for(const [status,codigo,retry]of [[503,'GEOCODIFICACION_NO_CONFIGURADA',undefined],[502,'ERROR_PROVEEDOR',undefined],[504,'TIMEOUT_GEOCODIFICACION',undefined],[429,'CUOTA_PROVEEDOR',30]])test(`traduce error de geocodificación ${status} sin filtrar datos`,async()=>{
 const t=preparar([status,codigo,'Mensaje seguro',retry]),r=await t.pedir();
 assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(await r.json(),{exito:false,mensaje:'Mensaje seguro',codigo});
 assert.equal(r.headers.get('retry-after'),retry?String(retry):null);assert.deepEqual(t.e.state.writes,[]);
});
test('rechaza origen ajeno sin Bearer y no permite invocar POST con otro método',async()=>{
 const t=preparar();assert.equal((await t.pedir(JSON.stringify(entrada),{Origin:'https://ajeno.test'})).status,403);
 assert.equal((await t.ruta.POST(new Request('https://ecotrack.test',{method:'GET'}))).status,405);
 assert.equal(t.llamadas.length,0);
});
