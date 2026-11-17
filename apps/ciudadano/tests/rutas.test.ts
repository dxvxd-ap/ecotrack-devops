import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consultarRutas, limitesRuta } from '../src/servicios/rutas.ts';
import { normalizarRutas } from '../src/servicios/contratos.ts';

const fixture = { exito: true, datos: [{ id_ruta: 'CENTRO', nombre: 'Centro', descripcion: 'Lunes y jueves', distancia_estimada_km: 3.5, duracion_estimada_min: 40, trazado_geojson: { type: 'MultiLineString', coordinates: [ [[-97.09,20.45],[-97.08,20.46]], [[-97.11,20.44],[-97.10,20.455]] ] } }] };
test('consulta GET /api/rutas y conserva detalles municipales y límites de todas las partes', async () => {
  let llamada = '';
  const rutas = await consultarRutas('', new AbortController().signal, async (url, opciones) => {
    llamada = String(url); assert.equal(opciones?.method, 'GET');
    return Response.json(fixture);
  });
  assert.equal(llamada, '/api/rutas');
  assert.equal(rutas.features[0].properties.descripcion, 'Lunes y jueves');
  assert.equal(rutas.features[0].properties.distanciaKm, 3.5);
  assert.equal(rutas.features[0].properties.duracionMin, 40);
  assert.deepEqual(limitesRuta(rutas.features[0]), [[-97.11,20.44],[-97.08,20.46]]);
});
test('HTTP 500 o HTML no se presentan como rutas vacías', async () => {
  await assert.rejects(consultarRutas('', new AbortController().signal, async () => new Response('error', { status: 500 })), /consultar/);
  await assert.rejects(consultarRutas('', new AbortController().signal, async () => new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } })), /consultar/);
});
test('la cancelación alcanza el transporte sin depender de AbortSignal.any de Safari', async () => {
  const control = new AbortController();
  const solicitud = consultarRutas('', control.signal, async (_url, opciones) => {
    return new Promise<Response>((_resolve, reject) => opciones!.signal!.addEventListener('abort', () => reject(new DOMException('cancelado', 'AbortError')), { once: true }));
  });
  control.abort(); await assert.rejects(solicitud, { name: 'AbortError' });
});
test('límites de LineString válidos, sin reinterpretar la secuencia', () => {
  const ruta = normalizarRutas({ exito: true, datos: [{ trazado_geojson: { type: 'LineString', coordinates: [[-97.08,20.46],[-97.09,20.45]] } }] }).features[0];
  assert.deepEqual(limitesRuta(ruta), [[-97.09,20.45],[-97.08,20.46]]);
});
test('conserva el sentido este, oeste, norte, sur y partes invertidas del GeoJSON', () => {
  const lineas = [
    [[-97.09,20.45],[-97.08,20.45]],
    [[-97.08,20.45],[-97.09,20.45]],
    [[-97.09,20.45],[-97.09,20.46]],
    [[-97.09,20.46],[-97.09,20.45]],
  ];
  const rutas = normalizarRutas({ exito: true, datos: lineas.map((coordinates, i) => ({ id_ruta: String(i), trazado_geojson: { type: 'LineString', coordinates } })) });
  assert.deepEqual(rutas.features.map(r => r.geometry.coordinates), lineas);
  const multi = normalizarRutas({ exito: true, datos: [{ trazado_geojson: { type: 'MultiLineString', coordinates: [lineas[0], lineas[3]] } }] });
  assert.deepEqual(multi.features[0].geometry.coordinates, [lineas[0], lineas[3]]);
});
