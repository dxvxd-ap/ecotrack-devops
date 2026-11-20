// Compila la página real en memoria. Chrome intercepta todas las solicitudes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const pwaRequire = createRequire(new URL('../../apps/ciudadano/package.json', import.meta.url));
const { build } = pwaRequire('vite');
const { chromium } = pwaRequire('playwright');
const raiz = fileURLToPath(new URL('../..', import.meta.url));
const bundle = await build({
  root: raiz, configFile: false, publicDir: false, esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': raiz + 'src' } },
  plugins: [{
    name: 'dashboard-con-dobles',
    enforce: 'pre',
    resolveId(id) {
      if (['municipal-fixture', '@clerk/nextjs', 'next/link'].includes(id)) return '\0' + id;
    },
    load(id) {
      if (id === '\0municipal-fixture') return `
        import { createElement } from 'react';
        import { createRoot } from 'react-dom/client';
        import Dashboard from '@/app/dashboard/reportes/page.tsx';
        createRoot(document.getElementById('root')).render(createElement(Dashboard));
      `;
      if (id === '\0@clerk/nextjs') return `
        import { useSyncExternalStore } from 'react';
        let actor = 'admin-fixture';
        const listeners = new Set();
        const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
        const snapshot = () => actor;
        const obtenerToken = Object.fromEntries(['admin-fixture', 'otro-admin'].map(id => [id, async () => 'token-' + id]));
        window.cambiarAdmin = id => { actor = id; listeners.forEach(fn => fn()); };
        export function useAuth() {
          const userId = useSyncExternalStore(subscribe, snapshot);
          return { userId, sessionId: 'sesion-' + userId, getToken: obtenerToken[userId] };
        }
      `;
      if (id === '\0next/link') return 'import {createElement} from "react"; export default function Link(props) {return createElement("a",props)}';
    },
  }],
  build: { write: false, rollupOptions: { input: 'municipal-fixture', output: { format: 'iife', inlineDynamicImports: true } } },
});
const codigo = bundle.output.find(archivo => archivo.type === 'chunk').code;
const origen = 'https://ecotrack-municipal.test';
const id = 'a'.repeat(24);
const item = { _id: id, folio: 'MUNICIPAL-R1', origen: 'ciudadano', tipo: 'OTRO', estado: 'PENDIENTE',
  descripcion: 'Prueba de atención', solucion_notas: 'Nota histórica privada', ubicacion: { lat: 20, lng: -97 } };
const conductor = { ...item, _id: 'b'.repeat(24), folio: 'OPERATIVO', origen: 'conductor', estado: 'pendiente' };
const browser = await chromium.launch({
  executablePath: process.env.ECOTRACK_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errores = [];
  const atenciones = [];
  const operativos = [];
  let estado = 'PENDIENTE', version = 3, modo = 'conflicto';
  let liberar;
  page.on('pageerror', e => errores.push(e.message));
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin !== origen) return route.abort();
    const json = (datos, status = 200) => route.fulfill({ status, json: { exito: true, datos } });
    const fallo = (codigo, status) => route.fulfill({ status, json: { exito: false, codigo } });
    if (u.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><div id="root"></div><script src="/app.js"></script>' });
    if (u.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: codigo });
    if (u.pathname === '/api/reclamos') return json([item]);
    if (u.pathname === '/api/reportes') return json([conductor]);
    if (u.pathname === '/api/reportes/resumen') return json(null);
    if (u.pathname === '/api/rutas' || u.pathname === '/api/camiones') return json([]);
    if (u.pathname === '/api/v1/admin/reclamos/' + id) return json({ id, estado, version, historial: [] });
    if (u.pathname.endsWith('/atenciones')) {
      const req = route.request();
      const registro = { clave: req.headers()['idempotency-key'], auth: req.headers().authorization, cuerpo: req.postData() };
      atenciones.push(registro);
      const cuerpo = JSON.parse(registro.cuerpo);
      if (modo === 'conflicto') { version = 4; return fallo('VERSION_DESACTUALIZADA', 409); }
      if (modo === 'incierto') { await new Promise(resolve => { liberar = resolve; }); return fallo('RESULTADO_INCIERTO', 503); }
      if (modo === 'transicion') return fallo('TRANSICION_NO_PERMITIDA', 409);
      if (modo === 'clave') return fallo('CLAVE_REUTILIZADA', 409);
      estado = cuerpo.estado ?? estado;
      version = cuerpo.version + 1;
      return json({ reclamo_id: id, evento_id: 'evento-confirmado', estado, version }, 200);
    }
    if (u.pathname === '/api/reportes/' + conductor._id) {
      operativos.push([route.request().method(), route.request().postDataJSON()]);
      return json(conductor);
    }
    return route.abort();
  });
  const abrir = () => page.locator('button').filter({ hasText: /Gestionar/ }).first().click();
  const guardar = page.getByRole('button', { name: 'Guardar atención', exact: true });
  const revisar = () => page.getByRole('button', { name: 'He revisado la versión y mi borrador' }).click();
  const cerrar = page.getByRole('button', { name: 'Cerrar gestión' });
  const seleccionar = () => page.getByLabel('Nuevo estado').selectOption('EN_REVISION');
  const nota = page.getByLabel('Nota administrativa privada');
  await page.goto(origen);
  await abrir();
  await page.getByText('Pendiente · Versión 3').waitFor();
  assert.deepEqual(await page.getByLabel('Nuevo estado').locator('option').evaluateAll(x => x.map(o => o.value)), ['', 'EN_REVISION', 'RECHAZADO']);
  assert.equal(await page.getByLabel('Respuesta pública al ciudadano').inputValue(), '');
  await seleccionar();
  await nota.fill('Nota nueva del operador');
  await guardar.click();
  await page.getByText('Pendiente · Versión 4').waitFor();
  assert.equal(await nota.inputValue(), 'Nota nueva del operador');
  assert.equal(await guardar.isDisabled(), true);
  await revisar();
  modo = 'incierto';
  await guardar.click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Cerrar gestión"]').disabled);
  assert.equal(await guardar.count(), 0);
  const fin = Date.now() + 5000;
  while (!liberar && Date.now() < fin) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(liberar);
  liberar();
  const reintentar = page.getByRole('button', { name: 'Reintentar la misma atención' });
  await reintentar.waitFor();
  assert.equal(await cerrar.isDisabled(), true);
  await page.evaluate(() => window.cambiarAdmin('otro-admin'));
  await guardar.waitFor();
  assert.equal(await reintentar.count(), 0);
  assert.equal(await nota.inputValue(), '');
  await page.evaluate(() => window.cambiarAdmin('admin-fixture'));
  await reintentar.waitFor();
  modo = 'ok';
  await reintentar.click();
  await cerrar.waitFor({ state: 'detached' });
  assert.notEqual(atenciones[0].clave, atenciones[1].clave);
  assert.deepEqual(atenciones[1], atenciones[2]);
  assert.equal(JSON.parse(atenciones[2].cuerpo).version, 4);
  assert.equal(atenciones[2].auth, 'Bearer token-admin-fixture');

  for (const [error, mensaje] of [['transicion', /La acción ya no está permitida/], ['clave', /La clave ya corresponde a otra atención/]]) {
    modo = error;
    await abrir();
    await page.getByText('En revisión · Versión 5').waitFor();
    await page.getByRole('combobox', { name: /^Acción/ }).selectOption('AGREGAR_NOTA');
    await nota.fill('Otra nota privada');
    await guardar.click();
    await page.getByText(mensaje).waitFor();
    await cerrar.click();
  }

  estado = 'HISTORICO';
  const antes = atenciones.length;
  await abrir();
  await page.getByText(/estado fuera del catálogo R1/).waitFor();
  assert.equal(await guardar.isDisabled(), true);
  await cerrar.click();
  assert.equal(atenciones.length, antes);

  await page.getByRole('button', { name: /Reportes de Conductores/i }).click();
  await abrir();
  await page.locator('textarea').fill('Nota operativa');
  await page.getByRole('button', { name: 'Guardar Cambios' }).click();
  await page.getByText('¡Registro actualizado exitosamente!').waitFor();
  assert.deepEqual(operativos, [['PATCH', { estado: 'en_proceso', notasAdmin: 'Nota operativa' }]]);
  assert.deepEqual(errores, []);
  console.log('OK modal municipal: carga, acciones, 409, reintento idempotente, cierre, históricos y conductores');
} finally {
  await browser.close();
}
