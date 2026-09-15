import test from 'node:test';
import assert from 'node:assert/strict';
import { SpectatorCamera } from '../src/client/spectator-camera.js';

test('spectator can zoom and pan without moving beyond the court', () => {
  const camera = new SpectatorCamera();
  camera.magnify(-1000);
  assert.ok(camera.zoom > 1);
  camera.pan(100, 50);
  assert.ok(camera.x < 600 && camera.y < 400);
  camera.pan(100000, -100000);
  assert.equal(camera.x, 600 / camera.zoom);
  assert.equal(camera.y, 800 - 400 / camera.zoom);
  camera.magnify(100000);
  assert.equal(camera.zoom, 1);
  assert.equal(camera.x, 600);
  assert.equal(camera.y, 400);
  camera.magnify(-100000);
  assert.equal(camera.zoom, 3);
  camera.reset();
  const scene = { scale: { set: z => assert.equal(z, 1) }, position: { set: (x, y) => assert.deepEqual([x, y], [0, 0]) } };
  camera.apply(scene);
});
