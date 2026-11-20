import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const fixtures = process.env.ECOTRACK_SMOKE_FIXTURES === '1';
const development = process.env.ECOTRACK_SMOKE_DEV === '1';
const url = 'http://127.0.0.1:4173' + (development ? '/eco/index.html' : '/');
let occupied = false;
try { await fetch(url); occupied = true; } catch { /* sin servidor */ }
if (occupied) throw new Error('El puerto 4173 está ocupado. No se tocará el servicio existente.');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(!development ? ['preview'] : []), '--configLoader', 'runner', '--host', '127.0.0.1', '--port', '4173'], { stdio: 'ignore', env: { ...process.env, VITE_ENABLE_DEV_TOOLS: 'true' } });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) { ready = true; break; } } catch { /* esperar nuestro servidor */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('No arrancó la preview del build web.');
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.name));
  if (fixtures) await page.route('https://tiles.openfreemap.org/**', route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'fondo-prueba', type: 'background', paint: { 'background-color': '#e8eee9' } }] } }));
  if (fixtures) await page.route('**/api/**', route => route.fulfill({ json: { exito: true, datos: null } }));
  let estado = 'ok';
  let consultasAPI = 0;
  await page.route('**/api/rutas', route => {
    consultasAPI++;
    if (estado === 'error') return route.fulfill({ status: 503, json: { exito: false } });
    return route.fulfill({ json: { exito: true, datos: estado === 'vacio' ? [] : [
      { id_ruta: 'prueba-centro', nombre: 'Centro (prueba)', descripcion: 'Lunes y jueves (prueba)', distancia_estimada_km: 3.5, duracion_estimada_min: 40, trazado_geojson: { type: 'LineString', coordinates: [[-97.09,20.45],[-97.088,20.453]] } },
      { id_ruta: 'prueba-norte', nombre: 'Norte (prueba)', descripcion: 'Martes (prueba)', trazado_geojson: { type: 'MultiLineString', coordinates: [ [[-97.088,20.453],[-97.085,20.455]], [[-97.084,20.456],[-97.082,20.458]] ] } },
    ] } });
  });
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('[data-testid="mapa-estado"]')?.textContent === 'Mapa listo', undefined, { timeout: 25000 });
  if (!await page.locator('canvas.maplibregl-canvas').isVisible()) throw new Error('MapLibre no produjo un canvas visible.');
  await page.getByText('2 rutas disponibles', { exact: true }).waitFor();
  const bounds = await page.locator('.resumen').boundingBox();
  if (!bounds || bounds.height > 130) throw new Error('El panel inicial no es compacto.');
  if (await page.locator('body').innerText().then(s => /MapLibre|diagnóstico|FASE 1|HTTPS|clave pública/.test(s))) throw new Error('Hay diagnóstico técnico visible.');

  // ========================================
  // PRUEBAS PÍLDORA ECOLÓGICA - FASE 2.6
  // ========================================
  const pildora = await page.locator('button.consejo-pildora');
  await pildora.waitFor({ state: 'visible' });

  // Verificar fondo normal (opaco)
  const fondoNormal = await page.evaluate(() => {
    const btn = document.querySelector('button.consejo-pildora');
    const style = window.getComputedStyle(btn);
    return style.backgroundColor;
  });
  if (fondoNormal.startsWith('rgba') && parseFloat(fondoNormal.split(',')[3]) < 1) {
    throw new Error('La píldora tiene fondo translúcido en estado normal.');
  }

  // Realizar click y verificar
  await pildora.click();
  await page.waitForTimeout(100);

  // Verificar que después del click siga teniendo fondo opaco
  const fondoPostClick = await page.evaluate(() => {
    const btn = document.querySelector('button.consejo-pildora');
    const style = window.getComputedStyle(btn);
    return style.backgroundColor;
  });
  if (fondoPostClick.startsWith('rgba') && parseFloat(fondoPostClick.split(',')[3]) < 1) {
    throw new Error('La píldora tiene fondo translúcido después del click.');
  }

  // Verificar rotación de consejos (debe cambiar el texto)
  const textoInicial = await pildora.locator('.consejo-texto').textContent();
  await pildora.click();
  const textoPostClick = await pildora.locator('.consejo-texto').textContent();
  if (textoInicial === textoPostClick) {
    throw new Error('El texto del consejo no cambió después del click.');
  }

  // ========================================
  // PRUEBAS ATENCIÓN MAPA - FASE 2.6
  // ========================================
  const attribution = await page.locator('.maplibregl-ctrl-attrib');
  await attribution.waitFor({ state: 'visible' });

  // Verificar que la atribución es accesible (visible)
  const isVisible = await attribution.evaluate(el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
  });
  if (!isVisible) {
    throw new Error('La atribución está oculta o inaccesible.');
  }

  // Verificar enlaces de atribución
  const attribsTexts = await attribution.evaluate(() => {
    const el = document.querySelector('.maplibregl-ctrl-attrib');
    return el ? el.textContent.toLowerCase() : '';
  });
  if (!attribsTexts.includes('openfreemap') && !attribsTexts.includes('openstreetmap')) {
    throw new Error('La atribución no incluye los enlaces requeridos.');
  }

  // ========================================
  // PRUEBAS MODO OSCURO - FASE 2.7.2
  // ========================================
  // Verificar que NO se usa filtro CSS para modo oscuro
  const tieneFiltroCSS = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.maplibregl-canvas');
    if (!canvas) return false;
    const filter = window.getComputedStyle(canvas).filter;
    return filter !== 'none' && filter !== '';
  });
  if (tieneFiltroCSS) {
    throw new Error('El mapa usa filtro CSS invert(1) en lugar de estilo oscuro real.');
  }

  // Verificar que el canvas del mapa tiene dimensiones válidas (mapa renderizado)
  const canvasBox = await page.locator('canvas.maplibregl-canvas').boundingBox();
  if (!canvasBox || canvasBox.width < 100 || canvasBox.height < 100) {
    throw new Error('El canvas del mapa no tiene dimensiones válidas.');
  }

  await page.getByRole('button', { name: /Ver rutas y detalles/ }).click();
  await page.getByRole('button', { name: 'Norte (prueba)', exact: true }).click();
  if (await page.getByRole('button', { name: 'Norte (prueba)', exact: true }).getAttribute('aria-pressed') !== 'true') throw new Error('No se seleccionó la ruta.');
  await page.getByText('Martes (prueba)', { exact: true }).waitFor();
  if (development) {
    const antes = consultasAPI;
    await page.getByRole('button', { name: 'Ver demostración', exact: true }).click();
    await page.getByText('Este recorrido y vehículo son simulados.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Salir de demo', exact: true }).click();
    await page.getByText('2 rutas disponibles', { exact: true }).waitFor();
    if (consultasAPI <= antes) throw new Error('Salir de demo no volvió a consultar rutas reales.');
  } else if (await page.getByRole('button', { name: /Ver demostración|Salir de demo/ }).count()) throw new Error('Producción expone herramientas de demostración.');
  estado = 'error';
  await page.getByRole('button', { name: 'Actualizar rutas', exact: true }).click();
  await page.getByText('Rutas no disponibles por ahora', { exact: true }).waitFor();
  if (await page.getByText('Demostración · datos simulados', { exact: true }).count()) throw new Error('El error activó la demostración.');
  await page.getByRole('button', { name: 'Cerrar aviso', exact: true }).click();
  estado = 'vacio';
  await page.getByRole('button', { name: 'Actualizar rutas', exact: true }).click();
  await page.getByText('Todavía no hay rutas disponibles', { exact: true }).waitFor();
  estado = 'ok';
  await page.getByRole('button', { name: 'Actualizar rutas', exact: true }).click();
  await page.getByText('2 rutas disponibles', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Ocultar detalles/ }).click();
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Hay desbordamiento horizontal.');
    for (const expandido of [false, true]) {
      if (expandido) await page.getByRole('button', { name: /Ver rutas y detalles/ }).click();
      const panel = await page.locator('.resumen').boundingBox();
      const nav = await page.getByRole('navigation').boundingBox();
      if (!panel || !nav || panel.y + panel.height > nav.y) throw new Error('El panel tapa la navegación.');
      if (expandido) await page.getByRole('button', { name: /Ocultar detalles/ }).click();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const pwa = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    return link ? (await fetch(link.href)).json() : null;
  });
  if (!development && (pwa?.scope !== '/' || pwa?.start_url !== '/')) throw new Error('Manifest fuera del ámbito raíz.');
  if (errors.length) throw new Error(`Errores JavaScript: ${errors.join(', ')}`);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: fixtures ? 'artifacts/entrega2-fixtures.png' : 'artifacts/entrega2-cartografia.png', fullPage: true });
  console.log(`PASS: panel compacto, selección de rutas, errores/vacío, separación demo, responsive y manifest. Cartografía: ${fixtures ? 'fixture local, NO prueba proveedor real' : 'OpenFreeMap solicitado; revisar captura y recursos'}. API: fixtures de prueba. No acredita Safari físico, OAuth ni APK.`);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}