// historyManager.js — Per-page undo/redo stacks for ScratchDump
// Pure data structure — no DOM, no storage, no events.
'use strict';

const UNDO_LIMIT = 50;

// Internal store: { [folderKey]: { [pageIdx]: { stack, pointer } } }
const _undoStacks = {};

function _getState(folderKey, pageIdx) {
  if (!_undoStacks[folderKey]) _undoStacks[folderKey] = {};
  if (!_undoStacks[folderKey][pageIdx]) {
    _undoStacks[folderKey][pageIdx] = { stack: [], pointer: -1 };
  }
  return _undoStacks[folderKey][pageIdx];
}

const History = {
  /**
   * Push a snapshot onto the stack for the current page.
   * Truncates forward history and trims oldest if over limit.
   */
  push(folderKey, pageIdx, snapshot) {
    const state = _getState(folderKey, pageIdx);
    state.stack = state.stack.slice(0, state.pointer + 1);
    state.stack.push(snapshot);
    if (state.stack.length > UNDO_LIMIT) {
      const excess = state.stack.length - UNDO_LIMIT;
      state.stack = state.stack.slice(excess);
    }
    state.pointer = state.stack.length - 1;
  },

  /**
   * Undo — returns the previous snapshot, or null if at the beginning.
   */
  undo(folderKey, pageIdx) {
    const state = _getState(folderKey, pageIdx);
    if (state.pointer <= 0) return null;
    state.pointer--;
    return state.stack[state.pointer];
  },

  /**
   * Redo — returns the next snapshot, or null if at the end.
   */
  redo(folderKey, pageIdx) {
    const state = _getState(folderKey, pageIdx);
    if (state.pointer >= state.stack.length - 1) return null;
    state.pointer++;
    return state.stack[state.pointer];
  },

  /**
   * Initialise stacks for a folder (e.g. on folder load).
   */
  ensureFolder(folderKey) {
    if (!_undoStacks[folderKey]) _undoStacks[folderKey] = {};
  },

  /**
   * Check whether undo/redo are possible.
   */
  canUndo(folderKey, pageIdx) {
    const state = _getState(folderKey, pageIdx);
    return state.pointer > 0;
  },

  canRedo(folderKey, pageIdx) {
    const state = _getState(folderKey, pageIdx);
    return state.pointer < state.stack.length - 1;
  }
};
