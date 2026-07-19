import type { Point } from './types';

export interface View { scale: number; }

export function makeView(imageWidth: number, displayWidth: number): View {
  return { scale: displayWidth > 0 ? imageWidth / displayWidth : 1 };
}

export function toImage(p: Point, v: View): Point {
  return { x: p.x * v.scale, y: p.y * v.scale };
}

export function toDisplay(p: Point, v: View): Point {
  return { x: p.x / v.scale, y: p.y / v.scale };
}
