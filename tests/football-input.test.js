import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/client/input.js';

function controls() {
  const input = Object.create(Input.prototype);
  input.targets = [{ x: 1100, y: 350 }];
  input.keys = new Set();
  input.footballKick = false;
  return input;
}

test('football possession separates aiming from running and consumes each shot once', () => {
  const input = controls(), player = { x: 600, y: 420 };
  assert.deepEqual(input.footballControl(player, false), { x: 1100, y: 350, aimX: 1100, aimY: 350, kick: false, trip: false });
  input.footballKick = true;
  assert.deepEqual(input.footballControl(player, true), { x: 600, y: 420, aimX: 1100, aimY: 350, kick: true, trip: false });
  assert.equal(input.footballControl(player, true).kick, false);
  input.keys.add('KeyW'); input.keys.add('ArrowRight');
  assert.deepEqual(input.footballControl(player, true), { x: 670, y: 350, aimX: 1100, aimY: 350, kick: false, trip: false });
});
