// historyManager.js — Per-page undo/redo stacks for ScratchDump
// Pure data structure — no DOM, no storage, no events.
'use strict';

// Steps, not keystrokes: panel.js groups typing into one snapshot per word or
// pause, and snapshots hold idb: refs rather than image data, so a hundred of
// them cost little.
const UNDO_LIMIT = 100;

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
   * Truncates forward history and trims oldest if over limit. A snapshot equal
   * to the current one is not a step, and is dropped — revisiting a page would
   * otherwise stack a copy of it every time and throw away its redo.
   */
  push(folderKey, pageIdx, snapshot) {
    const state = _getState(folderKey, pageIdx);
    if (state.pointer >= 0 && state.stack[state.pointer] === snapshot) return;
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
   * Forget a deleted page's history and move every later page's down one, so
   * the stacks keep lining up with the page indices they belong to.
   */
  dropPage(folderKey, pageIdx) {
    const pages = _undoStacks[folderKey];
    if (!pages) return;
    const later = Object.keys(pages).map(Number).filter(i => i > pageIdx).sort((a, b) => a - b);
    delete pages[pageIdx];
    for (const i of later) { pages[i - 1] = pages[i]; delete pages[i]; }
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
