import { WORLD } from '../shared/constants.js';

export class SpectatorCamera {
  constructor() { this.reset(); }
  reset(zoom = 1) { this.zoom = zoom; this.x = WORLD.w / 2; this.y = WORLD.h / 2; }
  pan(dx, dy) { this.x -= dx / this.zoom; this.y -= dy / this.zoom; this.clamp(); }
  magnify(delta) { this.zoom = Math.max(1, Math.min(3, this.zoom * Math.exp(-delta * 0.001))); this.clamp(); }
  clamp() {
    const halfW = WORLD.w / (2 * this.zoom), halfH = WORLD.h / (2 * this.zoom);
    this.x = Math.max(halfW, Math.min(WORLD.w - halfW, this.x));
    this.y = Math.max(halfH, Math.min(WORLD.h - halfH, this.y));
  }
  apply(scene) {
    scene.scale.set(this.zoom);
    scene.position.set(WORLD.w / 2 - this.x * this.zoom, WORLD.h / 2 - this.y * this.zoom);
  }
}
