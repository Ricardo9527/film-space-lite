export class UIOperationHistory {
  constructor(limit = 100) {
    this.limit = Math.max(1, Number(limit) || 100);
    this.reset();
  }

  reset() {
    this.entries = [];
    this.cursor = 0;
  }

  record(entry) {
    if (!entry?.forward?.length || !entry?.inverse?.length) return false;
    this.entries.splice(this.cursor);
    this.entries.push(structuredClone(entry));
    if (this.entries.length > this.limit) this.entries.shift();
    this.cursor = this.entries.length;
    return true;
  }

  remove(id) {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index < 0) return false;
    this.entries.splice(index, 1);
    if (index < this.cursor) this.cursor -= 1;
    return true;
  }

  peekUndo() {
    return this.canUndo ? structuredClone(this.entries[this.cursor - 1]) : null;
  }

  peekRedo() {
    return this.canRedo ? structuredClone(this.entries[this.cursor]) : null;
  }

  commitUndo() {
    if (!this.canUndo) return false;
    this.cursor -= 1;
    return true;
  }

  commitRedo() {
    if (!this.canRedo) return false;
    this.cursor += 1;
    return true;
  }

  get canUndo() {
    return this.cursor > 0;
  }

  get canRedo() {
    return this.cursor < this.entries.length;
  }
}
