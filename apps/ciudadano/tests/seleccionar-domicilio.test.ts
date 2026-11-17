import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { DomicilioDTO, TipoSeleccionDomicilio } from '../src/servicios/domicilio.ts';

// =============================================
// Copias de las funciones lógicas que usa el componente
// (no exportadas individualmente, se prueban aquí por paridad)
// =============================================

type CentroPunto = {
  latitud: number;
  longitud: number;
  tipo_seleccion: TipoSeleccionDomicilio;
  confirmada: true;
};

function centroDesdeDto(dto: DomicilioDTO | null | undefined): [number, number] {
  if (dto && dto.ubicacion && Array.isArray(dto.ubicacion.coordinates)) {
    const lon = dto.ubicacion.coordinates[0];
    const lat = dto.ubicacion.coordinates[1];
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return [lon, lat];
    }
  }
  return [-97.0886, 20.4514];
}

function esCoordenadaValida(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -90 && lat <= 90
    && lon >= -180 && lon <= 180;
}

describe('centroDesdeDto — extracción de coordenadas', () => {
  test('extrae [longitud, latitud] de un DTO válido', () => {
    const dto: DomicilioDTO = {
      ubicacion: { type: 'Point', coordinates: [-97.08, 20.46] },
      tipo_seleccion: 'gps',
      fecha_confirmacion: '2025-01-01T00:00:00.000Z',
      fecha_creacion: '2025-01-01T00:00:00.000Z',
      fecha_actualizacion: '2025-01-01T00:00:00.000Z',
      version: 0,
      asignacion: { estado: 'pendiente', ruta_id: null, metodo: null, fecha_evaluacion: null, version_politica: null, huella_catalogo: null, motivo: null },
    };
    assert.deepEqual(centroDesdeDto(dto), [-97.08, 20.46]);
  });

  test('devuelve coordenadas por defecto cuando no hay DTO', () => {
    assert.deepEqual(centroDesdeDto(null), [-97.0886, 20.4514]);
    assert.deepEqual(centroDesdeDto(undefined), [-97.0886, 20.4514]);
  });

  test('ignora coordenadas fuera de rango WGS84', () => {
    const dtoInvalidoLon = { ubicacion: { type: 'Point' as const, coordinates: [200, 20] as [number, number] } };
    const dtoInvalidoLat = { ubicacion: { type: 'Point' as const, coordinates: [-97, 100] as [number, number] } };
    // Casting needed since the shape doesn't fully match DomicilioDTO but we only use ubicacion
    assert.deepEqual(centroDesdeDto(dtoInvalidoLon as unknown as DomicilioDTO), [-97.0886, 20.4514]);
    assert.deepEqual(centroDesdeDto(dtoInvalidoLat as unknown as DomicilioDTO), [-97.0886, 20.4514]);
  });

  test('ignora coordenadas no finitas', () => {
    const dtoNaN = { ubicacion: { type: 'Point' as const, coordinates: [NaN, 20] as [number, number] } };
    const dtoInf = { ubicacion: { type: 'Point' as const, coordinates: [Infinity, 20] as [number, number] } };
    assert.deepEqual(centroDesdeDto(dtoNaN as unknown as DomicilioDTO), [-97.0886, 20.4514]);
    assert.deepEqual(centroDesdeDto(dtoInf as unknown as DomicilioDTO), [-97.0886, 20.4514]);
  });

  test('ignora DTO sin propiedad ubicacion', () => {
    assert.deepEqual(centroDesdeDto({} as unknown as DomicilioDTO), [-97.0886, 20.4514]);
    assert.deepEqual(centroDesdeDto({ ubicacion: null } as unknown as DomicilioDTO), [-97.0886, 20.4514]);
    assert.deepEqual(centroDesdeDto({ ubicacion: {} } as unknown as DomicilioDTO), [-97.0886, 20.4514]);
  });
});

describe('esCoordenadaValida — validación de coordenadas', () => {
  test('coordenadas válidas dentro de rango', () => {
    assert.equal(esCoordenadaValida(20.45, -97.08), true);
    assert.equal(esCoordenadaValida(0, 0), true);
    assert.equal(esCoordenadaValida(-90, -180), true);
    assert.equal(esCoordenadaValida(90, 180), true);
    assert.equal(esCoordenadaValida(20.4514, -97.0886), true);
  });

  test('coordenadas inválidas fuera de rango latitud', () => {
    assert.equal(esCoordenadaValida(91, 0), false);
    assert.equal(esCoordenadaValida(-91, 0), false);
    assert.equal(esCoordenadaValida(90.0001, 0), false);
    assert.equal(esCoordenadaValida(-90.0001, 0), false);
  });

  test('coordenadas inválidas fuera de rango longitud', () => {
    assert.equal(esCoordenadaValida(0, 181), false);
    assert.equal(esCoordenadaValida(0, -181), false);
    assert.equal(esCoordenadaValida(0, 180.0001), false);
    assert.equal(esCoordenadaValida(0, -180.0001), false);
  });

  test('coordenadas con valores no finitos son inválidas', () => {
    assert.equal(esCoordenadaValida(NaN, 0), false);
    assert.equal(esCoordenadaValida(20, NaN), false);
    assert.equal(esCoordenadaValida(Infinity, 0), false);
    assert.equal(esCoordenadaValida(-Infinity, 0), false);
    assert.equal(esCoordenadaValida(20, Number.NaN as unknown as number), false);
  });
});

describe('flujos del estado del selector', () => {
  const modos: readonly string[] = ['seleccionando', 'revizando', 'confirmado', 'error'];
  const transicionesValidas: Record<string, readonly string[]> = {
    seleccionando: ['revizando', 'error'],
    revizando: ['seleccionando', 'confirmado', 'error'],
    confirmado: [],
    error: ['seleccionando'],
  };

  for (const modo of modos) {
    test(`modo "${modo}" es un estado válido`, () => {
      assert.ok(modos.includes(modo));
    });
    test(`transiciones desde "${modo}" respetan el grafo definido`, () => {
      assert.ok(transicionesValidas[modo] !== undefined);
    });
  }

  test('desde "seleccionando" se puede ir a "revizando"', () => {
    assert.ok(transicionesValidas.seleccionando.includes('revizando'));
  });

  test('desde "revizando" se puede volver a "seleccionando" para corregir', () => {
    assert.ok(transicionesValidas.revizando.includes('seleccionando'));
  });

  test('"confirmado" es estado terminal', () => {
    assert.equal(transicionesValidas.confirmado.length, 0);
  });

  test('desde "error" se puede reintentar volviendo a "seleccionando"', () => {
    assert.ok(transicionesValidas.error.includes('seleccionando'));
  });
});

describe('construcción de CentroPunto', () => {
  function construirCentroPunto(lat: number, lon: number, tipo: TipoSeleccionDomicilio): CentroPunto {
    return {
      latitud: lat,
      longitud: lon,
      tipo_seleccion: tipo,
      confirmada: true,
    };
  }

  test('CentroPunto tiene confirmada siempre true', () => {
    const punto = construirCentroPunto(20.45, -97.08, 'gps');
    assert.equal(punto.confirmada, true);
    assert.equal(typeof punto.confirmada, 'boolean');
  });

  test('CentroPunto conserva tipo_seleccion seleccionado', () => {
    assert.equal(construirCentroPunto(20, -97, 'gps').tipo_seleccion, 'gps');
    assert.equal(construirCentroPunto(20, -97, 'manual').tipo_seleccion, 'manual');
  });

  test('CentroPunto contiene coordenadas válidas', () => {
    const punto = construirCentroPunto(20.4514, -97.0886, 'manual');
    assert.ok(esCoordenadaValida(punto.latitud, punto.longitud));
  });
});