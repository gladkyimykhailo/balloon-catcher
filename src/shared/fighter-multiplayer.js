import { createArcade, updateArcade } from './arcade.js';

export function fighterInput(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  return { dx: Number.isFinite(value.dx) ? Math.max(-1, Math.min(1, value.dx)) : 0,
    jump: value.jump === true, block: value.block === true,
    punch: value.punch === true, kick: value.kick === true, special: value.special === true };
}
export function createFighterMatch() {
  return Object.assign(createArcade('fighter'), { multiplayer: true, winner: null });
}
export function stepFighterMatch(state, dt, inputs) {
  updateArcade(state, dt, { players: [fighterInput(inputs?.[0]), fighterInput(inputs?.[1])] });
}
