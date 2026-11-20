import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { crearServicioAvisos, obtenerTokenAvisos, ErrorAvisos } from '../src/servicios/avisos.ts';

const mockFetch = mock.fn<typeof fetch>(async () => { throw new Error("Transporte sin configurar"); });

const tokenValido = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.dummy';
const avisosEjemplo = {
  avisos: [
    {
      id: '000000006735d56dc1a05f653738c84182ef03d6b8504a12b4812aa9be9519e7',
      tipo: 'reporte',
      titulo: 'Actualización de tu reporte',
      mensaje: 'Tu reporte está en revisión.',
      prioridad: 'normal',
      publicado_en: '2026-11-18T16:00:00.000Z',
      vigente_hasta: null,
      leido_en: null,
      referencia: { tipo: 'reporte', id: '6735d56dc1a05f653738c841' },
    },
    {
      id: '100000006735d56dc1a05f653738c84182ef03d6b8504a12b4812aa9be9519e8',
      tipo: 'comunicado',
      titulo: 'Información municipal',
      mensaje: 'Consulta el calendario municipal.',
      prioridad: 'alta',
      publicado_en: '2026-11-17T10:00:00.000Z',
      vigente_hasta: '2026-11-20T23:59:59.000Z',
      leido_en: '2026-11-18T12:00:00.000Z',
      referencia: null,
    },
  ],
  cursor_siguiente: 'cursor_siguiente_valido',
  sin_leer_total: 1,
  estado_zona: 'sin_confirmacion',
};

const resumenEjemplo = { sin_leer_total: 1, estado_zona: 'sin_confirmacion' };
const marcadoEjemplo = { id: '000000006735d56dc1a05f653738c84182ef03d6b8504a12b4812aa9be9519e7', leido_en: '2026-11-18T16:02:00.000Z', sin_leer_total: 0 };

function resetMocks() {
  mockFetch.mock.resetCalls();
}

function mockRespuestaOk(datos: unknown) {
  mockFetch.mock.mockImplementation(async () => Response.json({ exito: true, datos }));
}

function mockRespuestaError(status: number, codigo: string) {
  mockFetch.mock.mockImplementation(async () => Response.json({ exito: false, codigo }, { status }));
}

describe('crearServicioAvisos', () => {
  beforeEach(() => {
    resetMocks();

  });

  describe('resumen', () => {
    test('devuelve resumen con contador y estado zona', async () => {
      mockRespuestaOk(resumenEjemplo);
      const api = crearServicioAvisos({ transportar: mockFetch });
      const resultado = await api.resumen(tokenValido);
      assert.deepEqual(resultado, resumenEjemplo);
      const [url, opciones] = mockFetch.mock.calls[0].arguments;
      assert.ok(String(url).includes('/api/ciudadano/avisos/resumen'));
      assert.equal(opciones?.method, 'GET');
      assert.equal(new Headers(opciones?.headers).get('Authorization'), `Bearer ${tokenValido}`);
    });

    test('lanza ErrorAvisos 401 sin token', async () => {
      const api = crearServicioAvisos({ transportar: mockFetch });
      await assert.rejects(api.resumen(''), { name: 'ErrorAvisos', status: 401, codigo: 'SIN_SESION' });
    });

    test('lanza ErrorAvisos con código del servidor en error', async () => {
      mockRespuestaError(403, 'ACCESO_DENEGADO');
      const api = crearServicioAvisos({ transportar: mockFetch });
      await assert.rejects(api.resumen(tokenValido), { name: 'ErrorAvisos', status: 403, codigo: 'ACCESO_DENEGADO' });
    });
  });

  describe('listar', () => {
    test('devuelve lista de avisos con paginación', async () => {
      mockRespuestaOk(avisosEjemplo);
      const api = crearServicioAvisos({ transportar: mockFetch });
      const resultado = await api.listar(tokenValido, 'todos', 20, null);
      assert.deepEqual(resultado, avisosEjemplo);
      assert.equal(resultado.avisos.length, 2);
      assert.equal(resultado.cursor_siguiente, 'cursor_siguiente_valido');
    });

    test('acepta filtro sin_leer y cursor', async () => {
      mockRespuestaOk(avisosEjemplo);
      const api = crearServicioAvisos({ transportar: mockFetch });
      await api.listar(tokenValido, 'sin_leer', 20, 'cursor_previo');
      const url = mockFetch.mock.calls[0].arguments[0];
      assert.ok(String(url).includes('filtro=sin_leer'));
      assert.ok(String(url).includes('cursor=cursor_previo'));
    });

    test('lanza ErrorAvisos 400 con filtro inválido', async () => {
      mockRespuestaError(400, 'ENTRADA_INVALIDA');
      const api = crearServicioAvisos({ transportar: mockFetch });
      await assert.rejects(api.listar(tokenValido, 'invalido' as Parameters<typeof api.listar>[1]), { name: 'ErrorAvisos', status: 400, codigo: 'ENTRADA_INVALIDA' });
    });
  });

  describe('marcarLectura', () => {
    test('marca aviso como leído y devuelve contador actualizado', async () => {
      mockRespuestaOk(marcadoEjemplo);
      const api = crearServicioAvisos({ transportar: mockFetch });
      const resultado = await api.marcarLectura(tokenValido, '000000006735d56dc1a05f653738c84182ef03d6b8504a12b4812aa9be9519e7');
      assert.deepEqual(resultado, marcadoEjemplo);
      const [url, opciones] = mockFetch.mock.calls[0].arguments;
      assert.ok(String(url).includes('/api/ciudadano/avisos/000000006735d56dc1a05f653738c84182ef03d6b8504a12b4812aa9be9519e7/lectura'));
      assert.equal(opciones?.method, 'PUT');
    });

    test('lanza ErrorAvisos 404 si aviso no existe', async () => {
      mockRespuestaError(404, 'AVISO_NO_ENCONTRADO');
      const api = crearServicioAvisos({ transportar: mockFetch });
      await assert.rejects(api.marcarLectura(tokenValido, '000000006735d56dc1a05f653738c84182ef03d6b8504a12b4812aa9be9519e7'), { name: 'ErrorAvisos', status: 404, codigo: 'AVISO_NO_ENCONTRADO' });
    });

    test('lanza ErrorAvisos 400 con ID inválido', async () => {
      const api = crearServicioAvisos({ transportar: mockFetch });
      await assert.rejects(api.marcarLectura(tokenValido, 'id-invalido'), { name: 'ErrorAvisos', status: 400, codigo: 'ENTRADA_INVALIDA' });
    });
  });

  describe('manejo de red', () => {
    test('lanza ErrorAvisos ERROR_RED en fallo de red', async () => {
      mockFetch.mock.mockImplementation(() => Promise.reject(new Error('Network error')));
      const api = crearServicioAvisos({ transportar: mockFetch });
      await assert.rejects(api.resumen(tokenValido), { name: 'ErrorAvisos', status: 0, codigo: 'ERROR_RED' });
    });

    test('respeta AbortSignal', async () => {
      mockRespuestaOk(resumenEjemplo);
      const controller = new AbortController();
      controller.abort();
      const api = crearServicioAvisos({ transportar: mockFetch });
      await assert.rejects(api.resumen(tokenValido, controller.signal), { name: 'ErrorAvisos', codigo: 'ERROR_RED' });
      assert.equal(mockFetch.mock.callCount(), 0);
    });
  });
});
test('rechaza fechas, referencias y contadores malformados', async () => {
  const api = crearServicioAvisos({ transportar: mockFetch });
  for (const parcial of [{ publicado_en: '2026-02-30T00:00:00.000Z' }, { leido_en: 'inválida' },
    { referencia: { tipo: 'privada', id: 'a'.repeat(24) } }, { referencia: { tipo: 'reporte', id: 'inválido' } }]) {
    mockRespuestaOk({ ...avisosEjemplo, avisos: [{ ...avisosEjemplo.avisos[0], ...parcial }] });
    await assert.rejects(api.listar(tokenValido), { codigo: 'RESPUESTA_INVALIDA' });
  }
  for (const total of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    mockRespuestaOk({ ...resumenEjemplo, sin_leer_total: total });
    await assert.rejects(api.resumen(tokenValido), { codigo: 'RESPUESTA_INVALIDA' });
  }
});

test('un acuse de otro aviso se trata como resultado incierto', async () => {
  const api = crearServicioAvisos({ transportar: mockFetch });
  mockRespuestaOk({ ...marcadoEjemplo, id: 'b'.repeat(64) });
  await assert.rejects(api.marcarLectura(tokenValido, marcadoEjemplo.id), { codigo: 'RESPUESTA_INVALIDA', incierto: true });
});

test('un timeout HTTP sin JSON requiere reconciliación del PUT', async () => {
  mockFetch.mock.mockImplementation(async () => new Response('Timeout', { status: 408 }));
  const api = crearServicioAvisos({ transportar: mockFetch });
  await assert.rejects(api.marcarLectura(tokenValido, marcadoEjemplo.id), { status: 408, incierto: true });
});

test('la espera de Clerk se cancela y tiene un límite de tiempo', async () => {
  const pendiente = () => new Promise<string>(() => {});
  const control = new AbortController();
  const consulta = obtenerTokenAvisos(pendiente, control.signal);
  control.abort();
  await assert.rejects(consulta, { status: 0 });
  await assert.rejects(obtenerTokenAvisos(pendiente, new AbortController().signal, 1), { status: 0 });
});
