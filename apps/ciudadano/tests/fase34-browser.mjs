// Clerk y HTTP simulados; App, Cuenta, DOM, estilos y MapLibre reales. Sin Atlas.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
const server=await createServer({
 define:{'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY':JSON.stringify('pk_test_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk'),'import.meta.env.VITE_API_ORIGIN':JSON.stringify(''),'import.meta.env.VITE_ENABLE_DEV_TOOLS':JSON.stringify('true')},
 resolve:{alias:{'@clerk/react':resolve('tests/fixtures/clerk.tsx')}},
 plugins:[{name:'inspeccionar-mapas-solo-pruebas',transformIndexHtml:{order:'pre',handler(){return [{tag:'script',attrs:{type:'module'},injectTo:'head-prepend',children:`import lib from 'maplibre-gl'; window.mapasPrueba=[];window.marcadoresPrueba=[];const agregar=lib.Marker.prototype.addTo;lib.Marker.prototype.addTo=function(...args){const resultado=agregar.apply(this,args);window.marcadoresPrueba.push(this);return resultado;};const quitar=lib.Marker.prototype.remove;lib.Marker.prototype.remove=function(){window.marcadoresPrueba=window.marcadoresPrueba.filter(m=>m!==this);return quitar.call(this);};const remover=lib.Map.prototype.remove;lib.Map.prototype.remove=function(){window.mapasPrueba=window.mapasPrueba.filter(m=>m!==this);return remover.call(this);};const original=lib.Map.prototype.addControl;lib.Map.prototype.addControl=function(...args){if(!window.mapasPrueba.includes(this))window.mapasPrueba.push(this);return original.apply(this,args);};`}];}}}],
 server:{host:'127.0.0.1',port:4188,strictPort:true}
});
let browser;
try {
 await server.listen();
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.grantPermissions(['geolocation']); await context.setGeolocation({longitude:-97.085,latitude:20.455,accuracy:10});
 const page=await context.newPage();
 let sync=0,gets=0,rutas=0,documentos=0,externas=0,retenerB=false,liberarB;
 let dto={ubicacion:{type:'Point',coordinates:[-97.08,20.46]},tipo_seleccion:'manual',version:1,fecha_confirmacion:'2026-01-01',fecha_creacion:'2026-01-01',fecha_actualizacion:'2026-01-01',asignacion:{estado:'pendiente',ruta_id:null,metodo:null,fecha_evaluacion:null,version_politica:null,huella_catalogo:null,motivo:null}};
 page.on('request',r=>{if(r.isNavigationRequest())documentos++;});
 await page.route('**/api/**',async route=>{
  const r=route.request(),url=r.url(),token=r.headers().authorization;
  if(url.endsWith('/sincronizar')){sync++;return route.fulfill({json:{exito:true,datos:{},mensaje:'fixture'}});}
  if(url.endsWith('/domicilio')){
   if(r.method()==='GET'){
    gets++; const datos=token?.endsWith('ciudadano-prueba-a')?dto:null;
    if(retenerB&&token?.endsWith('ciudadano-prueba-b'))await new Promise(r=>{liberarB=r;});
    return route.fulfill({json:{exito:true,datos}});
   }
   const b=r.postDataJSON();dto={...dto,ubicacion:{type:'Point',coordinates:[b.longitud,b.latitud]},version:dto.version+1};return route.fulfill({json:{exito:true,datos:dto}});
  }
  rutas++;return route.fulfill({json:{exito:true,datos:[{id_ruta:'fixture',nombre:'Ruta de prueba',trazado_geojson:{type:'LineString',coordinates:[[-97.09,20.45],[-97.08,20.46]]}}]}});
 });
 await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'fondo',type:'background',paint:{'background-color':'#e5e7eb'}}]}}));
 await page.route(/https:\/\/(?!tiles\.openfreemap\.org)/,r=>{externas++;return r.abort();});
 const fallos=[];
 async function check(nombre,fn){try{await fn();console.log('PASS',nombre);}catch(e){fallos.push(nombre);console.log('FAIL',nombre,e.message);}}
 await page.goto('http://127.0.0.1:4188/eco/index.html');
 await page.waitForFunction(()=>window.mapasPrueba?.[0]?.getSource('rutas'));
 await check('domicilio recuperado en mapa antes de visitar Cuenta, sin sincronizar',async()=>{
  await page.locator('.marcador-domicilio').waitFor({timeout:2000});assert.equal(sync,0);assert.equal(gets,1);
 });
 await page.evaluate(()=>window.cambiarCargaUsuario(true));
 await page.getByRole('button',{name:'Cuenta',exact:true}).click();
 await page.waitForTimeout(100);
 await check('carga temporal de useUser no borra el domicilio de una sesión identificada',async()=>{
  assert.equal(await page.locator('.marcador-domicilio').count(),1);assert.equal(sync,0);
 });
 if(process.env.ECOTRACK_REPRO_CARGA==='1'&&fallos.length)throw new Error(fallos.join(', '));
 await page.evaluate(()=>window.cambiarCargaUsuario(false));
 await page.getByText('Cambiar domicilio',{exact:true}).waitFor();
 const antes={sync,gets,rutas,documentos};
 await page.evaluate(()=>{window.primerMapa=window.mapasPrueba[0];window.primerMapa.jumpTo({center:[-97.10,20.48],zoom:15.25,bearing:12});window.panelCuenta=document.querySelector('[aria-label="Tu domicilio registrado"]');});
 await page.getByRole('radio',{name:'Oscuro: Siempre oscuro'}).click();
 await check('tema cambia sin navegación, refetch, sync o desmontaje de Cuenta',async()=>{
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  assert.deepEqual({sync,gets,rutas,documentos},antes);
  assert.equal(await page.evaluate(()=>window.panelCuenta===document.querySelector('[aria-label="Tu domicilio registrado"]')),true);
  assert.equal(await page.locator('[role="status"]').filter({hasText:/Sincronizando|Cargando/}).count(),0);
 });
 await check('tema conserva cámara e instancia, casa y fuentes GPS/vehículos/rutas',async()=>{
  await page.waitForFunction(()=>window.primerMapa.isStyleLoaded());
  const datos=await page.evaluate(()=>{const m=window.mapasPrueba[0];return {misma:m===window.primerMapa,centro:m.getCenter().toArray(),zoom:m.getZoom(),bearing:m.getBearing(),fuentes:['rutas','vehiculos','ubicacion'].every(id=>!!m.getSource(id)),casa:!!document.querySelector('.marcador-domicilio')};});
  assert.equal(datos.misma,true);assert.deepEqual(datos.centro,[-97.10,20.48]);assert.equal(datos.zoom,15.25);assert.equal(datos.bearing,12);assert.equal(datos.fuentes,true);assert.equal(datos.casa,true);
 });
 await check('tarjeta compacta tiene fallback honesto y detalles secundarios',async()=>{
  const texto=await page.locator('.domicilio-seccion').innerText();assert.match(texto,/Ubicación guardada/);assert.match(texto,/Confirmado por ti/);assert.doesNotMatch(texto,/COORDENADAS|VERSIÓN|TIPO/);assert.equal(externas,0);
 });
 await check('tarjeta móvil sin desbordamiento y CTA accesible sobre navegación',async()=>{
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const boton=await page.getByText('Cambiar domicilio',{exact:true}).boundingBox();
   const nav=await page.getByRole('navigation').boundingBox();
   assert.ok(boton.y+boton.height<=nav.y);
  }
 });
 await mkdir('artifacts',{recursive:true});
 await page.locator('.domicilio-seccion').screenshot({path:'artifacts/fase34-tarjeta-fixture.png'});
 // Automático: cambiar esquema del sistema sin navegación ni sincronización.
 await page.emulateMedia({colorScheme:'light'});
 await page.getByRole('radio',{name:'Automático: Según el sistema'}).click();
 await page.emulateMedia({colorScheme:'dark'});
 await check('automático sigue cambios del sistema sin recargar',async()=>{
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');assert.equal(sync,antes.sync);assert.equal(documentos,antes.documentos);
 });
 await page.getByRole('button',{name:'Inicio',exact:true}).click();
 await page.getByRole('button',{name:'Obtener mi ubicación',exact:true}).click();
 await check('casa y GPS coexisten en puntos independientes',async()=>{
  await page.waitForFunction(async()=>(await window.primerMapa.getSource('ubicacion').getData()).features.length===1);
  assert.deepEqual(await page.evaluate(async()=>(await window.primerMapa.getSource('ubicacion').getData()).features[0].geometry.coordinates),[-97.085,20.455]);
  assert.equal(await page.locator('.marcador-domicilio').count(),1);
 });
 await page.getByRole('button',{name:'Rutas',exact:true}).click();
 await page.getByRole('button',{name:'Ver demostración',exact:true}).click();
 await page.waitForFunction(async()=>(await window.primerMapa.getSource('vehiculos').getData()).features.length===1);
 const escena=await page.evaluate(async()=>({vehiculos:await window.primerMapa.getSource('vehiculos').getData(),gps:await window.primerMapa.getSource('ubicacion').getData(),rutas:await window.primerMapa.getSource('rutas').getData()}));
 await page.evaluate(()=>window.ecoCambiarTema('light'));
 await check('cambiar estilo conserva vehículo existente, GPS, ruta y casa',async()=>{
  await page.waitForFunction(()=>window.primerMapa.isStyleLoaded());
  const despues=await page.evaluate(async()=>({vehiculos:await window.primerMapa.getSource('vehiculos').getData(),gps:await window.primerMapa.getSource('ubicacion').getData(),rutas:await window.primerMapa.getSource('rutas').getData()}));
  assert.deepEqual(despues,escena);assert.equal(await page.locator('.marcador-domicilio').count(),1);
 });
 await page.getByRole('button',{name:'Cuenta',exact:true}).click();
 await page.getByText('Cambiar domicilio',{exact:true}).click();
 await page.evaluate(()=>window.mapasPrueba.at(-1).jumpTo({center:[-97.12,20.50]}));
 await page.getByRole('button',{name:'Confirmar la ubicación marcada en el centro del mapa'}).click();
 await page.getByRole('button',{name:'Guardar domicilio',exact:true}).click();
 await page.getByText('Cambiar domicilio',{exact:true}).waitFor();
 await check('casa se actualiza tras PUT y mantiene GPS',async()=>{
  // El marcador guarda posición en el motor; el elemento tiene transformación anclada al mapa.
  assert.equal(await page.locator('.marcador-domicilio').count(),1);
  assert.deepEqual(await page.evaluate(()=>window.marcadoresPrueba.find(m=>m.getElement().classList.contains('marcador-domicilio')).getLngLat().toArray()),[-97.12,20.50]);
  assert.match(await page.locator('.marcador-domicilio').getAttribute('style'),/translate/);
  assert.equal(await page.evaluate(async()=>(await window.primerMapa.getSource('ubicacion').getData()).features.length),1);
 });
 retenerB=true;
 await page.evaluate(()=>window.cambiarUsuario('ciudadano-prueba-b'));
 await check('cambio directo elimina casa anterior antes de responder GET',async()=>{
  await page.waitForFunction(()=>!document.querySelector('.marcador-domicilio'));assert.equal(await page.locator('.marcador-domicilio').count(),0);
 });
 await page.evaluate(()=>window.cambiarUsuario(null));
 if(liberarB)liberarB();
 await check('logout y respuesta tardía no restauran domicilio de otra sesión',async()=>{
  await page.getByText('Acceso de prueba',{exact:true}).waitFor();assert.equal(await page.locator('.marcador-domicilio').count(),0);
 });
 if(fallos.length)throw new Error(fallos.join(', '));
}finally{await browser?.close();await server.close();}
