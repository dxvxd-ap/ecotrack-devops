import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServicioReportes, validarReporte, ErrorReportes, type EntradaReporte } from '../src/servicios/reportes-r1.ts';
import { crearEnvioReporte } from '../src/servicios/envio-reporte.ts';
const id='000000000000000000000001',clave='4b80d965-625c-4cad-a7a4-5ace8313e1db';
const entrada:EntradaReporte={tipo_incidencia:'OTRO',descripcion:'Basura acumulada en el parque.',domicilio_referencia:' Parque ',latitud:20,longitud:-97,origen_ubicacion:'manual',confirmada:true,ruta_id:null};
const acuse={id,folio:'REC-4b80d965-625c-4cad-a7a4-5ace8313e1db',recibido_en:'2026-11-17T12:00:00.000Z',estado_inicial:'PENDIENTE' as const};
const resumen={id,folio:acuse.folio,tipo_incidencia:'OTRO',estado:'PENDIENTE',fecha_reporte:acuse.recibido_en};
test('valida y normaliza sin exigir teléfono ni domicilio registrado',()=>{const d=validarReporte({...entrada,descripcion:'  Basura junto al cafe\u0301.\r\nRevisar.  '});assert.equal(d.descripcion,'Basura junto al café.\nRevisar.');assert.equal(d.domicilio_referencia,'Parque');assert.equal(Object.hasOwn(d,'ciudadano_telefono'),false);});
for(const d of [{confirmada:false},{latitud:91},{longitud:'-97'},{descripcion:'corta'},{domicilio_referencia:' '},{tipo_incidencia:'NUEVA'},{ciudadano_telefono:'abc'},{ruta_id:'R1'},{estado:'ATENDIDO'},{fotografia_url:''}])test('rechaza entrada '+JSON.stringify(d),()=>assert.throws(()=>validarReporte({...entrada,...d})));
test('servicio usa token, contrato R1, no-store y la misma clave; minimiza DTO',async()=>{
 const calls:{url:string;init?:RequestInit}[]=[];
 const api=crearServicioReportes({origen:'',transportar:async(url,init)=>{calls.push({url:String(url),init});return Response.json({exito:true,datos:{...acuse,hash:'SECRETO',ciudadano_telefono:'PRIVADO'}},{status:201});}});
 assert.deepEqual(await api.crear('token',entrada,clave),acuse);const h=new Headers(calls[0].init?.headers);assert.equal(h.get('Authorization'),'Bearer token');assert.equal(h.get('EcoTrack-Contrato'),'reclamos-r1');assert.equal(h.get('Idempotency-Key'),clave);assert.equal(calls[0].init?.cache,'no-store');assert.equal(calls[0].url,'/api/v1/reclamos');
});
test('sin token no consulta al servidor',async()=>{let n=0;const a=crearServicioReportes({origen:'',transportar:async()=>{n++;throw Error();}});await assert.rejects(a.listar(''),e=>e instanceof ErrorReportes&&e.status===401);assert.equal(n,0);});
test('listado propio, detalle y recuperación utilizan endpoints reales y no propagan notas',async()=>{
 const calls:string[]=[];const api=crearServicioReportes({origen:'',transportar:async(url)=>{const s=String(url);calls.push(s);return Response.json({exito:true,datos:s.includes('/operaciones/')?acuse:s.includes('?id=')?[{...resumen,descripcion:'Detalle original',domicilio_referencia:'Parque',ubicacion:{type:'Point',coordinates:[-97,20]},ruta_id:null,origen_ubicacion:'manual',respuesta_publica:'Se atendió tu reporte.',version:2,fecha_actualizacion:null,fecha_resolucion:null,solucion_notas:'PRIVADA'}]:[{...resumen,contacto:{telefono:'PRIVADO'}}]});}});
 assert.equal((await api.listar('token')).length,1);const d=await api.detalle('token',id);assert.equal(d?.respuesta_publica,'Se atendió tu reporte.');assert.doesNotMatch(JSON.stringify(d),/PRIVADA|contacto/);assert.deepEqual(await api.recuperar('token',clave),acuse);assert.equal(calls[1],'/api/v1/reclamos?id='+id);
});
for(const [status,codigo,incierto] of [[400,'ENTRADA_INVALIDA',false],[401,'SIN_SESION',false],[403,'ACCESO_DENEGADO',false],[409,'CLAVE_REUTILIZADA',true],[503,'INDICE_NO_DISPONIBLE',false],[503,'RESULTADO_INCIERTO',true]] as const)test(`HTTP ${status} ${codigo}`,async()=>{
 const a=crearServicioReportes({origen:'',transportar:async()=>Response.json({exito:false,codigo,mensaje:'mensaje interno no mostrar'},{status})});await assert.rejects(a.crear('token',entrada,clave),e=>e instanceof ErrorReportes&&e.codigo===codigo&&e.incierto===incierto&&!e.message.includes('interno'));
});
test('timeout y respuesta de creación ilegible se tratan como incertidumbre',async()=>{
 for(const transportar of [(async(_url:unknown,init?:RequestInit)=>new Promise<Response>((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error('abort'))))) as typeof fetch,async()=>new Response('<html>',{status:201})]){
  const a=crearServicioReportes({origen:'',transportar,timeoutMs:5});await assert.rejects(a.crear('token',entrada,clave),e=>e instanceof ErrorReportes&&e.incierto);
 }
});
test('doble pulsación envía una sola intención y congela contenido original',async()=>{
 let n=0,terminar!:(x:typeof acuse)=>void;const cuerpos:EntradaReporte[]=[];
 const e=crearEnvioReporte({obtenerToken:async()=>'token',api:{crear:async(_t,d)=>{n++;cuerpos.push(d);return new Promise(r=>terminar=r);},recuperar:async()=>acuse},crearClave:()=>clave,guardarClave:()=>{}});
 const a=e.enviar(entrada);const b=e.enviar({...entrada,descripcion:'Otro texto distinto.'});await new Promise(r=>setTimeout(r,0));assert.equal(n,1);terminar(acuse);await Promise.all([a,b]);assert.equal(cuerpos[0].descripcion,entrada.descripcion);assert.equal(e.getSnapshot().fase,'confirmado');
});
test('resultado incierto reintenta la misma clave/cuerpo y no permite editar intención',async()=>{
 const calls:{clave:string;cuerpo:EntradaReporte}[]=[];let n=0;
 const e=crearEnvioReporte({obtenerToken:async()=>'t',api:{crear:async(_t,d,k)=>{calls.push({clave:k,cuerpo:d});if(!n++)throw new ErrorReportes(503,'RESULTADO_INCIERTO',true);return acuse;},recuperar:async()=>acuse},crearClave:()=>clave,guardarClave:()=>{}});
 await e.enviar(entrada);assert.equal(e.getSnapshot().fase,'incierto');await e.enviar({...entrada,descripcion:'Cambiar contenido no permitido.'});assert.equal(calls.length,1);await e.reintentar();assert.deepEqual(calls[0],calls[1]);assert.equal(e.getSnapshot().fase,'confirmado');
});
test('recarga conserva solo clave: 404 no habilita nueva clave ni reenvía sin contenido',async()=>{
 let n=0;const guardado:(string|null)[]=[];
 const e=crearEnvioReporte({claveInicial:clave,obtenerToken:async()=>'t',api:{crear:async()=>{n++;return acuse;},recuperar:async()=>{throw new ErrorReportes(404,'OPERACION_NO_ENCONTRADA',false);}},guardarClave:k=>guardado.push(k),crearClave:()=>{throw Error('No generar otra clave');}});
 await e.recuperar();await e.reintentar();await e.enviar(entrada);assert.equal(n,0);assert.equal(e.getSnapshot().clave,clave);assert.equal(e.getSnapshot().conContenido,false);assert.equal(guardado.length,0);
});
test('recupera acuse original y descarta respuestas tardías al terminar sesión',async()=>{
 let resolver!:(a:typeof acuse)=>void;const e=crearEnvioReporte({claveInicial:clave,obtenerToken:async()=>'t',api:{crear:async()=>acuse,recuperar:async()=>new Promise(r=>resolver=r)},guardarClave:()=>{}});
 const p=e.recuperar();await new Promise(r=>setTimeout(r,0));e.limpiar();resolver(acuse);await p;assert.notEqual(e.getSnapshot().fase,'confirmado');
 const b=crearEnvioReporte({claveInicial:clave,obtenerToken:async()=>'t',api:{crear:async()=>acuse,recuperar:async()=>acuse},guardarClave:()=>{}});await b.recuperar();assert.deepEqual(b.getSnapshot().acuse,acuse);
});
test('teléfono permitido y límite de bytes real antes de iniciar el envío',()=>{
 assert.equal(validarReporte({...entrada,ciudadano_telefono:' +52 (229) 123-4567 '}).ciudadano_telefono,'+52 (229) 123-4567');
 assert.throws(()=>validarReporte({...entrada,descripcion:'🚛'.repeat(4000),domicilio_referencia:'á'.repeat(500)}),e=>e instanceof ErrorReportes&&e.status===413);
 assert.throws(()=>validarReporte({...entrada,origen_ubicacion:null}));
});
test('índice ausente en primer intento permite corregir; después de incertidumbre nunca borra la operación',async()=>{
 let modo='indice',n=0;const guardadas:(string|null)[]=[];
 const e=crearEnvioReporte({obtenerToken:async()=>'t',api:{crear:async()=>{throw new ErrorReportes(503,modo==='indice'?'INDICE_NO_DISPONIBLE':'RESULTADO_INCIERTO',modo!=='indice');},recuperar:async()=>acuse},crearClave:()=>{n++;return clave;},guardarClave:k=>guardadas.push(k)});
 await e.enviar(entrada);assert.equal(e.getSnapshot().fase,'rechazado');assert.equal(e.getSnapshot().clave,null);assert.equal(n,1);
 modo='incierto';await e.enviar(entrada);assert.equal(n,2);modo='indice';await e.reintentar();assert.equal(e.getSnapshot().fase,'incierto');assert.equal(e.getSnapshot().clave,clave);assert.equal(n,2);
});
test('acceso ciudadano comprobado por GET protegido aunque no tenga domicilio',async()=>{
 const calls:RequestInit[]=[];const a=crearServicioReportes({origen:'',transportar:async(_u,init)=>{calls.push(init!);return Response.json({exito:true,datos:null});}});
 assert.equal(await a.verificarAcceso('t'),null);assert.equal(calls[0].method,'GET');
 const b=crearServicioReportes({origen:'',transportar:async()=>Response.json({exito:false,codigo:'ACCESO_DENEGADO'},{status:403})});await assert.rejects(b.verificarAcceso('admin'),e=>e instanceof ErrorReportes&&e.status===403);
 assert.equal(validarReporte({...entrada,ruta_id:'ABCDEF0123456789ABCDEF01'}).ruta_id,'abcdef0123456789abcdef01');
});

test('cambiar de sesión aborta un envío activo y descarta contenido y acuse tardío', async () => {
  let resolver!: (v: typeof acuse) => void;
  let señal: AbortSignal | undefined;
  let avisar!: () => void;
  const iniciada = new Promise<void>(resolve => { avisar = resolve; });
  const envio = crearEnvioReporte({
    api: {
      crear: (_token, _cuerpo, _clave, signal) => new Promise(resolve => {
        señal = signal;
        resolver = resolve;
        avisar();
      }),
      recuperar: async () => acuse,
    },
    obtenerToken: async () => 'fixture',
    guardarClave() {},
    crearClave: () => '4b80d965-625c-4cad-a7a4-5ace8313e1db',
  });
  const pendiente = envio.enviar(entrada);
  await iniciada;
  envio.limpiar();
  assert.equal(señal?.aborted, true);
  resolver(acuse);
  await pendiente;
  assert.equal(envio.getSnapshot().conContenido, false);
  assert.equal(envio.getSnapshot().acuse, null);
});
