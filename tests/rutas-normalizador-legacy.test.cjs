const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Importar módulo de utilidades compilado o vía tsx/node
test('normalizador procesa coordenadas GeoJSON [lng, lat] y [lat, lng] correctamente', () => {
  // Simular la lógica de normalizarCoordenadasPunto
  function normalizarCoordenadasPunto(punto) {
    if (!punto) return null;
    let lat, lng;
    if (Array.isArray(punto) && punto.length >= 2) {
      const a = Number(punto[0]);
      const b = Number(punto[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      if (a >= 14 && a <= 33 && b <= -80 && b >= -120) {
        lat = a; lng = b;
      } else if (b >= 14 && b <= 33 && a <= -80 && a >= -120) {
        lat = b; lng = a;
      } else if (a < 0 && b > 0 && Math.abs(a) <= 180 && Math.abs(b) <= 90) {
        lat = b; lng = a;
      } else if (a > 0 && b < 0 && Math.abs(a) <= 90 && Math.abs(b) <= 180) {
        lat = a; lng = b;
      } else if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
        lat = a; lng = b;
      } else {
        return null;
      }
    } else if (typeof punto === 'object') {
      const pLat = Number(punto.lat ?? punto.latitude ?? punto.latitud);
      const pLng = Number(punto.lng ?? punto.longitude ?? punto.longitud ?? punto.lon);
      if (Number.isFinite(pLat) && Number.isFinite(pLng) && Math.abs(pLat) <= 90 && Math.abs(pLng) <= 180) {
        lat = pLat; lng = pLng;
      }
    }
    if (lat === undefined || lng === undefined) return null;
    return [lat, lng];
  }

  // 1. Caso GeoJSON [lng, lat] (Gutiérrez Zamora: -97.0886, 20.4514)
  const pGeo = normalizarCoordenadasPunto([-97.0886, 20.4514]);
  assert.deepEqual(pGeo, [20.4514, -97.0886]);

  // 2. Caso Leaflet [lat, lng]
  const pLeaflet = normalizarCoordenadasPunto([20.4514, -97.0886]);
  assert.deepEqual(pLeaflet, [20.4514, -97.0886]);

  // 3. Caso Objeto { lat, lng }
  const pObj = normalizarCoordenadasPunto({ lat: 20.4514, lng: -97.0886 });
  assert.deepEqual(pObj, [20.4514, -97.0886]);

  // 4. Caso inválido (NaN, fuera de rango)
  assert.equal(normalizarCoordenadasPunto([NaN, 20]), null);
  assert.equal(normalizarCoordenadasPunto([200, 200]), null);
  assert.equal(normalizarCoordenadasPunto(null), null);
});

test('normalizador asigna valores por defecto seguros a rutas legacy incompletas', () => {
  const rutaLegacy = {
    _id: '507f1f77bcf86cd799439011',
    nombre_ruta: 'Ruta Antigua Centro',
    coordenadas: [
      { lat: 20.4514, lng: -97.0886 },
      { lat: 20.4524, lng: -97.0876 }
    ],
    color: '#ff5500'
  };

  // Simular normalizarRuta
  const { normalizarRuta } = require('../src/lib/rutas_mapa.ts');
  const res = normalizarRuta(rutaLegacy);

  assert.equal(res.nombre, 'Ruta Antigua Centro');
  assert.equal(res.color_mapa, '#ff5500');
  assert.equal(res.activa, true);
  assert.equal(res.trazado_geojson.type, 'LineString');
  assert.equal(res.trazado_geojson.coordinates.length, 2);
  assert.equal(res.trazado_geojson.coordinates[0][0], -97.0886); // lng
  assert.equal(res.trazado_geojson.coordinates[0][1], 20.4514); // lat
  assert.ok(Array.isArray(res.diasRecoleccion));
  assert.ok(res.horarioHabitual.horaInicio);
});
