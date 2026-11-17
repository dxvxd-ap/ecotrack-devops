// Frontera Clerk simulada; componentes, efectos, CSS y servicios HTTP reales.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const server = await createServer({ define: { 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify('pk_test_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk'), 'import.meta.env.VITE_API_ORIGIN': JSON.stringify('') }, resolve: { alias: { '@clerk/react': resolve('tests/fixtures/clerk.tsx') } }, server: { host: '127.0.0.1', port: 4188, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  const failures = [];
  async function check(name, fn) { try { await fn(); console.log('PASS', name); } catch(e) { failures.push(name); console.log('FAIL', name, e.message); } }
  let sync = 0, gets = 0, failSync = false, failWrite = false, sinDomicilio = false;
  const writes = [];
  let retenerLectura = false, liberarLectura, retenerEscritura = false, liberarEscritura;
  let dto = { ubicacion: { type: 'Point', coordinates: [-97.08,20.46] }, tipo_seleccion:'manual', version:1, fecha_confirmacion:'2026-01-01', fecha_creacion:'2026-01-01', fecha_actualizacion:'2026-01-01', asignacion:{estado:'pendiente',ruta_id:null,metodo:null,fecha_evaluacion:null,version_politica:null,huella_catalogo:null,motivo:null} };
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    if (url.endsWith('/sincronizar')) { sync++; await new Promise(r => setTimeout(r, 150)); return route.fulfill({ status:failSync ? 503 : 200, json:{exito:!failSync, datos:{}, mensaje:'fixture'} }); }
    if (url.endsWith('/domicilio') && route.request().method() !== 'GET') {
      const body = route.request().postDataJSON();
      writes.push({method:route.request().method(),body});
      if (!failWrite) dto = {...dto, ubicacion:{type:'Point',coordinates:[body.longitud,body.latitud]}, version:(body.version ?? 0)+1};
      if (retenerEscritura) {retenerEscritura=false; await new Promise(r => {liberarEscritura=r;});}
      return route.fulfill({status:failWrite ? 503 : 200,json:failWrite ? {exito:false,mensaje:'fixture',codigo:'SERVICIO_NO_DISPONIBLE'} : {exito:true,datos:dto}});
    }
    if (url.endsWith('/domicilio')) {
      gets++;
      const datos = sinDomicilio ? null : dto;
      if (retenerLectura) { retenerLectura = false; await new Promise(r => {liberarLectura=r;}); }
      return route.fulfill({json:{exito:true,datos}});
    }
    return route.fulfill({json:{exito:true,datos:[]}});
  });
  await page.route('https://tiles.openfreemap.org/**', r => r.fulfill({json:{version:8,sources:{},layers:[]}}));
  await page.goto('http://127.0.0.1:4188/eco/index.html');
  await page.getByRole('button',{name:'Cuenta',exact:true}).click();
  await page.getByText('Cambiar domicilio',{exact:true}).waitFor();
  await check('StrictMode deduplica sincronización', () => assert.equal(sync,1));
  await check('fondo primario tiene contraste real', async () => {
    const color = await page.getByText('Cambiar domicilio',{exact:true}).evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(color,'rgb(4, 120, 87)');
  });
  await check('CSS claro/oscuro conserva colores en hover, activo y deshabilitado', async () => {
    const button = page.getByText('Cambiar domicilio',{exact:true});
    for (const theme of ['light','dark']) {
      await page.evaluate(t => document.documentElement.dataset.theme=t,theme);
      await page.mouse.move(0,0);
      assert.equal(await button.evaluate(el => getComputedStyle(el).backgroundColor),'rgb(4, 120, 87)');
      await button.hover();
      assert.equal(await button.evaluate(el => getComputedStyle(el).backgroundColor),'rgb(6, 95, 70)');
      await page.mouse.down();
      assert.equal(await button.evaluate(el => getComputedStyle(el).color),'rgb(255, 255, 255)');
      await page.mouse.move(0,0); await page.mouse.up();
      await button.evaluate(el => el.disabled=true);
      assert.equal(await button.evaluate(el => getComputedStyle(el).opacity),'0.55');
      assert.notEqual(await button.evaluate(el => getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
      await button.evaluate(el => el.disabled=false);
    }
  });
  await page.getByRole('button',{name:'Inicio',exact:true}).click();
  await check('Cuenta se oculta al salir', async () => assert.equal(await page.getByText('Cambiar domicilio',{exact:true}).isVisible(),false));
  await page.getByRole('button',{name:'Cuenta',exact:true}).click();
  await check('conserva domicilio sin nuevas consultas', () => { assert.equal(sync,1); assert.equal(gets,1); });
  failSync = true;
  await page.evaluate(() => window.cambiarUsuario('ciudadano-prueba-b'));
  await page.getByRole('button',{name:'Reintentar',exact:true}).waitFor({timeout:3000}).catch(()=>{});
  await check('cambio de usuario limpia datos y sincroniza', () => assert.equal(sync,2));
  failSync = false;
  await page.getByRole('button',{name:'Reintentar',exact:true}).click({timeout:2000}).catch(()=>{});
  await check('reintento realiza sincronización', async () => { await page.getByText('Cambiar domicilio',{exact:true}).waitFor({timeout:2000}); assert.equal(sync,3); });
  await page.evaluate(async () => {
    const {default: lib} = await import(performance.getEntriesByType('resource').find(e => e.name.includes('/maplibre-gl.js')).name);
    const original = lib.Map.prototype.addControl;
    lib.Map.prototype.addControl = function(...args) { window.mapaPrueba = this; return original.apply(this,args); };
  });
  await page.getByText('Cambiar domicilio',{exact:true}).click();
  await page.getByRole('heading',{name:'Elige tu domicilio'}).waitFor();
  await page.evaluate(() => window.mapaPrueba.jumpTo({center:[-97.09,20.47]}));
  await page.getByRole('button',{name:'Confirmar la ubicación marcada en el centro del mapa'}).click();
  await check('selector permite revisar sin excepción de MapLibre', async () => {
    await page.getByRole('heading',{name:'Confirma tu domicilio'}).waitFor();
  });
  await page.evaluate(() => window.mapaPrueba.jumpTo({center:[-97.10,20.48]}));
  await check('punto revisado permanece inmutable', async () => {
    assert.match(await page.locator('.selector-resumen').textContent(), /20.47000/);
  });
  await page.getByRole('button',{name:'Corregir en el mapa'}).click();
  await page.evaluate(() => window.mapaPrueba.jumpTo({center:[-97.11,20.49]}));
  await page.getByRole('button',{name:'Confirmar la ubicación marcada en el centro del mapa'}).click();
  await page.getByRole('button',{name:'Guardar domicilio',exact:true}).click();
  await check('PUT usa exactamente el nuevo punto confirmado', async () => {
    await page.getByText('Cambiar domicilio',{exact:true}).waitFor();
    assert.deepEqual(writes[0], {method:'PUT',body:{latitud:20.49,longitud:-97.11,tipo_seleccion:'manual',confirmada:true,version:1}});
  });
  retenerLectura = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  for(let i=0; !liberarLectura && i<300; i++) await new Promise(r => setTimeout(r,10));
  assert.ok(liberarLectura, 'Se inició GET retenido');
  await check('GET pendiente conserva domicilio visible', async () => assert.equal(await page.getByText('Cambiar domicilio',{exact:true}).isVisible(),true));
  await page.getByText('Cambiar domicilio',{exact:true}).click();
  await page.getByRole('button',{name:'Confirmar la ubicación marcada en el centro del mapa'}).click();
  await page.getByRole('button',{name:'Guardar domicilio',exact:true}).click();
  await page.getByText('v3',{exact:true}).waitFor({state:'attached'});
  liberarLectura();
  await check('GET antiguo no sobrescribe PUT posterior', async () => {
    await page.waitForFunction(() => !document.querySelector('.estado-carga'));
    assert.equal(await page.getByText('v3',{exact:true}).count(),1);
  });
  failWrite = true;
  await page.getByText('Cambiar domicilio',{exact:true}).click();
  await page.getByRole('button',{name:'Confirmar la ubicación marcada en el centro del mapa'}).click();
  await page.getByRole('button',{name:'Guardar domicilio',exact:true}).click();
  await check('503 nunca anuncia guardado exitoso', async () => {
    await page.getByRole('heading',{name:'Error',exact:true}).waitFor();
    assert.equal(await page.getByText('Domicilio registrado',{exact:true}).count(),0);
    assert.equal(writes.length,3);
  });
  await page.locator('.selector-btn-cancel').click();
  failWrite = false; sinDomicilio = true;
  await page.evaluate(() => window.cambiarUsuario('ciudadano-prueba-c'));
  await page.getByRole('button',{name:'Registrar domicilio',exact:true}).click();
  await page.evaluate(() => window.mapaPrueba.jumpTo({center:[-97.12,20.50]}));
  await page.getByRole('button',{name:'Confirmar la ubicación marcada en el centro del mapa'}).click();
  await page.getByRole('button',{name:'Guardar domicilio',exact:true}).click();
  await check('POST usa exactamente el punto confirmado sin versión', async () => {
    await page.getByText('Cambiar domicilio',{exact:true}).waitFor();
    assert.deepEqual(writes[3],{method:'POST',body:{latitud:20.50,longitud:-97.12,tipo_seleccion:'manual',confirmada:true}});
  });
  retenerEscritura = true;
  await page.getByText('Cambiar domicilio',{exact:true}).click();
  await page.getByRole('button',{name:'Confirmar la ubicación marcada en el centro del mapa'}).click();
  await page.getByRole('button',{name:'Guardar domicilio',exact:true}).click();
  for(let i=0; !liberarEscritura && i<300; i++) await new Promise(r => setTimeout(r,10));
  assert.ok(liberarEscritura, 'Se inició escritura retenida');
  await page.locator('.selector-btn-cancel').click();
  await check('cancelar un guardado pendiente bloquea otra edición hasta recibir respuesta', async () => {
    assert.equal(await page.getByText('Cambiar domicilio',{exact:true}).isDisabled(),true);
    assert.equal(await page.getByRole('dialog').count(),0);
  });
  liberarEscritura();
  await page.waitForFunction(() => !document.querySelector('.domicilio-btn-editar')?.disabled);
  const syncAntes = sync;
  await check('revalidación GET conserva interfaz y no sincroniza otra vez', async () => {
    const antes=gets;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => !document.querySelector('.estado-carga'));
    assert.equal(await page.getByText('Registrar domicilio',{exact:true}).isVisible(),true);
    assert.equal(sync,syncAntes); assert.equal(gets,antes+1);
  });
  await page.evaluate(() => { window.sinToken = true; });
  await page.getByRole('button',{name:'Registrar domicilio',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar la ubicación marcada en el centro del mapa'}).click();
  await page.getByRole('button',{name:'Guardar domicilio',exact:true}).click();
  await check('token nulo nunca produce éxito sin escritura', async () => {
    await page.getByRole('heading',{name:'Error',exact:true}).waitFor();
    assert.equal(writes.length,5);
    assert.equal(await page.getByText('Domicilio registrado',{exact:true}).count(),0);
  });
  await page.evaluate(() => window.cambiarUsuario(null));
  await check('cerrar sesión elimina domicilio y perfil', async () => {
    await page.getByText('Acceso de prueba',{exact:true}).waitFor();
    assert.equal(await page.getByText('Cambiar domicilio',{exact:true}).count(),0);
  });
  if(failures.length) throw new Error(failures.join(', '));
} finally { await browser?.close(); await server.close(); }
