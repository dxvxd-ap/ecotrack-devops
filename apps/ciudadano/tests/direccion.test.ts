import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consultarDireccion, ErrorDireccion} from '../src/servicios/direccion.ts';
const punto=[-97.08,20.46] as const;
const datos=()=>({proveedor:'geoapify',aproximada:true,direccion:{calle:'Calle de prueba',numero:'12',colonia:null,municipio:null,localidad:'Localidad',estado:'Veracruz',pais:'México'},consultado_en:new Date().toISOString(),expira_en:new Date(Date.now()+60000).toISOString(),atribucion:{proveedor:'Geoapify',url:'https://www.geoapify.com/',datos:'© OpenStreetMap contributors'}});
test('cliente usa contrato real, token explícito y punto confirmado sin modificarlo',async()=>{
 let enviado: RequestInit|undefined;
 const r=await consultarDireccion('token-ficticio',punto,{transportar:async(url,init)=>{assert.equal(String(url),'/api/ciudadano/direccion-aproximada');enviado=init;return Response.json({exito:true,datos:datos()});}});
 assert.deepEqual(JSON.parse(enviado!.body as string),{latitud:20.46,longitud:-97.08,confirmada:true});assert.equal(new Headers(enviado!.headers).get('authorization'),'Bearer token-ficticio');
 assert.equal(r.direccion?.calle,'Calle de prueba');assert.deepEqual(punto,[-97.08,20.46]);
});
for(const status of [401,429,503])test(`cliente trata HTTP ${status}`,async()=>{
 await assert.rejects(consultarDireccion('token',punto,{transportar:async()=>Response.json({exito:false,codigo:'FIXTURE'},{status,headers:{'Retry-After':'30'}})}),e=>e instanceof ErrorDireccion&&e.status===status&&(status!==429||e.reintentarEn===30));
});
test('sin token o punto inválido no hay HTTP',async()=>{
 let n=0;const transportar=async()=>{n++;return Response.json({});};
 await assert.rejects(consultarDireccion('',punto,{transportar}));await assert.rejects(consultarDireccion('token',[200,20],{transportar}));assert.equal(n,0);
});
test('timeout y cancelación terminan aunque el transporte no responda',async()=>{
 await assert.rejects(consultarDireccion('token',punto,{timeoutMs:10,transportar:()=>new Promise(()=>{})}),e=>e instanceof ErrorDireccion&&e.codigo==='TIMEOUT');
 const c=new AbortController();c.abort();let n=0;await assert.rejects(consultarDireccion('token',punto,{signal:c.signal,transportar:async()=>{n++;return Response.json({});}}));assert.equal(n,0);
});
for(const mal of [{}, {exito:true,datos:{...datos(),aproximada:false}}, {exito:true,datos:{...datos(),expira_en:'ayer'}}])test('cliente rechaza contrato inválido',async()=>{
 await assert.rejects(consultarDireccion('token',punto,{transportar:async()=>Response.json(mal)}),e=>e instanceof ErrorDireccion&&e.codigo==='RESPUESTA_INVALIDA');
});
test('acepta sin dirección y campos parciales sin completarlos',async()=>{
 const d=datos();d.direccion=null as never;const r=await consultarDireccion('token',punto,{transportar:async()=>Response.json({exito:true,datos:d})});assert.equal(r.direccion,null);
});
