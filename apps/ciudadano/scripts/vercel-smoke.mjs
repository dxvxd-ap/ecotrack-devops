// Producción local. Clerk, cartografía y API se sustituyen por dobles.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, preview } from 'vite';
import { chromium } from 'playwright';

const peticiones = [];
const backend = createServer(async (req, res) => {
  const trozos = [];
  for await (const trozo of req) trozos.push(trozo);
  const cuerpo = Buffer.concat(trozos).toString();
  const url = new URL(req.url, 'http://doble.invalid');
  peticiones.push({ ruta: url.pathname, query: url.search, metodo: req.method, headers: req.headers, cuerpo });
  let datos = null;
  if (['/api/rutas', '/api/v1/reclamos'].includes(url.pathname)) datos = [];
  if (url.pathname.endsWith('/avisos/resumen')) datos = { sin_leer_total: 0, estado_zona: 'sin_domicilio' };
  if (url.pathname.endsWith('/avisos')) datos = { avisos: [], cursor_siguiente: null, sin_leer_total: 0, estado_zona: 'sin_domicilio' };
  if (url.pathname.endsWith('/sincronizar')) datos = { rol: 'ciudadano' };
  res.writeHead(req.method === 'POST' && url.pathname === '/api/v1/reclamos' ? 201 : 200, {
    'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-EcoTrack-Prueba': 'proxy',
  });
  res.end(JSON.stringify({ exito: true, datos }));
});
let servidor, navegador;
try {
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  const target = 'http://127.0.0.1:' + backend.address().port;
  process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk';
  delete process.env.VITE_API_ORIGIN;
  const outDir = await mkdtemp(join(tmpdir(), 'ecotrack-vercel-smoke-'));
  await build({
    configLoader: 'runner', mode: 'production',
    resolve: { alias: { '@clerk/react': resolve('tests/fixtures/clerk.tsx') } },
    plugins: [{
      name: 'registrar-propiedades-clerk-en-prueba',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('/tests/fixtures/clerk.tsx')) return;
        const original = 'export const ClerkProvider = ({ children }: any) => children;';
        assert.ok(code.includes(original));
        return code.replace(original, `export const ClerkProvider = ({ children, ...props }) => {
          if (props.publishableKey) window.clerkPrueba = props;
          return children;
        };`);
      },
    }],
    build: { outDir },
  });
  const sw = await readFile(join(outDir, 'sw.js'));
  let version = 1;
  servidor = await preview({
    configLoader: 'runner', mode: 'production', build: { outDir },
    preview: { host: '127.0.0.1', port: 0, strictPort: true, proxy: { '/api': { target, changeOrigin: true } } },
    plugins: [{
      name: 'simular-nueva-version-del-service-worker',
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== '/sw.js') return next();
          res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' });
          res.end(Buffer.concat([sw, Buffer.from('\n/* prueba versión ' + version + ' */')]));
        });
      },
    }],
  });
  const origen = 'http://127.0.0.1:' + servidor.httpServer.address().port;
  navegador = await chromium.launch({
    executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  });
  const pagina = await navegador.newPage();
  await pagina.addInitScript(() => { window.visitantePrueba = true; });
  const errores = [];
  const recursos = new Set();
  pagina.on('pageerror', e => errores.push(e.message));
  pagina.on('console', msg => { if (msg.type() === 'error') errores.push(msg.text()); });
  pagina.on('response', r => {
    const u = new URL(r.url());
    if (u.origin === origen && r.ok()) recursos.add(u.pathname);
  });
  await pagina.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin === origen) return route.continue();
    if (u.hostname === 'tiles.openfreemap.org') return route.fulfill({
      json: { version: 8, sources: {}, layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#eef1ed' } }] },
    });
    return route.abort();
  });
  const tab = nombre => pagina.getByRole('navigation').getByRole('button', { name: nombre, exact: true });
  await pagina.goto(origen + '/');
  await tab('Inicio').waitFor();
  assert.equal(await tab('Inicio').getAttribute('aria-current'), 'page');
  assert.ok([...recursos].some(x => /^\/assets\/.+\.js$/.test(x)));
  assert.ok([...recursos].some(x => /^\/assets\/.+\.css$/.test(x)));
  const manifest = await (await pagina.request.get(origen + '/manifest.webmanifest')).json();
  assert.deepEqual([manifest.id, manifest.scope, manifest.start_url], ['/', '/', '/']);
  for (const { src } of manifest.icons) assert.equal((await pagina.request.get(new URL(src, origen + '/').href)).ok(), true);
  const inexistente = await pagina.request.get(origen + '/assets/no-existe.js', { headers: { Accept: 'text/html' } });
  assert.equal(inexistente.status(), 404);
  assert.equal((await pagina.request.get(origen + '/fuera-de-la-app', { headers: { Accept: 'text/html' } })).status(), 404);
  const swScope = await pagina.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  assert.equal(swScope, origen + '/');
  await pagina.reload();
  await pagina.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  assert.equal(await tab('Inicio').getAttribute('aria-current'), 'page');
  await tab('Reportes').click();
  await pagina.getByText('Tu cuenta, tus reportes').waitFor();
  await pagina.getByRole('button', { name: 'Iniciar sesión desde Cuenta' }).click();
  await pagina.getByText('Acceso de prueba').waitFor();
  const retornos = await pagina.evaluate(() => {
    const { signInFallbackRedirectUrl, signUpFallbackRedirectUrl, allowedRedirectOrigins } = window.clerkPrueba;
    return [signInFallbackRedirectUrl, signUpFallbackRedirectUrl, allowedRedirectOrigins];
  });
  assert.deepEqual(retornos, [origen + '/', origen + '/', [origen]]);
  await pagina.evaluate(() => window.cambiarUsuario('ciudadano-prueba'));
  await pagina.waitForFunction(() => Boolean(document.querySelector('.perfil-cabecera')));
  await tab('Avisos').click();
  await tab('Reportes').click();
  await pagina.getByText('Aún no tienes reportes', { exact: true }).waitFor();
  for (const ruta of ['/api/ciudadano/sincronizar','/api/ciudadano/domicilio','/api/ciudadano/avisos/resumen','/api/v1/reclamos']) {
    assert.ok(peticiones.some(p => p.ruta === ruta && p.headers.authorization === 'Bearer ciudadano-prueba'), ruta);
  }
  const caso = await pagina.evaluate(async () => {
    const response = await fetch('/api/v1/reclamos?prueba=proxy', {
      method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json',
        'EcoTrack-Contrato': 'reclamos-r1', 'Idempotency-Key': 'c8efae30-da6d-44eb-bf72-5860daa76acc' },
      body: JSON.stringify({ fixture: true }),
    });
    return [response.status, response.headers.get('x-ecotrack-prueba'), await response.json()];
  });
  assert.deepEqual(caso, [201, 'proxy', { exito: true, datos: [] }]);
  const post = peticiones.find(p => p.query === '?prueba=proxy');
  assert.equal(post.metodo, 'POST');
  assert.equal(post.cuerpo, '{"fixture":true}');
  assert.equal(post.headers.authorization, 'Bearer fixture');
  assert.equal(post.headers['ecotrack-contrato'], 'reclamos-r1');
  assert.equal(post.headers['idempotency-key'], 'c8efae30-da6d-44eb-bf72-5860daa76acc');
  assert.ok(!(await pagina.evaluate(async () => {
    const cachesActivas = await Promise.all((await caches.keys()).map(k => caches.open(k)));
    return (await Promise.all(cachesActivas.map(c => c.keys()))).flat().some(r => new URL(r.url).pathname.startsWith('/api/'));
  })));
  version++;
  await pagina.evaluate(async () => (await navigator.serviceWorker.ready).update());
  await pagina.getByRole('button', { name: /Nueva versión disponible/ }).waitFor();
  await Promise.all([pagina.waitForEvent('load'), pagina.getByRole('button', { name: /Nueva versión disponible/ }).click()]);
  await tab('Inicio').waitFor();
  assert.deepEqual(errores, []);
  console.log('PASS: raíz, recursos, manifest e iconos, Clerk simulado, proxy, recarga, SW y actualización sin errores de consola.');
} finally {
  await navegador?.close();
  await servidor?.close();
  if (backend.listening) await new Promise(resolve => backend.close(resolve));
}
