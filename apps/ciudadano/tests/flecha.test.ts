import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearFlecha } from '../src/mapas/flecha.ts';

test('el sprite apunta a la derecha: punta central y alas a la izquierda', () => {
  const sprite = crearFlecha();
  const alpha = (x: number, y: number) => sprite.data[(y * sprite.width + x) * 4 + 3];
  assert.equal(alpha(18,12), 255);
  assert.equal(alpha(7,3), 255);
  assert.equal(alpha(7,21), 255);
  assert.equal(alpha(18,3), 0);
  assert.equal(alpha(7,12), 0);
});
