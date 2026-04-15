import { cloneDeepJSON } from "../utils/math.js";

export class UndoRedoManager {
  constructor(maxStates = 100) {
    this.maxStates = maxStates;
    this.undoStack = [];
    this.redoStack = [];
  }

  push(state) {
    this.undoStack.push(cloneDeepJSON(state));
    if (this.undoStack.length > this.maxStates) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(currentState) {
    if (this.undoStack.length === 0) {
      return null;
    }

    const previous = this.undoStack.pop();
    this.redoStack.push(cloneDeepJSON(currentState));
    return previous;
  }

  redo(currentState) {
    if (this.redoStack.length === 0) {
      return null;
    }

    const next = this.redoStack.pop();
    this.undoStack.push(cloneDeepJSON(currentState));
    return next;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
