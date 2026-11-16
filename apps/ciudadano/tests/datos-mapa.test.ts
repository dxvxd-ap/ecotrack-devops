import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarDatosMapa, datosVisibles, permitirDemo } from '../src/servicios/datos-mapa.ts';

test('demo solo en desarrollo web con habilitación explícita; nunca por defecto o en producción/APK', () => {
  assert.equal(permitirDemo({ desarrollo: true }), false);
  assert.equal(permitirDemo({ desarrollo: false, habilitada: 'true' }), false);
  assert.equal(permitirDemo({ desarrollo: true, habilitada: 'true', android: true }), false);
  assert.equal(permitirDemo({ desarrollo: true, habilitada: 'false' }), false);
  assert.equal(permitirDemo({ desarrollo: true, habilitada: 'true' }), true);
});
test('inicio real → demo → salida hace otro GET y sustituye toda la geometría y vehículos demo', async () => {
  let llamadas = 0;
  const transportar: typeof fetch = async url => {
    assert.equal(url, '/api/rutas'); llamadas++;
    return Response.json({ exito: true, datos: [{ id_ruta: `real-${llamadas}`, nombre: 'Municipal', color_mapa: '#800080', trazado_geojson: { type: 'LineString', coordinates: [[-97.09,20.45],[-97.08,20.46]] } }] });
  };
  const opciones = { origen: '', signal: new AbortController().signal };
  assert.equal((await cargarDatosMapa(opciones, transportar)).rutas.features[0].properties.id, 'real-1');
  const demo = await cargarDatosMapa({ ...opciones, demostracion: true }, transportar);
  assert.equal(demo.rutas.features[0].properties.id, 'demo');
  assert.equal(demo.vehiculos[0].origen, 'demo');
  const vuelta = await cargarDatosMapa(opciones, transportar);
  assert.equal(llamadas, 2);
  assert.equal(vuelta.rutas.features[0].properties.id, 'real-2');
  assert.deepEqual(vuelta.vehiculos, []);
});
test('si falla el GET al salir de demo se propaga error, sin conservar un recorrido simulado', async () => {
  const opciones = { origen: '', signal: new AbortController().signal };
  await cargarDatosMapa({ ...opciones, demostracion: true });
  await assert.rejects(cargarDatosMapa(opciones, async () => new Response(null, { status: 503 })));
});
test('en el primer render al cambiar de fuente nunca se dibuja el snapshot anterior con otra etiqueta', async () => {
  const demo = await cargarDatosMapa({ demostracion: true, origen: '', signal: new AbortController().signal });
  const salida = datosVisibles(demo, false);
  assert.deepEqual(salida.rutas.features, []);
  assert.deepEqual(salida.vehiculos, []);
  assert.equal(datosVisibles(demo, true).rutas.features[0].properties.id, 'demo');
});
