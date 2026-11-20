// React, servicios, validación y CSS reales; solo Clerk, tiles y transportes HTTP ficticios.
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const origin = 'https://ecotrack.test';
const bundle = await build({
 configFile: false,
 base: '/eco/',
 plugins: [react(), {
  name: 'pwa-sin-service-worker-en-prueba',
  resolveId(id) {
   if (id === 'virtual:pwa-register') return '\0pwa-prueba';
  },
  load(id) {
   if (id === '\0pwa-prueba') return 'export function registerSW() { return () => Promise.resolve(); }';
  },
 }],
 define: {
  __ANDROID_BUILD__: 'false',
  'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify('pk_test_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk'),
  'import.meta.env.VITE_API_ORIGIN': JSON.stringify(''),
  'import.meta.env.DEV': 'true',
 },
 resolve: { alias: { '@clerk/react': resolve('tests/fixtures/clerk.tsx') } },
 build: { write: false },
});
const assets = new Map(bundle.output.map(file => [file.fileName, file.type === 'chunk' ? file.code : file.source]));
const contentTypes = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png' };
let browser, checks = 0;
try {
 browser = await chromium.launch({
  executablePath: process.env.ECOTRACK_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
 });
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',permissions:['geolocation'],geolocation:{latitude:20.456,longitude:-97.087,accuracy:15}});const page=await context.newPage();page.on('dialog',d=>d.accept());
 const errores=[];page.on('pageerror',e=>errores.push(e.name+':'+e.message));
 const datos=[],posts=[],domicilioWrites=[],listas=[],reportesHeredados=[];let modo='ok',gate=200,ocultar=false;
 const check=(nombre)=>{checks++;console.log('PASS',nombre);};
 await page.route('**/*', route => route.abort());
 await page.route(origin + '/eco/**', route => {
  const file = new URL(route.request().url()).pathname.slice('/eco/'.length);
  const body = assets.get(file);
  if (body === undefined) return route.fulfill({ status: 404 });
  return route.fulfill({ body, contentType: contentTypes[file.split('.').at(-1)] || 'application/octet-stream' });
 });
 await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'fondo',type:'background',paint:{'background-color':'#e8eee9'}}]}}));
 await page.route('**/api/**',async r=>{
  const req=r.request(),u=new URL(req.url()),actor=(req.headers().authorization||'').replace(/^Bearer /,'');
  if(u.pathname==='/api/reportes')reportesHeredados.push(req.method());
  if(u.pathname==='/api/rutas'){
   const trazado_geojson={type:'LineString',coordinates:[[-97.09,20.45],[-97.08,20.46]]};
   return r.fulfill({json:{exito:true,datos:[
    {_id:'0123456789abcdef01234567',nombre:'Ruta persistida',trazado_geojson},
    {id_ruta:'abcdef0123456789abcdef01',nombre:'Ruta sin persistir',trazado_geojson},
   ]}});
  }
  if(u.pathname==='/api/ciudadano/domicilio'){if(req.method()!=='GET')domicilioWrites.push(req.method());return r.fulfill({status:gate,json:gate===200?{exito:true,datos:actor==='ciudadano-con-domicilio'?{ubicacion:{type:'Point',coordinates:[-97.09,20.45]},tipo_seleccion:'manual',version:0,asignacion:{estado:'pendiente'}}:null}:{exito:false,codigo:gate===403?'ACCESO_DENEGADO':'CUENTA_EN_CONFLICTO'}});}
  if(u.pathname.includes('/reclamos/operaciones/')){const d=datos.find(d=>d.owner===actor&&d.key===u.pathname.split('/').pop());return r.fulfill({status:d&&!ocultar?200:404,json:d&&!ocultar?{exito:true,datos:d.acuse}:{exito:false,codigo:'OPERACION_NO_ENCONTRADA'}});}
  if(u.pathname==='/api/v1/reclamos'&&req.method()==='POST'){
   const body=req.postDataJSON(),key=req.headers()['idempotency-key'];posts.push({body,key,actor});assert.equal(req.headers()['ecotrack-contrato'],'reclamos-r1');
   if(modo==='400')return r.fulfill({status:400,json:{exito:false,codigo:'ENTRADA_INVALIDA'}});
   if(modo==='indice')return r.fulfill({status:503,json:{exito:false,codigo:'INDICE_NO_DISPONIBLE'}});
   let d=datos.find(d=>d.owner===actor&&d.key===key),nuevo=!d;
   if(!d){const id=(datos.length+1).toString(16).padStart(24,'0');d={owner:actor,key,body,acuse:{id,folio:'REC-'+key,recibido_en:'2026-11-17T12:00:00.000Z',estado_inicial:'PENDIENTE'}};datos.push(d);}
   if(modo==='incierto')return r.fulfill({status:503,json:{exito:false,codigo:'RESULTADO_INCIERTO'}});
   return r.fulfill({status:nuevo?201:200,json:{exito:true,datos:d.acuse}});
  }
  if(u.pathname==='/api/v1/reclamos'){
   listas.push(actor);const propias=datos.filter(d=>d.owner===actor&&(!u.searchParams.has('id')||d.acuse.id===u.searchParams.get('id')));
   return r.fulfill({json:{exito:true,datos:propias.map(d=>({id:d.acuse.id,folio:d.acuse.folio,tipo_incidencia:d.body.tipo_incidencia,estado:'ATENDIDO',fecha_reporte:d.acuse.recibido_en,...(u.searchParams.has('id')?{descripcion:d.body.descripcion,domicilio_referencia:d.body.domicilio_referencia,ubicacion:{type:'Point',coordinates:[d.body.longitud,d.body.latitud]},ruta_id:null,origen_ubicacion:d.body.origen_ubicacion,respuesta_publica:'El municipio atendió esta incidencia.',version:2,fecha_actualizacion:null,fecha_resolucion:null,solucion_notas:'NOTA INTERNA PRIVADA',contacto:{telefono:'PRIVADO'},operacion:{hash:'HASH PRIVADO'}}:{})}))}});
  }
  return r.fulfill({status:503,json:{exito:false,codigo:'SERVICIO_NO_DISPONIBLE'}});
 });
 const reportes=()=>page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:'Reportes',exact:true}).click();
 const nuevo=()=>page.getByRole('button',{name:'Nuevo reporte',exact:true}).click();
 const completar=async()=>{await page.getByLabel('Tipo de incidencia',{exact:true}).selectOption('BASURA_TIRADA');await page.getByLabel('Descripción',{exact:true}).fill('Basura acumulada frente al parque de prueba.');await page.getByLabel('Referencia del lugar',{exact:true}).fill('Frente a la entrada del parque de prueba');};
 const confirmar=async()=>{await page.getByRole('checkbox',{name:/Confirmo que el punto/}).check();};
 const enviar=()=>page.locator('form.reporte-formulario').evaluate(f=>{f.requestSubmit();f.requestSubmit();});
 await page.goto(origin + '/eco/index.html');await reportes();await page.getByText('Aún no tienes reportes',{exact:true}).waitFor();assert.equal(posts.length,0);check('historial vacío sin inventar reportes ni exigir domicilio');
 await nuevo();await enviar();await page.getByRole('heading',{name:'Revisa estos datos'}).waitFor();assert.equal(posts.length,0);assert.equal(await page.locator('.reporte-resumen-errores').evaluate(e=>e===document.activeElement),true);check('formulario con resumen enfocado y validación accesible');
 const rutasFormulario=page.locator('#reporte-ruta');
 await rutasFormulario.getByRole('option',{name:'Ruta persistida'}).waitFor({state:'attached'});
 assert.deepEqual(await rutasFormulario.locator('option').allTextContents(),['No indicar una ruta','Ruta persistida']);
 await rutasFormulario.selectOption('0123456789abcdef01234567');
 check('el formulario solo ofrece rutas con identificador persistido');
 await completar();await enviar();assert.equal(posts.length,0);await page.getByText('Elige el punto y confirma explícitamente la ubicación.',{exact:true}).first().waitFor();check('no envía ubicación sin confirmación explícita');
 await page.getByText('Escribir coordenadas manualmente',{exact:true}).click();await page.getByLabel('Latitud',{exact:true}).fill('20.46');await page.getByLabel('Longitud',{exact:true}).fill('-97.08');assert.equal(await page.getByRole('checkbox',{name:/Confirmo que el punto/}).isDisabled(),true);await page.getByRole('button',{name:'Ubicar coordenadas',exact:true}).click();check('coordenadas manuales deben aplicarse al mapa antes de confirmar');
 await page.getByRole('button',{name:'Usar mi ubicación',exact:true}).click();await page.getByText(/precisión aproximada ±15 m/).waitFor();await confirmar();await enviar();await page.getByText('Tu reporte quedó registrado',{exact:true}).waitFor();assert.equal(posts.length,1);assert.equal(posts[0].body.confirmada,true);assert.equal(posts[0].body.ruta_id,'0123456789abcdef01234567');assert.equal(posts[0].body.origen_ubicacion,'gps');assert.equal(posts[0].body.latitud,20.456);assert.equal(Object.hasOwn(posts[0].body,'ciudadano_telefono'),false);check('GPS confirmado, teléfono opcional y doble pulsación sin duplicados');
 await page.getByRole('button',{name:'Ver mi reporte',exact:true}).click();await page.getByText('El municipio atendió esta incidencia.',{exact:true}).waitFor();assert.doesNotMatch(await page.locator('.reportes-panel').innerText(),/NOTA INTERNA|HASH PRIVADO|PRIVADO/);check('detalle propio muestra respuesta pública sin notas ni datos administrativos');
 await nuevo();await completar();await confirmar();modo='400';await enviar();await page.getByText('Revisa los datos y confirma la ubicación del reporte.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Descripción',{exact:true}).inputValue(),'Basura acumulada frente al parque de prueba.');check('error HTTP definido conserva formulario para corregir');
 modo='indice';await enviar();await page.getByText('El municipio todavía no tiene habilitado el registro de reportes. Inténtalo más tarde.',{exact:true}).waitFor();check('índices pendientes: error seguro sin asumir backend habilitado');
 modo='incierto';ocultar=true;await enviar();await page.getByRole('heading',{name:'Vamos a comprobar tu envío',exact:true}).waitFor();const pendiente=await page.getByLabel('Código para recuperar esta operación').inputValue(),original=posts.at(-1);const pendienteStorage=await page.evaluate(()=>JSON.stringify({...sessionStorage}));assert.ok(pendienteStorage.includes(pendiente));assert.doesNotMatch(pendienteStorage,/Basura acumulada|parque de prueba|20\.456|-97\.087|ciudadano-prueba-a/);await page.getByRole('button',{name:'Consultar confirmación',exact:true}).click();await page.getByText('Todavía no hay una confirmación visible. Esto no demuestra que el envío haya fallado.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Código para recuperar esta operación').inputValue(),pendiente);check('resultado incierto y 404 mantienen la misma operación');
 modo='ok';ocultar=false;await page.getByRole('button',{name:'Reintentar el mismo envío',exact:true}).click();await page.getByText('Tu reporte quedó registrado',{exact:true}).waitFor();assert.equal(posts.at(-1).key,original.key);assert.deepEqual(posts.at(-1).body,original.body);check('reintento conserva clave y contenido exactos');
 await page.getByRole('button',{name:'Crear otro reporte',exact:true}).click();await completar();await confirmar();modo='incierto';await enviar();await page.getByRole('heading',{name:'Vamos a comprobar tu envío',exact:true}).waitFor();const recarga=await page.getByLabel('Código para recuperar esta operación').inputValue();await page.reload();await reportes();await page.getByLabel('Código para recuperar esta operación').waitFor();assert.equal(await page.getByLabel('Código para recuperar esta operación').inputValue(),recarga);assert.equal(await page.getByRole('button',{name:'Reintentar el mismo envío',exact:true}).count(),0);modo='ok';await page.getByRole('button',{name:'Consultar confirmación',exact:true}).click();await page.getByText('Tu reporte quedó registrado',{exact:true}).waitFor();check('recarga recupera acuse por UUID sin persistir ni reenviar coordenadas');
 const storage=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));
 assert.match(storage.local.ecotrack_push_token,/^ExponentPushToken\[/);
 delete storage.local.ecotrack_push_token;
 assert.doesNotMatch(JSON.stringify(storage),/Basura acumulada|20\.456|-97\.087|parque de prueba|ciudadano-prueba-a|token/);check('sin datos personales ni formulario en almacenamiento');
 await page.evaluate(()=>window.cambiarUsuario('ciudadano-prueba-b'));await page.getByText('Aún no tienes reportes',{exact:true}).waitFor();assert.doesNotMatch(await page.locator('.reportes-panel').innerText(),/REC-4b|Basura acumulada/);check('cambio de identidad limpia historial, detalle y operación en memoria');
 await nuevo();
 await page.getByLabel('Descripción',{exact:true}).fill('Borrador privado que debe desaparecer.');
 await page.evaluate(()=>window.cambiarUsuario('ciudadano-prueba-c'));
 await page.getByText('Aún no tienes reportes',{exact:true}).waitFor();
 await nuevo();
 assert.equal(await page.getByLabel('Descripción',{exact:true}).inputValue(),'');
 check('cambiar de cuenta elimina el borrador sin enviar');
 await page.evaluate(()=>window.cambiarUsuario(null));await page.getByText('Tu cuenta, tus reportes',{exact:true}).waitFor();check('visitante sin sesión no ve historial ni formulario privado');
 gate=403;await page.evaluate(()=>window.cambiarUsuario('admin-no-ciudadano'));await page.getByText('No pudimos abrir tus reportes',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Enviar reporte',exact:true}).count(),0);assert.equal(listas.includes('admin-no-ciudadano'),false);check('cuenta no ciudadana no consulta listado municipal');
 gate=200;await page.evaluate(()=>window.cambiarUsuario('ciudadano-con-domicilio'));await page.getByText('Aún no tienes reportes',{exact:true}).waitFor();await nuevo();await page.getByRole('button',{name:'Usar punto de mi domicilio',exact:true}).click();assert.equal(await page.getByRole('checkbox',{name:/Confirmo que el punto/}).isChecked(),false);check('domicilio solo como punto inicial, requiere confirmar sin guardar');
 for(const tema of ['light','dark']){await page.evaluate(t=>window.ecoCambiarTema(t),tema);await page.waitForTimeout(150);for(const w of [320,390,768]){await page.setViewportSize({width:w,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const css=await page.locator('#reporte-descripcion').evaluate(e=>({fondo:getComputedStyle(e).backgroundColor,letra:getComputedStyle(e).fontSize}));assert.equal(css.letra,'16px');assert.ok(css.fondo);}}
 await page.setViewportSize({width:390,height:844});await page.locator('.reporte-mapa').scrollIntoViewIfNeeded();assert.equal(await page.locator('.reporte-pin').isVisible(),true);check('claro/oscuro, 320/390/768 px sin desbordamiento ni zoom de campos');
 assert.equal(domicilioWrites.length,0);assert.deepEqual(errores,[]);check('sin escrituras de domicilio ni errores de React');
 assert.deepEqual(reportesHeredados,[]);
 check('la pestaña Reportes nunca consulta ni escribe en /api/reportes');
 console.log(JSON.stringify({checks,solicitudesCreacion:posts.length,reportesUnicos:datos.length}));
}finally{await browser?.close();}
