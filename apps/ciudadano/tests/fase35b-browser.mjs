// Clerk y HTTP simulados; App, Cuenta, DOM, estilos y MapLibre reales. Sin Atlas.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

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
 const errores=[];page.on('pageerror',e=>errores.push(e.message));
 const consultas=[],escrituras=[],retenidas=[];let retener=false,fallar=false;
 const resultado=(calle='Calle de prueba')=>({proveedor:'geoapify',aproximada:true,direccion:{calle,numero:'12',colonia:'Colonia de prueba',localidad:'Localidad de prueba',municipio:'Municipio de prueba',estado:'Veracruz',pais:'México'},consultado_en:new Date().toISOString(),expira_en:new Date(Date.now()+60000).toISOString(),atribucion:{proveedor:'Geoapify',url:'https://www.geoapify.com/',datos:'© OpenStreetMap contributors'}});
 let sync=0,gets=0,rutas=0,documentos=0,externas=0,retenerB=false,liberarB;
 let dto={ubicacion:{type:'Point',coordinates:[-97.08,20.46]},tipo_seleccion:'manual',version:1,fecha_confirmacion:'2026-01-01',fecha_creacion:'2026-01-01',fecha_actualizacion:'2026-01-01',asignacion:{estado:'pendiente',ruta_id:null,metodo:null,fecha_evaluacion:null,version_politica:null,huella_catalogo:null,motivo:null}};
 page.on('request',r=>{if(r.isNavigationRequest())documentos++;});
 await page.route('**/api/**',async route=>{
  const r=route.request(),url=r.url(),token=r.headers().authorization;
  if(url.endsWith('/direccion-aproximada')){
   consultas.push({body:r.postDataJSON(),token});
   if(retener){await new Promise(r=>retenidas.push(r));return route.fulfill({json:{exito:true,datos:resultado('RESPUESTA OBSOLETA')}}).catch(()=>{});}
   return route.fulfill({status:fallar?503:200,json:fallar?{exito:false}:{exito:true,datos:resultado()}});
  }
  if(url.endsWith('/sincronizar')){sync++;return route.fulfill({json:{exito:true,datos:{},mensaje:'fixture'}});}
  if(url.endsWith('/domicilio')){
   if(r.method()==='GET'){
    gets++; const datos=dto;
    if(retenerB&&token?.endsWith('ciudadano-prueba-b'))await new Promise(r=>{liberarB=r;});
    return route.fulfill({json:{exito:true,datos}});
   }
   const b=r.postDataJSON();escrituras.push(b);dto={...dto,ubicacion:{type:'Point',coordinates:[b.longitud,b.latitud]},version:dto.version+1};return route.fulfill({json:{exito:true,datos:dto}});
  }
  rutas++;return route.fulfill({json:{exito:true,datos:[{id_ruta:'fixture',nombre:'Ruta de prueba',trazado_geojson:{type:'LineString',coordinates:[[-97.09,20.45],[-97.08,20.46]]}}]}});
 });
 await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'fondo',type:'background',paint:{'background-color':'#e5e7eb'}}]}}));
 await page.route(/https:\/\/(?!tiles\.openfreemap\.org)/,r=>{externas++;return r.abort();});
 const fallos=[];
 async function check(nombre,fn){try{await fn();console.log('PASS',nombre);}catch(e){fallos.push(nombre);console.log('FAIL',nombre,e.message);}}
 await page.goto('http://127.0.0.1:4188/eco/index.html');
 await page.locator('.marcador-domicilio').waitFor();assert.equal(consultas.length,0);
 await page.getByRole('button',{name:'Cuenta',exact:true}).click();
 await page.locator('.domicilio-seccion').getByText('Calle de prueba 12',{exact:true}).waitFor();
 await check('Cuenta conserva localidad y municipio, aproximación y atribución',async()=>{
  const texto=await page.locator('.domicilio-seccion').innerText();
  for(const campo of ['Localidad de prueba','Municipio de prueba','Colonia de prueba','Veracruz','Dirección aproximada','Geoapify'])assert.ok(texto.includes(campo),campo);
  assert.equal(await page.locator('.domicilio-detalles').getAttribute('open'),null);assert.equal(consultas.length,1);
 });
 await page.getByRole('button',{name:'Inicio',exact:true}).click();
 await check('casa accesible comparte resultado y conserva cámara y fuentes',async()=>{
  const leer=()=>page.evaluate(async()=>{const m=window.mapasPrueba[0];return{centro:m.getCenter().toArray(),zoom:m.getZoom(),datos:await Promise.all(['rutas','vehiculos','ubicacion'].map(id=>m.getSource(id).getData()))};});
  const antes=await leer();
  await page.getByRole('button',{name:'Tu domicilio guardado',exact:true}).click({timeout:1500});
  await page.locator('.casa-direccion').getByText('Calle de prueba 12',{exact:true}).waitFor();
  assert.equal(consultas.length,1);assert.deepEqual(await leer(),antes);
  for(const theme of ['dark','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert.equal(await page.locator('.casa-direccion').evaluate(e=>e.scrollWidth<=e.clientWidth),true);}
 });
 await page.getByRole('button',{name:'Cuenta',exact:true}).click();
 await page.getByText('Cambiar domicilio',{exact:true}).click();
 await page.waitForFunction(()=>window.mapasPrueba.length===2&&window.mapasPrueba.at(-1).isStyleLoaded());
 await page.evaluate(()=>window.mapasPrueba.at(-1).jumpTo({center:[-97.11,20.49]}));
 assert.equal(consultas.length,1);console.log('PASS mover selector no consulta');
 retener=true;
 await page.getByRole('button',{name:'Confirmar la ubicación marcada en el centro del mapa'}).click();
 await page.waitForFunction(()=>document.querySelector('.selector-domicilio')?.textContent.includes('Consultando dirección'));
 await page.waitForTimeout(100);assert.equal(consultas.length,2);assert.deepEqual(consultas.at(-1).body,{latitud:20.49,longitud:-97.11,confirmada:true});
 await page.getByRole('button',{name:'Corregir en el mapa',exact:true}).click();
 await page.evaluate(()=>window.mapasPrueba.at(-1).jumpTo({center:[-97.12,20.50]}));
 retener=false;fallar=true;
 await page.getByRole('button',{name:'Confirmar la ubicación marcada en el centro del mapa'}).click();
 await page.getByText('La consulta de direcciones no está disponible por ahora.',{exact:true}).waitFor();
 for(const liberar of retenidas)liberar();
 await page.getByRole('button',{name:'Guardar domicilio',exact:true}).click();
 await page.getByText('Cambiar domicilio',{exact:true}).waitFor();
 assert.deepEqual([escrituras.at(-1).longitud,escrituras.at(-1).latitud],[-97.12,20.50]);assert.equal(await page.getByText('RESPUESTA OBSOLETA',{exact:false}).count(),0);
 console.log('PASS respuesta obsoleta ignorada y guardado permitido con 503');
 fallar=false;
 await page.evaluate(()=>window.cambiarUsuario('ciudadano-prueba-b'));
 await page.locator('.domicilio-seccion').getByText('Calle de prueba 12',{exact:true}).waitFor();
 assert.equal(consultas.at(-1).token,'Bearer ciudadano-prueba-b');console.log('PASS sesión nueva consulta sin reutilizar caché anterior');
 await page.getByRole('button',{name:'Inicio',exact:true}).click();
 await page.evaluate(()=>window.mapasPrueba[0].jumpTo({center:[-97.12,20.50]}));
 await page.locator('.marcador-domicilio').click();
 await page.locator('.casa-direccion').waitFor();
 await page.evaluate(()=>window.cambiarUsuario(null));
 await page.waitForFunction(()=>!document.querySelector('.marcador-domicilio'));
 assert.equal(await page.locator('.casa-direccion').count(),0);assert.deepEqual(errores,[]);console.log('PASS logout retira casa y dirección sin errores React');
 if(fallos.length)throw new Error(fallos.join(', '));
}finally{await browser?.close();await server.close();}
