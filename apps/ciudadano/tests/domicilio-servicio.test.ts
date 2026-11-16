import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const fetchOriginal = globalThis.fetch;

type FetchMock = {
  calls: Array<{ url: string; options: RequestInit }>;
  responses: Map<string, { status: number; body: unknown; ok: boolean }>;
};

let fetchMock: FetchMock;

function instalarFetchMock() {
  fetchMock = { calls: [], responses: new Map() };
  globalThis.fetch = async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchMock.calls.push({ url, options: options ?? {} });
    const key = url;
    const mock = fetchMock.responses.get(key);
    if (!mock) {
      return new Response(JSON.stringify({ exito: false, mensaje: 'Sin mock para ' + url, codigo: 'NO_MOCK' }), { status: 404 });
    }
    return new Response(JSON.stringify(mock.body), { status: mock.status });
  };
}

function restaurarFetch() {
  globalThis.fetch = fetchOriginal;
}

function mockRespuesta(url: string, status: number, body: unknown, ok: boolean = status >= 200 && status < 300) {
  fetchMock.responses.set(url, { status, body, ok });
}

describe('servicio domicilio', () => {
  beforeEach(async () => {
    instalarFetchMock();
    const { __setApiOverride } = await import('../src/servicios/domicilio.ts');
    __setApiOverride('https://api.test');
  });

  afterEach(async () => {
    restaurarFetch();
    const { __setApiOverride } = await import('../src/servicios/domicilio.ts');
    __setApiOverride(null);
  });

  const token = 'token-valido-123';
  const domicilioValido = {
    latitud: 20.46,
    longitud: -97.08,
    tipo_seleccion: 'gps' as const,
    confirmada: true as const,
  };
  const respuestaDomicilio = {
    ubicacion: { type: 'Point' as const, coordinates: [-97.08, 20.46] },
    tipo_seleccion: 'gps' as const,
    fecha_confirmacion: '2025-01-15T10:00:00.000Z',
    fecha_creacion: '2025-01-15T10:00:00.000Z',
    fecha_actualizacion: '2025-01-15T10:00:00.000Z',
    version: 0,
    asignacion: {
      estado: 'pendiente' as const,
      ruta_id: null,
      metodo: null,
      fecha_evaluacion: null,
      version_politica: null,
      huella_catalogo: null,
      motivo: null,
    },
  };

  test('consultarDomicilio devuelve domicilio existente', async () => {
    const { consultarDomicilio } = await import('../src/servicios/domicilio.ts');
    mockRespuesta('https://api.test/api/ciudadano/domicilio', 200, { exito: true, datos: respuestaDomicilio, mensaje: 'OK' });
    const resultado = await consultarDomicilio(token);
    assert.deepEqual(resultado, respuestaDomicilio);
    assert.equal(fetchMock.calls.length, 1);
    assert.equal(fetchMock.calls[0].options.method, 'GET');
  });

  test('consultarDomicilio devuelve null si no existe', async () => {
    const { consultarDomicilio } = await import('../src/servicios/domicilio.ts');
    mockRespuesta('https://api.test/api/ciudadano/domicilio', 200, { exito: true, datos: null, mensaje: 'OK' });
    const resultado = await consultarDomicilio(token);
    assert.equal(resultado, null);
  });

  test('crearDomicilio exitoso', async () => {
    const { crearDomicilio } = await import('../src/servicios/domicilio.ts');
    mockRespuesta('https://api.test/api/ciudadano/domicilio', 201, { exito: true, datos: respuestaDomicilio, mensaje: 'Creado' });
    const resultado = await crearDomicilio(token, domicilioValido);
    assert.deepEqual(resultado, respuestaDomicilio);
    const body = JSON.parse(fetchMock.calls[0].options.body as string);
    assert.equal(body.tipo_seleccion, 'gps');
    assert.equal(body.confirmada, true);
  });

  test('actualizarDomicilio exitoso con versión', async () => {
    const { actualizarDomicilio } = await import('../src/servicios/domicilio.ts');
    const actualizacion = { ...domicilioValido, version: 0 };
    const respuestaActualizada = { ...respuestaDomicilio, version: 1, fecha_actualizacion: '2025-01-15T11:00:00.000Z' };
    mockRespuesta('https://api.test/api/ciudadano/domicilio', 200, { exito: true, datos: respuestaActualizada, mensaje: 'Actualizado' });
    const resultado = await actualizarDomicilio(token, actualizacion);
    assert.deepEqual(resultado, respuestaActualizada);
    const body = JSON.parse(fetchMock.calls[0].options.body as string);
    assert.equal(body.version, 0);
  });

  test('rechaza coordenadas inválidas (latitud > 90)', async () => {
    const { crearDomicilio } = await import('../src/servicios/domicilio.ts');
    await assert.rejects(
      crearDomicilio(token, { ...domicilioValido, latitud: 91 }),
      { name: 'ErrorEntradaInvalida', codigo: 'ENTRADA_INVALIDA' }
    );
    assert.equal(fetchMock.calls.length, 0);
  });

  test('rechaza coordenadas inválidas (longitud > 180)', async () => {
    const { crearDomicilio } = await import('../src/servicios/domicilio.ts');
    await assert.rejects(
      crearDomicilio(token, { ...domicilioValido, longitud: 181 }),
      { name: 'ErrorEntradaInvalida', codigo: 'ENTRADA_INVALIDA' }
    );
  });

  test('rechaza coordenadas no finitas', async () => {
    const { crearDomicilio } = await import('../src/servicios/domicilio.ts');
    await assert.rejects(
      crearDomicilio(token, { ...domicilioValido, latitud: NaN }),
      { name: 'ErrorEntradaInvalida', codigo: 'ENTRADA_INVALIDA' }
    );
  });

  test('rechaza tipo_seleccion inválido', async () => {
    const { crearDomicilio } = await import('../src/servicios/domicilio.ts');
    await assert.rejects(
      crearDomicilio(token, { ...domicilioValido, tipo_seleccion: 'otro' as any }),
      { name: 'ErrorEntradaInvalida', codigo: 'ENTRADA_INVALIDA' }
    );
  });

  test('rechaza confirmada no true', async () => {
    const { crearDomicilio } = await import('../src/servicios/domicilio.ts');
    await assert.rejects(
      crearDomicilio(token, { ...domicilioValido, confirmada: false as any }),
      { name: 'ErrorEntradaInvalida', codigo: 'ENTRADA_INVALIDA' }
    );
  });

  test('rechaza token ausente', async () => {
    const { consultarDomicilio, crearDomicilio, actualizarDomicilio } = await import('../src/servicios/domicilio.ts');
    await assert.rejects(consultarDomicilio(''), { name: 'ErrorSinSesion', codigo: 'SIN_SESION' });
    await assert.rejects(crearDomicilio('', domicilioValido), { name: 'ErrorSinSesion', codigo: 'SIN_SESION' });
    await assert.rejects(actualizarDomicilio('', { ...domicilioValido, version: 0 }), { name: 'ErrorSinSesion', codigo: 'SIN_SESION' });
  });

  test('error 401 lanza ErrorSinSesion', async () => {
    const { consultarDomicilio } = await import('../src/servicios/domicilio.ts');
    mockRespuesta('https://api.test/api/ciudadano/domicilio', 401, { exito: false, mensaje: 'No autenticado', codigo: 'SIN_SESION' });
    await assert.rejects(consultarDomicilio(token), { name: 'ErrorSinSesion', codigo: 'SIN_SESION' });
  });

  test('error 403 lanza ErrorAccesoDenegado', async () => {
    const { consultarDomicilio } = await import('../src/servicios/domicilio.ts');
    mockRespuesta('https://api.test/api/ciudadano/domicilio', 403, { exito: false, mensaje: 'Prohibido', codigo: 'ACCESO_DENEGADO' });
    await assert.rejects(consultarDomicilio(token), { name: 'ErrorAccesoDenegado', codigo: 'ACCESO_DENEGADO' });
  });

  test('error 409 versión conflictiva lanza ErrorConflictoVersion', async () => {
    const { actualizarDomicilio } = await import('../src/servicios/domicilio.ts');
    mockRespuesta('https://api.test/api/ciudadano/domicilio', 409, { exito: false, mensaje: 'Versión conflictiva', codigo: 'VERSION_CONFLICTIVA' });
    await assert.rejects(actualizarDomicilio(token, { ...domicilioValido, version: 0 }), { name: 'ErrorConflictoVersion', codigo: 'VERSION_CONFLICTIVA' });
  });

  test('error 409 domicilio existente lanza ErrorDomicilioExistente', async () => {
    const { crearDomicilio } = await import('../src/servicios/domicilio.ts');
    mockRespuesta('https://api.test/api/ciudadano/domicilio', 409, { exito: false, mensaje: 'Ya existe', codigo: 'DOMICILIO_EXISTENTE' });
    await assert.rejects(crearDomicilio(token, domicilioValido), { name: 'ErrorDomicilioExistente', codigo: 'DOMICILIO_EXISTENTE' });
  });

  test('error 409 genérico lanza ErrorDomicilio', async () => {
    const { consultarDomicilio } = await import('../src/servicios/domicilio.ts');
    mockRespuesta('https://api.test/api/ciudadano/domicilio', 409, { exito: false, mensaje: 'Otro conflicto', codigo: 'OTRO' });
    await assert.rejects(consultarDomicilio(token), { name: 'ErrorDomicilio', status: 409 });
  });

  test('error 503 lanza ErrorServicioNoDisponible', async () => {
    const { consultarDomicilio } = await import('../src/servicios/domicilio.ts');
    mockRespuesta('https://api.test/api/ciudadano/domicilio', 503, { exito: false, mensaje: 'BD caida', codigo: 'SERVICIO_NO_DISPONIBLE' });
    await assert.rejects(consultarDomicilio(token), { name: 'ErrorServicioNoDisponible', codigo: 'SERVICIO_NO_DISPONIBLE' });
  });

  test('error de red lanza ErrorDomicilio con codigo ERROR_RED', async () => {
    const { consultarDomicilio } = await import('../src/servicios/domicilio.ts');
    // Simular error de red haciendo que fetch lance
    globalThis.fetch = async () => { throw new Error('Network error'); };
    await assert.rejects(consultarDomicilio(token), { name: 'ErrorDomicilio', codigo: 'ERROR_RED' });
    // Restaurar fetch mock para siguientes tests
    instalarFetchMock();
  });

  test('respuesta JSON inválida lanza ErrorDomicilio con codigo RESPUESTA_INVALIDA', async () => {
    const { consultarDomicilio } = await import('../src/servicios/domicilio.ts');
    mockRespuesta('https://api.test/api/ciudadano/domicilio', 200, 'no-es-json', true);
    await assert.rejects(consultarDomicilio(token), { name: 'ErrorDomicilio', codigo: 'RESPUESTA_INVALIDA' });
  });

  test('respuesta sin exito lanza ErrorDomicilio', async () => {
    const { consultarDomicilio } = await import('../src/servicios/domicilio.ts');
    mockRespuesta('https://api.test/api/ciudadano/domicilio', 200, { exito: false, mensaje: 'fallo', codigo: 'FALLO' });
    await assert.rejects(consultarDomicilio(token), { name: 'ErrorDomicilio', codigo: 'RESPUESTA_INVALIDA' });
  });

  test('respuesta sin datos en éxito lanza ErrorDomicilio', async () => {
    const { consultarDomicilio } = await import('../src/servicios/domicilio.ts');
    mockRespuesta('https://api.test/api/ciudadano/domicilio', 200, { exito: true, mensaje: 'OK' });
    await assert.rejects(consultarDomicilio(token), { name: 'ErrorDomicilio', codigo: 'RESPUESTA_INVALIDA' });
  });

  test('validarCoordenadas en actualizarDomicilio también rechaza inválidos', async () => {
    const { actualizarDomicilio } = await import('../src/servicios/domicilio.ts');
    await assert.rejects(actualizarDomicilio(token, { ...domicilioValido, latitud: 95, version: 0 }), { name: 'ErrorEntradaInvalida' });
  });

  test('actualizarDomicilio rechaza versión negativa', async () => {
    const { actualizarDomicilio } = await import('../src/servicios/domicilio.ts');
    await assert.rejects(actualizarDomicilio(token, { ...domicilioValido, version: -1 }), { name: 'ErrorEntradaInvalida', codigo: 'ENTRADA_INVALIDA' });
  });

  test('actualizarDomicilio rechaza versión no entera', async () => {
    const { actualizarDomicilio } = await import('../src/servicios/domicilio.ts');
    await assert.rejects(actualizarDomicilio(token, { ...domicilioValido, version: 1.5 }), { name: 'ErrorEntradaInvalida', codigo: 'ENTRADA_INVALIDA' });
  });

  test('headers Authorization y Content-Type enviados', async () => {
    const { consultarDomicilio } = await import('../src/servicios/domicilio.ts');
    mockRespuesta('https://api.test/api/ciudadano/domicilio', 200, { exito: true, datos: respuestaDomicilio, mensaje: 'OK' });
    await consultarDomicilio(token);
    const h = new Headers(fetchMock.calls[0].options.headers as HeadersInit);
    assert.equal(h.get('Authorization'), `Bearer ${token}`);
    assert.equal(h.get('Content-Type'), 'application/json');
  });
});