import { describe, it, expect } from 'vitest';
import { addAnnotation, updateAnnotation, removeAnnotation, reorder } from '../../src/lib/editor/scene';
import { emptyScene } from '../../src/lib/editor/types';
import type { Annotation } from '../../src/lib/editor/types';

const rect = (id: string): Annotation => ({ id, type: 'rect', x: 0, y: 0, w: 10, h: 10, style: { stroke: '#f00', strokeWidth: 2, fill: 'none', opacity: 1, fontSize: 12 } });

describe('scene ops', () => {
  it('addAnnotation appends immutably', () => {
    const s0 = emptyScene();
    const s1 = addAnnotation(s0, rect('a'));
    expect(s0.annotations).toHaveLength(0);
    expect(s1.annotations.map((a) => a.id)).toEqual(['a']);
  });
  it('addAnnotation bumps nextStep past a step annotation', () => {
    const s = addAnnotation(emptyScene(), { id: 's', type: 'step', x: 5, y: 5, n: 1, style: { stroke: '#f00', strokeWidth: 2, fill: 'none', opacity: 1, fontSize: 24 } });
    expect(s.nextStep).toBe(2);
  });
  it('updateAnnotation patches only the matching id', () => {
    const s = addAnnotation(addAnnotation(emptyScene(), rect('a')), rect('b'));
    const u = updateAnnotation(s, 'b', { x: 99 } as Partial<Annotation>);
    expect(u.annotations.find((a) => a.id === 'b')).toMatchObject({ x: 99 });
    expect(u.annotations.find((a) => a.id === 'a')).toMatchObject({ x: 0 });
  });
  it('removeAnnotation drops by id', () => {
    const s = removeAnnotation(addAnnotation(emptyScene(), rect('a')), 'a');
    expect(s.annotations).toHaveLength(0);
  });
  it('reorder front moves to end, back moves to start', () => {
    const s = addAnnotation(addAnnotation(emptyScene(), rect('a')), rect('b'));
    expect(reorder(s, 'a', 'front').annotations.map((a) => a.id)).toEqual(['b', 'a']);
    expect(reorder(s, 'b', 'back').annotations.map((a) => a.id)).toEqual(['b', 'a']);
  });
});
