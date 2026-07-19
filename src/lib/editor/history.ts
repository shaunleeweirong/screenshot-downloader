export class History<T> {
  private states: T[];
  private index: number;
  private limit: number;

  constructor(initial: T, limit = 50) {
    this.states = [initial];
    this.index = 0;
    this.limit = Math.max(1, limit);
  }

  current(): T {
    return this.states[this.index];
  }

  push(state: T): void {
    this.states = this.states.slice(0, this.index + 1);
    this.states.push(state);
    if (this.states.length > this.limit) this.states.shift();
    this.index = this.states.length - 1;
  }

  undo(): T {
    if (this.canUndo()) this.index--;
    return this.current();
  }

  redo(): T {
    if (this.canRedo()) this.index++;
    return this.current();
  }

  canUndo(): boolean {
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index < this.states.length - 1;
  }
}
