// Solo lectura, contexto sin cookies previas; todas las APIs municipales interceptadas.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const server = await createServer({define: process.argv.includes('--sin-clave') ? {'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify('')} : {}, server:{host:'127.0.0.1',port:4188,strictPort:true}});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage();
  if (process.argv.includes('--sin-almacen')) await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', {get() {throw new DOMException('Almacenamiento bloqueado','SecurityError');}}); });
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message.replace(/https?:\/\/[^\s]+/g,'[URL]').slice(0,300)));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text().replace(/https?:\/\/[^\s]+/g,'[URL]').slice(0,300));});
  await page.route('**/api/**',r=>r.fulfill({json:{exito:true,datos:[]}}));
  await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[]}}));
  await page.goto('http://127.0.0.1:4188/eco/index.html');
  await page.getByRole('button',{name:'Cuenta',exact:true}).click({timeout:3000});
  await page.waitForTimeout(7000);
  if(await page.getByText('No se pudo abrir EcoTrack',{exact:true}).count()) throw new Error('Arranque atrapado por ErrorAplicacion');
  assert.equal(errors.length,0, 'Sin errores de página o consola');
  if(process.argv.includes('--sin-clave')) assert.equal(await page.getByText('Acceso pendiente de habilitar.',{exact:false}).count(),1);
  else assert.equal(await page.locator('.cl-signIn-root').count(),1, 'El SDK real presentó acceso');
  console.log(JSON.stringify({errorBoundary:await page.getByText('No se pudo abrir EcoTrack',{exact:true}).count(),login:await page.locator('.cl-signIn-root').count(),pending:await page.getByText('Acceso pendiente de habilitar.',{exact:false}).count(),errors}));
}finally{await browser?.close();await server.close();}
