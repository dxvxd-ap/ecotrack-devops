import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posicionParaMapa } from '../src/servicios/posicion.ts';

test('usa coordenadas, precisión y fecha de la lectura del dispositivo, no un punto fijo', () => {
  assert.deepEqual(posicionParaMapa({ coords: { latitude: 20.45123, longitude: -97.08976, accuracy: 14.5 }, timestamp: 1794682800000 }), {
    coordenadas: [-97.08976, 20.45123], precisionMetros: 15, timestamp: 1794682800000,
  });
});
test('rechaza lecturas inválidas antes de mover el marcador', () => {
  for (const coords of [{ latitude: 91, longitude: 1, accuracy: 1 }, { latitude: 20, longitude: NaN, accuracy: 1 }, { latitude: 20, longitude: -97, accuracy: -1 }]) {
    assert.throws(() => posicionParaMapa({ coords, timestamp: 1794682800000 }));
  }
});
