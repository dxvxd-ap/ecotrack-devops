const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cargarGeoapify } = require('./helpers/geoapify.cjs');
const punto = { latitud: 20.46, longitud: -97.08, confirmada: true };
const completa = { street: 'Calle de prueba', housenumber: '12A', suburb: 'Colonia de prueba', city: 'Localidad de prueba', county: 'División de prueba', state: 'Estado de prueba', country: 'México' };
function entorno(resultados = [completa], opciones = {}) {
  const modulo = cargarGeoapify(); let tiempo = Date.UTC(2026, 10, 15), llamadas = [];
  const servicio = modulo.crearGeocodificador({ clave: () => 'clave-ficticia', ahora: () => tiempo,
    transportar: async (url, init) => { llamadas.push({ url, init }); return Response.json({ results: resultados }); }, ...opciones });
  return { ...modulo, servicio, llamadas, avanzar(ms) { tiempo += ms; } };
}
test('normaliza dirección completa sin confundir localidad/división con municipio', async () => {
  const e = entorno(); const r = await e.servicio.consultar('ciudadano-a', punto);
  assert.deepEqual(r.direccion, { calle: 'Calle de prueba', numero: '12A', colonia: 'Colonia de prueba', localidad: 'Localidad de prueba', municipio: null, estado: 'Estado de prueba', pais: 'México' });
  assert.equal(r.aproximada, true); assert.equal(r.proveedor, 'geoapify');
  assert.ok(Date.parse(r.expira_en) - Date.parse(r.consultado_en) <= 86400000);
  const { url, init } = e.llamadas[0], u = new URL(url);
  assert.equal(u.origin, 'https://api.geoapify.com'); assert.equal(u.searchParams.get('lang'), 'es');
  assert.equal(u.searchParams.get('lat'), '20.46'); assert.equal(u.searchParams.get('lon'), '-97.08');
  assert.equal(u.searchParams.get('apiKey'), 'clave-ficticia'); assert.equal(init.redirect, 'error');
  assert.deepEqual(init.headers, { Accept: 'application/json' });
  assert.equal(JSON.stringify({url,headers:init.headers}).includes('ciudadano-a'), false);
});
for (const [nombre, props] of [['calle sin número', {street:'Camino de prueba'}], ['rural', {city:'Localidad rural',state:'Estado de prueba'}], ['campos ausentes', {country:'México'}]]) {
 test(`acepta dirección parcial: ${nombre}`, async () => {
  const r = await entorno([props]).servicio.consultar('a', punto);
  assert.equal(r.direccion.numero, null); assert.equal(r.direccion.municipio, null);
  if (!props.street) assert.equal(r.direccion.calle, null);
 });
}
test('sin resultado es null, no inventa dirección ni número', async () => {
 assert.equal((await entorno([]).servicio.consultar('a', punto)).direccion, null);
 assert.equal((await entorno([{}]).servicio.consultar('a', punto)).direccion, null);
});
for (const respuesta of [{results:'incorrecto'}, {features:[]}, {results:[null]}]) test('rechaza estructura inválida del proveedor', async () => {
 const e = entorno([], {transportar:async()=>Response.json(respuesta)});
 await assert.rejects(e.servicio.consultar('a', punto), err => err.status === 502 && err.codigo === 'RESPUESTA_GEOCODIFICACION_INVALIDA');
});
test('timeout es acotado incluso si el transporte ignora abort', async () => {
 let signal;
 const e = entorno([], {timeoutMs:15, transportar:async (_url, init)=>{signal=init.signal;return new Promise(()=>{});}});
 await assert.rejects(e.servicio.consultar('a',punto),err=>err.status===504 && err.codigo==='TIMEOUT_GEOCODIFICACION');
 assert.equal(signal.aborted,true);
});
test('429 respeta Retry-After y bloquea nuevas llamadas al proveedor temporalmente', async () => {
 let n=0;
 const e=entorno([], {transportar:async()=>{n++;return Response.json({}, {status:429,headers:{'Retry-After':'30'}});}});
 await assert.rejects(e.servicio.consultar('a',punto),err=>err.status===429&&err.reintentarEn===30);
 e.avanzar(300);
 await assert.rejects(e.servicio.consultar('b',punto),err=>err.status===429);
 assert.equal(n,1);
});
for (const tipo of ['http','red','json','excesiva']) test(`error del proveedor sanitizado: ${tipo}`,async()=>{
 const e=entorno([], {transportar:async()=>{
  if(tipo==='red')throw Error('clave-ficticia coordenadas privadas');
  if(tipo==='json')return new Response('no JSON',{headers:{'content-type':'application/json'}});
  if(tipo==='excesiva')return Response.json({results:[],extra:'x'.repeat(70000)});
  return Response.json({mensaje:'clave-ficticia'},{status:500});
 }});
 await assert.rejects(e.servicio.consultar('a',punto),err=>err.status===502&&!err.message.includes('clave-ficticia')&&!err.message.includes('privadas'));
});
test('sin clave no realiza solicitudes',async()=>{
 const e=entorno([], {clave:()=>undefined});
 await assert.rejects(e.servicio.consultar('a',punto),err=>err.status===503&&err.codigo==='GEOCODIFICACION_NO_CONFIGURADA');
 assert.equal(e.llamadas.length,0);
});
test('deduplica y cachea, aísla usuarios y no permite mutar el resultado compartido',async()=>{
 const e=entorno(); const [a,b]=await Promise.all([e.servicio.consultar('a',punto),e.servicio.consultar('a',punto)]);
 assert.equal(e.llamadas.length,1); a.direccion.calle='Mutada';
 assert.equal(b.direccion.calle,'Calle de prueba');
 assert.equal((await e.servicio.consultar('a',punto)).direccion.calle,'Calle de prueba');
 e.avanzar(300);await e.servicio.consultar('b',punto);assert.equal(e.llamadas.length,2);
 e.avanzar(86400001);await e.servicio.consultar('a',punto);assert.equal(e.llamadas.length,3);
});
test('caché acotada expulsa entradas antiguas',async()=>{
 const e=entorno([], {maxCache:2});
 for(let i=0;i<3;i++){await e.servicio.consultar('a',{...punto,latitud:20+i});e.avanzar(300);}
 await e.servicio.consultar('a',punto);assert.equal(e.llamadas.length,4);
});
test('limita frecuencia al proveedor y abuso por ciudadano incluso con caché',async()=>{
 const e=entorno();await e.servicio.consultar('a',punto);
 await assert.rejects(e.servicio.consultar('b',punto),err=>err.status===429);
 for(let i=0;i<19;i++)await e.servicio.consultar('a',punto);
 await assert.rejects(e.servicio.consultar('a',punto),err=>err.status===429);
 assert.equal(e.llamadas.length,1);
});

test('error no se cachea como resultado vacío',async()=>{
 let falla=true,n=0;const e=entorno([],{transportar:async()=>{n++;if(falla)throw Error('fixture');return Response.json({results:[]});}});
 await assert.rejects(e.servicio.consultar('a',punto));falla=false;e.avanzar(300);
 assert.equal((await e.servicio.consultar('a',punto)).direccion,null);assert.equal(n,2);
});
test('límite por minuto del proceso no consume más peticiones del proveedor',async()=>{
 const e=entorno([]);
 for(let i=0;i<40;i++){await e.servicio.consultar(`a${i}`,punto);e.avanzar(300);}
 await assert.rejects(e.servicio.consultar('otro',punto),err=>err.status===429);
 assert.equal(e.llamadas.length,40);
});
test('presupuesto diario por proceso se detiene y se reinicia al siguiente día UTC',async()=>{
 const e=entorno([]);
 for(let i=0;i<2400;i++){await e.servicio.consultar(`a${i%100}`,{...punto,latitud:20+i/1000000});e.avanzar(2000);}
 await assert.rejects(e.servicio.consultar('nuevo',punto),err=>err.status===429);
 assert.equal(e.llamadas.length,2400);e.avanzar(86400000);
 await e.servicio.consultar('nuevo',punto);assert.equal(e.llamadas.length,2401);
});
test('timeout también cubre la lectura del cuerpo',async()=>{
 const e=entorno([],{timeoutMs:15,transportar:async()=>new Response(new ReadableStream({start(){}}),{headers:{'content-type':'application/json'}})});
 await assert.rejects(e.servicio.consultar('a',punto),err=>err.status===504);
});
