import type { Annotation, Scene } from './types';

export function addAnnotation(scene: Scene, a: Annotation): Scene {
  const nextStep = a.type === 'step' ? Math.max(scene.nextStep, a.n + 1) : scene.nextStep;
  return { annotations: [...scene.annotations, a], nextStep };
}

export function updateAnnotation(scene: Scene, id: string, patch: Partial<Annotation>): Scene {
  return {
    ...scene,
    annotations: scene.annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)),
  };
}

export function removeAnnotation(scene: Scene, id: string): Scene {
  return { ...scene, annotations: scene.annotations.filter((a) => a.id !== id) };
}

export function reorder(scene: Scene, id: string, dir: 'front' | 'back'): Scene {
  const idx = scene.annotations.findIndex((a) => a.id === id);
  if (idx < 0) return scene;
  const arr = scene.annotations.slice();
  const [item] = arr.splice(idx, 1);
  if (dir === 'front') arr.push(item);
  else arr.unshift(item);
  return { ...scene, annotations: arr };
}
