import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configurar, normalizarVehiculo, normalizarRutas } from '../src/servicios/contratos.ts';

test('Android exige API HTTPS absoluta; no acepta el origen local como API', () => {
  assert.throws(() => configurar({ android: true, api: '' }), /HTTPS/);
  assert.throws(() => configurar({ android: true, api: 'http://backend.test' }), /HTTPS/);
  assert.equal(configurar({ android: true, api: 'https://backend.test/' }).api, 'https://backend.test');
});
test('web permite API del mismo origen y rechaza destinos con credenciales', () => {
  assert.equal(configurar({ android: false }).api, '');
  assert.throws(() => configurar({ android: false, api: 'https://user:pass@backend.test' }));
});
test('una posición sin fecha verificable nunca se declara en vivo', () => {
  const v = normalizarVehiculo({ id: '1', latitud: 20.45, longitud: -97.08 }, 'api');
  assert.equal(v?.estado, 'sin-fecha');
  assert.equal(v?.origen, 'api');
});
test('demo conserva su procedencia y coordenadas inválidas se rechazan', () => {
  assert.equal(normalizarVehiculo({ id: 'demo', latitud: 20, longitud: -97 }, 'demo')?.origen, 'demo');
  assert.equal(normalizarVehiculo({ id: 'bad', latitud: 200, longitud: -97 }, 'api'), null);
  assert.equal(normalizarVehiculo({ id: 'bad', latitud: '20', longitud: -97 }, 'api'), null);
});
test('normaliza rutas activas sin unir partes independientes ni invertir lon/lat', () => {
  const rutas = normalizarRutas({ exito: true, datos: [
    { id_ruta: 'A', nombre: 'Centro', trazado_geojson: { type: 'MultiLineString', coordinates: [ [[-97,20],[-96,21]], [[-95,22],[-94,23]] ] } },
    { id_ruta: 'B', activa: false, trazado_geojson: { type: 'LineString', coordinates: [[-97,20],[-96,21]] } }
  ] });
  assert.equal(rutas.features.length, 1);
  assert.deepEqual(rutas.features[0].geometry.coordinates, [ [[-97,20],[-96,21]], [[-95,22],[-94,23]] ]);
});
test('error de contrato no se disfraza de lista vacía; geometría inválida se descarta', () => {
  assert.throws(() => normalizarRutas({ exito: false, datos: [] }));
  assert.throws(() => normalizarRutas({ exito: true }));
  assert.equal(normalizarRutas({ exito: true, datos: [{ trazado_geojson: { type: 'LineString', coordinates: [[-97,20],[999,20]] } }] }).features.length, 0);
});
