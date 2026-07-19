import { describe, it, expect } from 'vitest';
import { History } from '../../src/lib/editor/history';

describe('History', () => {
  it('starts with the initial state and no undo/redo', () => {
    const h = new History(0);
    expect(h.current()).toBe(0);
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });
  it('push then undo/redo walks the timeline', () => {
    const h = new History(0);
    h.push(1); h.push(2);
    expect(h.current()).toBe(2);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBe(0);
    expect(h.canUndo()).toBe(false);
    expect(h.redo()).toBe(1);
  });
  it('push after undo clears the redo tail', () => {
    const h = new History(0);
    h.push(1); h.push(2); h.undo();
    h.push(9);
    expect(h.current()).toBe(9);
    expect(h.canRedo()).toBe(false);
  });
  it('respects the limit (drops oldest)', () => {
    const h = new History(0, 3);
    h.push(1); h.push(2); h.push(3); // states: [1,2,3] after dropping 0
    expect(h.canUndo()).toBe(true);
    h.undo(); h.undo();
    expect(h.canUndo()).toBe(false); // only 3 states retained
  });
});
