// DOM y Leaflet reales; sin Clerk, Atlas, API remota ni cartografía.
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const server=await createServer({root,configFile:false,esbuild:{jsx:'automatic'},resolve:{alias:{'@':resolve(root,'src'),'next/dynamic':'stub-next-dynamic'}},plugins:[{name:'stub-mapa-en-formulario',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url==='/__prueba'){res.setHeader('Content-Type','text/html');res.end('<html><body></body></html>');}else next();});},resolveId(id){if(id==='/__fixture.jsx')return '\0fixture';if(id==='stub-next-dynamic')return '\0mapa-stub';},load(id){if(id==='\0fixture')return `import React from 'react';import{createRoot}from'react-dom/client';import Page from '/src/app/dashboard/rutas/page.tsx';export function mount(){document.body.innerHTML='<div id="root"></div>';createRoot(document.getElementById('root')).render(React.createElement(Page));}`;if(id==='\0mapa-stub')return 'export default function(){return ()=>null;}';}}],server:{host:'127.0.0.1',port:4193,strictPort:true}});
let browser;
try{
 await server.listen();browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const page=await browser.newPage();
 await page.goto('http://127.0.0.1:4193/__prueba');
 const resultado=await page.evaluate(async()=>{
  const h=await import('/src/lib/rutas_mapa.ts');const L=await import('/node_modules/leaflet/dist/leaflet-src.esm.js');
  const mal='<img src=x onerror="window.xssEjecutado=true">';window.xssEjecutado=false;
  const popup=h.crearPopupRuta({nombre:mal,id_ruta:'<svg onload="window.xssEjecutado=true">',distancia_estimada_km:3});document.body.append(popup);
  const normal=h.crearPopupRuta({nombre:'Ruta normal',id_ruta:'R1',distancia_estimada_km:2});
  const geo={type:'MultiLineString',coordinates:[[[0,0],[1,1]],[[10,10],[11,11],[12,12]]]};const antes=JSON.stringify(geo);const segmentos=h.segmentosRuta(geo);const linea=L.polyline(segmentos);
  const simple={type:'LineString',coordinates:[[0,0],[1,1],[2,2]]};
  return {inseguro:popup.querySelectorAll('img,svg,script').length,ataqueComoTexto:popup.textContent.includes(mal),ejecutado:window.xssEjecutado,nombreNormal:normal.querySelector('strong').textContent,segmentos:linea.getLatLngs().map(s=>s.map(p=>[p.lng,p.lat])),originalIntacto:antes===JSON.stringify(geo),bloqueoMulti:!h.puedeEditarGeometria(geo),simpleEditable:h.puedeEditarGeometria(simple),simpleRetorno:h.segmentosRuta(simple)[0].map(([lat,lon])=>[lon,lat]),bloqueo3D:!h.puedeEditarGeometria({type:'LineString',coordinates:[[0,0,2],[1,1,3]]})};
 });
 assert.equal(resultado.inseguro,0);assert.equal(resultado.ejecutado,false);assert.equal(resultado.ataqueComoTexto,true);assert.equal(resultado.nombreNormal,'Ruta normal');console.log('PASS popup DOM: HTML literal, sin nodos ejecutables, nombre normal conservado');
 assert.deepEqual(resultado.segmentos,[[[0,0],[1,1]],[[10,10],[11,11],[12,12]]]);assert.equal(resultado.originalIntacto,true);console.log('PASS Leaflet: segmentos completos, orden y geometría original intactos');
 assert.equal(resultado.bloqueoMulti,true);assert.equal(resultado.bloqueo3D,true);assert.equal(resultado.simpleEditable,true);assert.deepEqual(resultado.simpleRetorno,[[0,0],[1,1],[2,2]]);console.log('PASS edición: restricción explícita y round-trip LineString sin pérdida');
 let escrituras=0;const datos=[{_id:'000000000000000000000001',id_ruta:'MULTI',nombre:'Ruta multi',trazado_geojson:{type:'MultiLineString',coordinates:[[[0,0],[1,1]],[[10,10],[11,11]]]}},{_id:'000000000000000000000002',id_ruta:'SIMPLE',nombre:'Ruta simple',trazado_geojson:{type:'LineString',coordinates:[[0,0],[1,1]]}}];
 await page.route('**/api/rutas',r=>{if(r.request().method()!=='GET')escrituras++;return r.fulfill({json:{exito:true,datos}});});
 await page.evaluate(async()=>{const f=await import('/__fixture.jsx');f.mount();});
 await page.getByText('Ruta multi',{exact:true}).waitFor();await page.getByTitle('Editar ruta y modificar trazado').first().click();await page.getByText(/no permite editar MultiLineString/).waitFor();assert.equal(await page.locator('form').count(),0);assert.equal(escrituras,0);console.log('PASS formulario real: MultiLineString no entra en edición ni genera escritura');
 await page.getByTitle('Editar ruta y modificar trazado').nth(1).click();await page.locator('form').waitFor();assert.equal(await page.locator('input').first().inputValue(),'SIMPLE');assert.equal(escrituras,0);console.log('PASS formulario real: LineString entra en edición con código estable');
}finally{await browser?.close();await server.close();}
