import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const fixtureKey = 'pk_test_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk';
const fecha = '2026-11-18T16:00:00.000Z';
const reporteId = 'a'.repeat(24);
const rutas = ['a', 'b'].map(letra => ({
  _id: letra.repeat(24), nombre: 'Ruta ' + letra,
  trazado_geojson: { type: 'LineString', coordinates: [[-97.09, 20.45], [-97.08, 20.46]] },
}));
const aviso = (letra, extras = {}) => ({
  id: letra.repeat(64), tipo: 'reporte', titulo: 'Aviso ' + letra, mensaje: 'Actualización de prueba',
  prioridad: 'urgente', publicado_en: fecha, vigente_hasta: null, leido_en: null,
  referencia: { tipo: 'reporte', id: reporteId }, ...extras,
});
function barrera() {
  let liberar;
  const espera = new Promise(resolve => { liberar = resolve; });
  return { espera, liberar };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});

async function conPagina(configurada, probar) {
  const origen = 'https://ecotrack.test';
  const bundle = await build({
    configFile: false, base: '/eco/',
    plugins: [react(), {
      name: 'sin-service-worker',
      resolveId(id) { if (id === 'virtual:pwa-register') return '\0pwa-prueba'; },
      load(id) { if (id === '\0pwa-prueba') return 'export function registerSW() { return () => Promise.resolve(); }'; },
    }],
    define: {
      __ANDROID_BUILD__: 'false',
      'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(configurada ? fixtureKey : ''),
      'import.meta.env.VITE_API_ORIGIN': '""',
      'import.meta.env.VITE_MAP_STYLE_URL': '"https://mapa.example.test/style.json"',
    },
    resolve: { alias: { '@clerk/react': resolve('tests/fixtures/clerk.tsx') } },
    build: { write: false },
  });
  const assets = new Map(bundle.output.map(file => [file.fileName, file.type === 'chunk' ? file.code : file.source]));
  const contentTypes = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml' };
  const context = await browser.newContext({
    serviceWorkers: 'block', viewport: { width: 320, height: 740 }, colorScheme: 'dark', reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.visitantePrueba = true;
      window.promesasAvisos = [];
      window.addEventListener('unhandledrejection', event => window.promesasAvisos.push(String(event.reason)));
    });
    await page.route(origen + '/eco/**', route => {
      const file = new URL(route.request().url()).pathname.slice('/eco/'.length) || 'index.html';
      const body = assets.get(file);
      return body === undefined ? route.abort() : route.fulfill({ body, contentType: contentTypes[file.split('.').at(-1)] });
    });
    const nav = page.getByRole('navigation');
    const pestaña = name => nav.getByRole('button', { name });
    const errores = [];
    page.on('pageerror', error => errores.push(error.message));
    await probar({ page, context, origen, pestaña, errores });
    assert.deepEqual(errores, []);
    assert.deepEqual(await page.evaluate(() => window.promesasAvisos), []);
  } finally {
    await context.close();
  }
}

try {
  await conPagina(false, async ({ page, origen, pestaña }) => {
    await page.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.pathname === '/api/rutas') return route.fulfill({ json: { exito: true, datos: rutas } });
      return u.origin === origen ? route.fallback() : route.abort();
    });
    await page.goto(origen + '/eco/');
    await page.locator('.resumen-toggle').getByText('Ruta a', { exact: true }).waitFor();
    assert.equal(await page.locator('#detalles-rutas').isHidden(), true);
    await page.locator('.resumen-toggle').click();
    await page.getByRole('button', { name: 'Ruta b', exact: true }).click();
    await pestaña(/^Avisos/).click();
    await page.getByRole('heading', { name: 'Acceso pendiente' }).waitFor();
    await pestaña(/^Inicio$/).click();
    assert.equal(await page.locator('.vista-mapa').isVisible(), true);
    assert.equal(await page.getByRole('button', { name: 'Ruta b', exact: true }).getAttribute('aria-pressed'), 'true');
    console.log('OK carga inicial de rutas, visor plegado y expandido, y portal sin Clerk');
  });

  await conPagina(true, async ({ page, context, origen, pestaña }) => {
    let datos = [];
    let fallo = null;
    let fallarPut = false;
    let bloqueoLista;
    let bloquearToken;
    let bloquearPut = new Map();
    let paginaDos = null;
    const sincronizarPerfilPendiente = barrera();
    const peticiones = [];
    const panel = page.getByRole('region', { name: 'Bandeja de avisos' });
    const contador = page.locator('.avisos-contador-nav');
    const cambiar = id => page.evaluate(id => window.cambiarUsuario(id), id);
    const abrirAvisos = () => pestaña(/^Avisos/).click();
    const vigentes = () => datos.filter(a => !a.leido_en).length;
    await page.route('**/*', async route => {
      const req = route.request();
      const u = new URL(req.url());
      const ok = datos => route.fulfill({ json: { exito: true, datos } }).catch(() => {});
      if (u.hostname === 'mapa.example.test') return route.fulfill({ json: { version: 8, sources: {}, layers: [] } });
      if (u.origin !== origen) return route.abort();
      if (u.pathname === '/api/rutas') return ok(rutas);
      if (u.pathname.endsWith('/domicilio')) return ok(null);
      if (u.pathname.endsWith('/sincronizar')) {
        const token = req.headers().authorization;
        if (token?.startsWith('Bearer error-')) {
          return route.fulfill({ status: 403, json: { exito: false, codigo: 'ACCESO_DENEGADO' } });
        }
        if (token === 'Bearer perfil-pendiente') await sincronizarPerfilPendiente.espera;
        return ok({ rol: 'ciudadano' });
      }
      if (u.pathname === '/api/v1/reclamos') return ok(u.searchParams.get('id') === reporteId &&
        req.headers().authorization === 'Bearer cuenta-a'
        ? [{ id: reporteId, folio: 'REC-123', estado: 'EN_REVISION', version: 1,
          respuesta_publica: 'Respuesta del reporte propio' }] : []);
      if (!u.pathname.includes('/api/ciudadano/avisos')) return route.fallback();
      const token = req.headers().authorization;
      peticiones.push([req.method(), u.pathname, token, u.search]);
      if (req.method() === 'PUT') {
        const id = u.pathname.split('/').at(-2);
        if (fallarPut) {
          fallarPut = false;
          return route.abort('failed');
        }
        const bloqueo = bloquearPut.get(id);
        if (bloqueo) {
          bloqueo.recibida.liberar();
          await bloqueo.respuesta.espera;
        }
        datos = datos.map(a => a.id === id ? { ...a, leido_en: fecha } : a);
        const total = bloquearPut.get(id)?.total ?? vigentes();
        return ok({ id, leido_en: fecha, sin_leer_total: total });
      }
      if (fallo) return route.fulfill({ status: fallo[0], json: { exito: false, codigo: fallo[1] } });
      const resumen = { sin_leer_total: vigentes(), estado_zona: 'sin_domicilio' };
      if (u.pathname.endsWith('/resumen')) return ok(resumen);
      const filtro = u.searchParams.get('filtro');
      const lista = filtro === 'mi_zona' ? [] : datos.filter(a => filtro !== 'sin_leer' || !a.leido_en);
      if (bloqueoLista && token === bloquearToken) {
        const bloqueo = bloqueoLista;
        bloqueoLista = undefined;
        bloqueo.recibida.liberar();
        await bloqueo.respuesta.espera;
      }
      if (paginaDos && filtro === 'todos') {
        return ok({ ...resumen, avisos: u.searchParams.has('cursor') ? paginaDos : lista,
          cursor_siguiente: u.searchParams.has('cursor') ? null : 'pagina_2' });
      }
      return ok({ ...resumen, avisos: lista, cursor_siguiente: null });
    });

    await page.goto(origen + '/eco/');
    await abrirAvisos();
    await panel.getByRole('button', { name: 'Iniciar sesión desde Cuenta' }).click();
    assert.equal(await pestaña(/^Cuenta$/).getAttribute('aria-current'), 'page');
    await pestaña(/^Inicio$/).click();
    const resumenInicial = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/avisos/resumen'));
    await cambiar('cuenta-a');
    await resumenInicial;
    assert.equal(await contador.count(), 0);
    assert.equal(peticiones.some(p => p[1].endsWith('/avisos')), false);
    datos = [aviso('a'), aviso('b')];
    const reconexion = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/avisos/resumen'));
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await reconexion;
    await pestaña(/Avisos, 2 sin leer/).waitFor();
    console.log('OK inicio de sesión, resumen fuera de Avisos y reconexión con contador inicialmente cero');

    await abrirAvisos();
    await panel.getByText('Aviso a', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Ver mi reporte' }).first().click();
    await page.getByText('Respuesta del reporte propio', { exact: true }).waitFor();
    await abrirAvisos();
    await panel.getByRole('button', { name: 'Mi zona', exact: true }).click();
    await panel.getByRole('button', { name: 'Cuenta', exact: true }).click();
    assert.equal(await pestaña(/^Cuenta$/).getAttribute('aria-current'), 'page');
    await abrirAvisos();
    await panel.getByRole('button', { name: 'Todos', exact: true }).click();
    await panel.getByText('Aviso a', { exact: true }).waitFor();
    datos = [aviso('a')];
    paginaDos = [aviso('a'), aviso('b')];
    await panel.getByRole('button', { name: 'Mi zona', exact: true }).click();
    await panel.getByText('Sin domicilio registrado').waitFor();
    await panel.getByRole('button', { name: 'Todos', exact: true }).click();
    await panel.getByRole('button', { name: 'Cargar más avisos' }).click();
    await panel.getByText('Aviso b', { exact: true }).waitFor();
    assert.equal(await panel.getByText('Aviso a', { exact: true }).count(), 1);
    paginaDos = null;
    datos = [aviso('a'), aviso('b')];
    console.log('OK Cuenta, detalle propio, filtros y paginación');
    datos = [
      aviso('c', { tipo: 'cambio_ruta', referencia: { tipo: 'ruta', id: rutas[1]._id } }),
      aviso('d', { tipo: 'cambio_ruta', referencia: { tipo: 'ruta', id: 'd'.repeat(24) } }),
    ];
    await panel.getByRole('button', { name: 'Mi zona', exact: true }).click();
    await panel.getByText('Sin domicilio registrado').waitFor();
    await panel.getByRole('button', { name: 'Todos', exact: true }).click();
    await panel.getByText('Aviso d', { exact: true }).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'Ver ruta en Inicio' }).count(), 1);
    await panel.getByRole('button', { name: 'Ver ruta en Inicio' }).click();
    assert.equal(await page.getByRole('button', { name: 'Ruta b', exact: true }).getAttribute('aria-pressed'), 'true');
    datos = [aviso('a'), aviso('b')];
    await abrirAvisos();
    console.log('OK selección de ruta persistida y protección ante referencias ausentes');

    await panel.getByRole('button', { name: 'Sin leer', exact: true }).click();
    const boton = letra => panel.locator('article').filter({ hasText: 'Aviso ' + letra })
      .getByRole('button', { name: 'Marcar como leído' });
    bloquearPut = new Map(datos.map((a, i) => [a.id, { recibida: barrera(), respuesta: barrera(), total: i === 0 ? 1 : 0 }]));
    try {
      await boton('a').click();
      await boton('b').click();
      await Promise.all([...bloquearPut.values()].map(b => b.recibida.espera));
      assert.equal(await boton('a').isDisabled(), true);
      bloquearPut.get(aviso('b').id).respuesta.liberar();
      await panel.getByText('Aviso b', { exact: true }).waitFor({ state: 'hidden' });
      bloquearPut.get(aviso('a').id).respuesta.liberar();
      await panel.getByRole('heading', { name: 'No tienes avisos sin leer' }).waitFor();
      await contador.waitFor({ state: 'hidden' });
      assert.equal(peticiones.filter(p => p[0] === 'PUT').length, 2);
    } finally {
      bloquearPut.forEach(b => b.respuesta.liberar());
      bloquearPut = new Map();
    }
    console.log('OK lecturas simultáneas fuera de orden y reconciliación de Sin leer');

    datos = [aviso('a')];
    await panel.getByRole('button', { name: 'Todos', exact: true }).click();
    await boton('a').waitFor();
    fallarPut = true;
    const incierta = { recibida: barrera(), respuesta: barrera() };
    bloqueoLista = incierta;
    bloquearToken = 'Bearer cuenta-a';
    try {
      await boton('a').click();
      await incierta.recibida.espera;
      assert.equal(await boton('a').isDisabled(), true);
      await panel.getByRole('heading', { name: 'No pudimos confirmar la lectura' }).waitFor();
    } finally { incierta.respuesta.liberar(); }

    const anterior = { recibida: barrera(), respuesta: barrera() };
    bloqueoLista = anterior;
    try {
      await panel.getByRole('button', { name: 'Mi zona', exact: true }).click();
      await anterior.recibida.espera;
      datos = [aviso('d')];
      await cambiar('cuenta-b');
      await panel.getByText('Aviso d', { exact: true }).waitFor();
    } finally { anterior.respuesta.liberar(); }

    const rotacion = { recibida: barrera(), respuesta: barrera() };
    bloqueoLista = rotacion;
    bloquearToken = 'Bearer cuenta-b';
    try {
      datos = [aviso('c'), aviso('f')];
      await panel.getByRole('button', { name: 'Sin leer', exact: true }).click();
      await rotacion.recibida.espera;
      datos = [aviso('e')];
      await page.evaluate(() => window.cambiarSesionPrueba('nueva-sesion-b'));
      await panel.getByText('Aviso e', { exact: true }).waitFor();
    } finally { rotacion.respuesta.liberar(); }
    assert.equal(await panel.getByText('Aviso a', { exact: true }).count(), 0);
    assert.equal(await panel.getByText('Aviso c', { exact: true }).count(), 0);
    await cambiar(null);
    await panel.getByRole('button', { name: 'Iniciar sesión desde Cuenta' }).waitFor();
    await contador.waitFor({ state: 'hidden' });
    console.log('OK PUT incierto, cambio de cuenta, rotación de sesión y cierre con respuestas demoradas');

    for (const [status,codigo] of [[401,'SIN_SESION'],[403,'ACCESO_DENEGADO'],[409,'CUENTA_EN_CONFLICTO']]) {
      fallo = [status,codigo];
      await cambiar('error-' + status);
      await panel.getByRole('button', { name: 'Revisar Cuenta' }).waitFor();
      assert.equal(await panel.getByRole('button', { name: 'Volver a consultar' }).count(), 0);
      const antes = peticiones.length;
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      assert.equal(peticiones.length, antes);
    }
    fallo = [503, 'SERVICIO_NO_DISPONIBLE'];
    await cambiar('red');
    await panel.getByRole('button', { name: 'Volver a consultar' }).waitFor();
    fallo = null;
    await panel.getByRole('button', { name: 'Volver a consultar' }).click();
    await panel.getByText('Aviso e', { exact: true }).waitFor();
    fallo = [409, 'CUENTA_EN_CONFLICTO'];
    await cambiar('perfil-pendiente');
    await panel.getByRole('button', { name: 'Revisar Cuenta' }).waitFor();
    fallo = null;
    await panel.getByRole('button', { name: 'Revisar Cuenta' }).click();
    sincronizarPerfilPendiente.liberar();
    await pestaña(/Avisos, 1 sin leer/).waitFor();
    await abrirAvisos();
    await boton('e').waitFor();
    await context.setOffline(true);
    await panel.getByRole('status').filter({ hasText: 'Sin conexión' }).waitFor();
    assert.equal(await boton('e').isDisabled(), true);
    await context.setOffline(false);
    await panel.getByRole('status').filter({ hasText: 'Sin conexión' }).waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    console.log('OK errores 401/403/409/503, desconexión y modo oscuro a 320 px');
  });
} finally {
  await browser.close();
}
