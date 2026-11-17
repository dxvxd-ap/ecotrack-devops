import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crearEstadoDireccion} from '../src/servicios/estado-direccion.ts';
import {ErrorDireccion,type ResultadoDireccion} from '../src/servicios/direccion.ts';
const a=[-97.08,20.46] as const,b=[-97.09,20.47] as const;
const resultado=(calle:string|null):ResultadoDireccion=>({proveedor:'geoapify',aproximada:true,direccion:calle?{calle,numero:null,colonia:null,localidad:null,municipio:null,estado:null,pais:null}:null,consultado_en:new Date().toISOString(),expira_en:new Date(Date.now()+60000).toISOString(),atribucion:{proveedor:'Geoapify',url:'https://www.geoapify.com/',datos:'© OpenStreetMap contributors'}});
test('deduplica, comparte y reutiliza resultados del mismo punto',async t=>{
 let n=0;const e=crearEstadoDireccion(async()=> 'token',async()=>{n++;return resultado('Una calle');});t.after(e.limpiar);
 await Promise.all([e.consultar(a),e.consultar(a)]);await e.consultar(a);assert.equal(n,1);assert.equal(e.getSnapshot(a).estado,'lista');assert.equal(e.getSnapshot(b).resultado,null);
});
test('punto anterior y sesión anterior no restauran texto en el nuevo punto',async t=>{
 let resolver!:(r:ResultadoDireccion)=>void;
 const viejo=crearEstadoDireccion(async()=> 'token',()=>new Promise(r=>{resolver=r;}));const nuevo=crearEstadoDireccion(async()=> 'otro',async()=>resultado('Nueva calle'));t.after(viejo.limpiar);t.after(nuevo.limpiar);
 const liberar=viejo.observar(a);await Promise.resolve();liberar();await Promise.resolve();viejo.limpiar();
 await nuevo.consultar(b);resolver(resultado('Antigua'));await Promise.resolve();assert.equal(nuevo.getSnapshot(b).resultado?.direccion?.calle,'Nueva calle');assert.equal(nuevo.getSnapshot(a).resultado,null);
});
test('errores no reintentan por montaje; 429 impide consultas de otro punto durante cooldown',async t=>{
 let n=0,ahora=Date.now();const e=crearEstadoDireccion(async()=> 'token',async()=>{n++;throw new ErrorDireccion(429,'CUOTA',30);},()=>ahora);t.after(e.limpiar);
 await e.consultar(a);await e.consultar(a);await e.consultar(b,true);assert.equal(n,1);assert.equal(e.getSnapshot(a).estado,'error');
 ahora+=31000;await e.consultar(a,true);assert.equal(n,2);
});
test('sin resultado tiene estado propio y puede caducar sin mostrar texto anterior',async t=>{
 let ahora=Date.now(),n=0;const e=crearEstadoDireccion(async()=> 'token',async()=>{n++;return resultado(null);},()=>ahora);t.after(e.limpiar);
 await e.consultar(a);assert.equal(e.getSnapshot(a).estado,'sin_direccion');ahora+=61000;assert.equal(e.getSnapshot(a).resultado,null);await e.consultar(a);assert.equal(n,2);
});
test('no solicita token ni dirección hasta observar o consultar un punto',async t=>{
 let n=0;const e=crearEstadoDireccion(async()=>{n++;return'token';},async()=>resultado('Calle'));t.after(e.limpiar);e.getSnapshot(a);assert.equal(n,0);
});
test('expiración notifica a vistas activas y exige un resultado nuevo',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.UTC(2026,10,16)});
 let n=0,avisos=0;
 const e=crearEstadoDireccion(async()=> 'token',async()=>{n++;return resultado(`Calle ${n}`);});
 t.after(e.limpiar);const desuscribir=e.subscribe(()=>avisos++);t.after(desuscribir);
 const liberar=e.observar(a);t.after(liberar);await e.consultar(a);
 assert.equal(e.getSnapshot(a).resultado?.direccion?.calle,'Calle 1');const antes=avisos;
 t.mock.timers.tick(60001);assert.equal(e.getSnapshot(a).estado,'inicial');assert.ok(avisos>antes);
 await e.consultar(a,true);assert.equal(n,2);assert.equal(e.getSnapshot(a).resultado?.direccion?.calle,'Calle 2');
});
test('limpiar aborta peticiones y una respuesta tardía no repuebla la sesión',async()=>{
 let resolver!:(r:ResultadoDireccion)=>void;let signal:AbortSignal|undefined;
 const e=crearEstadoDireccion(async()=> 'token',async(_t,_p,opciones)=>{signal=opciones?.signal;return new Promise(r=>{resolver=r;});});
 const consulta=e.consultar(a);await Promise.resolve();e.limpiar();assert.equal(signal?.aborted,true);
 resolver(resultado('Antigua'));await consulta;assert.equal(e.getSnapshot(a).resultado,null);
});
test('remontaje inmediato comparte la consulta sin cancelarla',async t=>{
 let n=0;const e=crearEstadoDireccion(async()=> 'token',async()=>{n++;return resultado('Compartida');});t.after(e.limpiar);
 const primero=e.observar(a);primero();const segundo=e.observar(a);t.after(segundo);
 await e.consultar(a);assert.equal(n,1);assert.equal(e.getSnapshot(a).estado,'lista');
});
