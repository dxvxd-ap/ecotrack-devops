// SDK real, navegador sin sesión. APIs municipales simuladas; nunca crea usuarios.
import { createServer, preview } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const produccion=process.argv.includes('--preview');
const server = produccion ? await preview({preview:{host:'127.0.0.1',port:4188,strictPort:true}}) : await createServer({server:{host:'127.0.0.1',port:4188,strictPort:true}});
let browser;
try {
 if(!produccion)await server.listen();
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:produccion?'allow':'block'});
 await page.addInitScript(()=>localStorage.setItem('eco-tema','dark'));
 await page.route('**/api/**',r=>r.fulfill({json:{exito:true,datos:[]}}));
 await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[]}}));
 // Validación de error sin escribir en Clerk: respuesta simulada solo al intento explícito de este test.
 let erroresSimulados=0;
 for(const path of ['sign_ins','sign_ups']) await page.route(`**/v1/client/${path}**`,r=>{
  if(r.request().method()!=='POST')return r.continue();
  erroresSimulados++;
  return r.fulfill({status:422,json:{errors:[{code:'form_identifier_not_found',message:'Invalid input (fixture)',long_message:'Invalid input (fixture)',meta:{param_name:path==='sign_ups'?'email_address':'identifier'}}]}});
 });
 await page.goto('http://127.0.0.1:4188/eco/index.html');
 await page.getByRole('button',{name:'Cuenta',exact:true}).click();
 await page.locator('.cl-signIn-root').waitFor({timeout:30000});
 const resultados=[],fallos=[];
 const selectores=['headerTitle','headerSubtitle','socialButtonsBlockButtonText','dividerText','formFieldLabel','formFieldInput','footerActionText','footerActionLink','formButtonPrimary','formFieldErrorText','alertText','accesoAlternativo'];
 async function medir(formulario,tema,estado='normal'){
  await page.waitForFunction(t=>document.documentElement.dataset.theme===t,tema);
  const root=page.locator(`.cl-${formulario}-root`);
  await root.waitFor();
  await root.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForTimeout(250);
  const filas=await root.evaluate((raiz,selectores)=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
   const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((n,i)=>i===3?n/255:n);};
   const mezclar=(f,b)=>[0,1,2].map(i=>f[i]*f[3]+b[i]*(1-f[3]));
   const luminancia=c=>c.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);
   const contenedor=raiz.closest('.auth-container');
   return selectores.flatMap(nombre=>[...contenedor.querySelectorAll(nombre==='accesoAlternativo'?'.auth-footer .link-button':`.cl-${nombre}`)].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').map(el=>{
    const s=getComputedStyle(el);let fondo=[255,255,255];const anc=[];for(let a=el;a;a=a.parentElement)anc.unshift(a);
    for(const a of anc)fondo=mezclar(rgba(getComputedStyle(a).backgroundColor),fondo);
    const texto=mezclar(rgba(s.color),fondo);const ls=[luminancia(texto),luminancia(fondo)].sort((a,b)=>b-a);
    return {elemento:nombre,color:s.color,fondo:fondo.map(Math.round),contraste:Math.round(((ls[0]+.05)/(ls[1]+.05))*100)/100};
   }));
  },selectores);
  resultados.push({formulario,tema,estado,filas});
  console.log(JSON.stringify({formulario,tema,estado,filas}));
  for(const f of filas)if(f.contraste<4.5)fallos.push(`${formulario}/${tema}/${f.elemento}: ${f.contraste}`);
  assert.ok(filas.some(f=>f.elemento==='headerTitle'),'Se midió UI real');
 }
 await medir('signIn','dark');
 await page.locator('.cl-socialButtonsBlockButton').first().hover();await medir('signIn','dark','oauth-hover');
 await page.locator('.cl-formFieldInput').first().fill('contraste@example.invalid');
 const password=page.locator('input[type="password"]');if(await password.count())await password.fill('Ejemplo-Ficticio1!');
 await page.locator('.cl-formButtonPrimary').click();
 await page.locator('.cl-formFieldErrorText,.cl-alertText').first().waitFor({timeout:10000});
 assert.equal(erroresSimulados,1,'El intento se interceptó, sin enviar credenciales a Clerk');
 await medir('signIn','dark','error');
 const nodos=await page.evaluate(()=>{window.nodoClerk=document.querySelector('.cl-signIn-root');return performance.getEntriesByType('navigation').length;});
 await page.evaluate(()=>window.ecoCambiarTema('light'));await medir('signIn','light','error');
 assert.equal(await page.evaluate(()=>window.nodoClerk===document.querySelector('.cl-signIn-root')),true,'No remontar formulario al cambiar tema');
 assert.equal(await page.evaluate(()=>performance.getEntriesByType('navigation').length),nodos);
 await page.getByRole('button',{name:'Regístrate con Google',exact:true}).click();
 await medir('signUp','light');
 await page.locator('.cl-socialButtonsBlockButton').first().hover();await medir('signUp','light','oauth-hover');
 await page.evaluate(()=>{window.nodoRegistro=document.querySelector('.cl-signUp-root');window.ecoCambiarTema('dark');});await medir('signUp','dark');
 assert.equal(await page.evaluate(()=>window.nodoRegistro===document.querySelector('.cl-signUp-root')),true,'SignUp conserva su nodo');
 await page.locator('.cl-socialButtonsBlockButton').first().hover();await medir('signUp','dark','oauth-hover');
 // No se envía registro: el estado de error se midió en SignIn con respuesta interceptada.
 if(produccion){
  const index=await readFile('dist/index.html','utf8');
  const esperado=index.match(/src="([^"]+\.js)"/)[1];
  assert.equal(await page.locator('script[type="module"][src]').first().getAttribute('src'),esperado);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  const sw=await page.evaluate(async()=>({activo:!!(await navigator.serviceWorker.getRegistration()).active,cache:(await Promise.all((await caches.keys()).map(async k=>(await (await caches.open(k)).keys()).map(r=>new URL(r.url).pathname)))).flat()}));
  assert.equal(sw.activo,true);assert.ok(sw.cache.includes(esperado),'Bundle actual precacheado');
  assert.ok(sw.cache.every(path=>path.startsWith('/eco/')),'Solo recursos de la PWA');
  await page.reload();await page.getByRole('button',{name:'Cuenta',exact:true}).click();
  await page.locator('.cl-signIn-root').waitFor();
  assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),true,'Página controlada por SW');
  await medir('signIn','dark','service-worker');
  const evidencia={produccion:true,bundle:esperado,serviceWorkerActivo:true,controlado:true,recursosCache:sw.cache.length};
  console.log(JSON.stringify(evidencia));
  await mkdir('artifacts',{recursive:true});await writeFile('artifacts/clerk-assets.json',JSON.stringify(evidencia,null,2));
 }
 await mkdir('artifacts',{recursive:true});
 await page.locator(produccion?'.cl-signIn-root':'.cl-signUp-root').screenshot({path:produccion?'artifacts/clerk-signin-dark-preview.png':'artifacts/clerk-signup-dark.png'});
 await writeFile('artifacts/clerk-contraste.json',JSON.stringify(resultados,null,2));
 if(fallos.length)throw new Error(`Contraste insuficiente: ${fallos.join('; ')}`);
 console.log('PASS: SignIn/SignUp claro/oscuro, colores efectivos y cambio reactivo sin navegación/remontaje. No prueba Safari físico.');
}finally{await browser?.close();if(produccion)await new Promise(resolve=>server.httpServer.close(resolve));else await server.close();}
