/**
 * state.js — Reactive state manager for the label editor
 * Manages labels collection, current selection, undo/redo, and auto-persistence
 */

import { dbGet, dbPut, STORES, saveImage, loadImage, saveAutoState, loadAutoState, dbGetAll, deleteImage } from './db.js';

/* ---------- Default Structures ---------- */

function createDefaultTextElement(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    content: 'Your Text',
    x: 10,           // % from left
    y: 10,           // % from top
    width: 80,       // % of label width
    height: 30,      // % of label height
    fontFamily: 'Inter',
    fontSize: 16,    // pt
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    textTransform: 'none', // none | uppercase | lowercase | capitalize
    textAlign: 'center',
    lineHeight: 1.4,
    letterSpacing: 0,
    color: '#000000',
    highlightColor: 'transparent',
    ...overrides,
  };
}

function createDefaultImageElement(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    type: 'image',
    src: '',          // data URL or external URL
    imageId: null,    // reference to IndexedDB image store
    x: 10,
    y: 10,
    width: 30,
    height: 40,
    objectFit: 'contain',
    opacity: 1,
    rotation: 0,
    ...overrides,
  };
}

function createDefaultLabel(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    name: 'New Label',
    widthMM: 90,
    heightMM: 50,
    unit: 'mm',            // mm | cm | in
    elements: [createDefaultTextElement()],
    background: {
      type: 'color',       // color | gradient | image
      color: '#ffffff',
      gradient: {
        type: 'linear',    // linear | radial
        angle: 135,
        stops: [
          { color: '#ffffff', position: 0 },
          { color: '#f0f0f0', position: 100 },
        ],
      },
      image: {
        src: '',
        fit: 'cover',      // cover | contain | stretch
        opacity: 1,
      },
    },
    border: {
      enabled: false,
      width: 1,            // px
      style: 'solid',
      color: '#000000',
      radius: 0,           // px
    },
    autoLayout: {
      enabled: true,          // Auto-position elements
      imagePosition: 'left',  // left | right | top | bottom | none
      imageSizePercent: 30,    // % of label width/height allocated to images
      padding: 8,             // % padding inside label
      gap: 2,                 // % gap between elements
      textVerticalAlign: 'center', // top | center | bottom
    },
    copies: 1,
    ...overrides,
  };
}

/* ---------- State ---------- */

const state = {
  labels: [],
  activeLabelId: null,
  activeElementIds: new Set(),
  printSettings: {
    pageFormat: 'A4',
    orientation: 'portrait',
    marginMM: 5,
    gapMM: 2,
    cutMarksType: 'both', // none | inside | outside | both
    singleLabel: false,
  },
  zoom: 1,
  currentView: 'editor', // editor | print | import
  selectedLabelIds: new Set(),
  searchQuery: '',
  sortMode: 'none', // none | name_asc | name_desc | size_asc | size_desc
};

/* ---------- History (Undo/Redo) ---------- */

const MAX_HISTORY = 50;
let _history = [];
let _historyIndex = -1;
let _skipHistoryPush = false;

function _snapshotLabels() {
  return JSON.parse(JSON.stringify(state.labels));
}

let _historyDebounce = null;
function pushHistory() {
  if (_skipHistoryPush) return;
  
  clearTimeout(_historyDebounce);
  _historyDebounce = setTimeout(() => {
    // Trim future
    _history = _history.slice(0, _historyIndex + 1);
    _history.push(_snapshotLabels());
    if (_history.length > MAX_HISTORY) _history.shift();
    _historyIndex = _history.length - 1;
  }, 300);
}

function undo() {
  if (_historyIndex <= 0) return false;
  _historyIndex--;
  _skipHistoryPush = true;
  state.labels = JSON.parse(JSON.stringify(_history[_historyIndex]));
  _skipHistoryPush = false;
  _notifyAll();
  _scheduleSave();
  return true;
}

function redo() {
  if (_historyIndex >= _history.length - 1) return false;
  _historyIndex++;
  _skipHistoryPush = true;
  state.labels = JSON.parse(JSON.stringify(_history[_historyIndex]));
  _skipHistoryPush = false;
  _notifyAll();
  _scheduleSave();
  return true;
}

/* ---------- Subscriptions ---------- */

const _subscribers = new Set();

function subscribe(fn) {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

let _notifyFrame = null;
function _notifyAll() {
  if (_notifyFrame) cancelAnimationFrame(_notifyFrame);
  _notifyFrame = requestAnimationFrame(() => {
    for (const fn of _subscribers) {
      try { fn(state); } catch (e) { console.error('State subscriber error:', e); }
    }
  });
}

/* ---------- Auto-save (debounced) ---------- */

let _saveTimer = null;

function _scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      await saveAutoState({
        labels: state.labels,
        activeLabelId: state.activeLabelId,
        printSettings: state.printSettings,
        zoom: state.zoom,
      });
    } catch (e) {
      console.error('Auto-save failed:', e);
    }
  }, 300);
}

/* ---------- State Mutators ---------- */

function setView(view) {
  state.currentView = view;
  _notifyAll();
}

function setZoom(z) {
  state.zoom = Math.max(0.25, Math.min(4, z));
  _notifyAll();
  _scheduleSave();
}

function addLabel(overrides = {}) {
  const label = createDefaultLabel(overrides);
  state.labels.push(label);
  state.activeLabelId = label.id;
  state.activeElementIds.clear();
  if (label.elements[0]) {
    state.activeElementIds.add(label.elements[0].id);
  }
  pushHistory();
  _notifyAll();
  _scheduleSave();
  return label;
}

function duplicateLabel(labelId) {
  const source = state.labels.find((l) => l.id === labelId);
  if (!source) return null;
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = crypto.randomUUID();
  copy.name = `${source.name} (copy)`;
  copy.elements.forEach((el) => { el.id = crypto.randomUUID(); });
  state.labels.push(copy);
  state.activeLabelId = copy.id;
  pushHistory();
  _notifyAll();
  _scheduleSave();
  return copy;
}

function removeLabel(labelId) {
  const idx = state.labels.findIndex((l) => l.id === labelId);
  if (idx === -1) return;
  state.labels.splice(idx, 1);
  state.selectedLabelIds.delete(labelId);
  if (state.activeLabelId === labelId) {
    state.activeLabelId = state.labels[Math.min(idx, state.labels.length - 1)]?.id ?? null;
    state.activeElementId = null;
  }
  pushHistory();
  _notifyAll();
  _scheduleSave();
  gcImages();
}

function deleteAllLabels() {
  state.labels = [];
  state.selectedLabelIds.clear();
  state.activeElementIds.clear();
  pushHistory();
  _notifyAll();
  _scheduleSave();
}

function deleteSelectedLabels() {
  if (state.selectedLabelIds.size === 0) return;
  state.labels = state.labels.filter(l => !state.selectedLabelIds.has(l.id));
  if (state.selectedLabelIds.has(state.activeLabelId)) {
    state.activeLabelId = state.labels[0]?.id ?? null;
    state.activeElementId = null;
  }
  state.selectedLabelIds.clear();
  pushHistory();
  _notifyAll();
  _scheduleSave();
  gcImages();
}

function setActiveLabel(labelId) {
  state.activeLabelId = labelId;
  state.activeElementIds.clear();
  
  // If we select a label, we should probably ensure it is part of the selection,
  // or clear selection and select just this one. For now, just add it to selection if it's the only action.
  if (state.selectedLabelIds.size <= 1) {
    state.selectedLabelIds.clear();
    if (labelId) state.selectedLabelIds.add(labelId);
  }
  
  _notifyAll();
}

function toggleLabelSelection(labelId) {
  if (state.selectedLabelIds.has(labelId)) {
    state.selectedLabelIds.delete(labelId);
  } else {
    state.selectedLabelIds.add(labelId);
  }
  
  // Update active label to the last selected if active is not in selection
  if (state.selectedLabelIds.size > 0 && !state.selectedLabelIds.has(state.activeLabelId)) {
    state.activeLabelId = Array.from(state.selectedLabelIds).pop();
    state.activeElementIds.clear();
  }
  _notifyAll();
}

function selectAllLabels() {
  state.selectedLabelIds = new Set(state.labels.map(l => l.id));
  _notifyAll();
}

function clearSelection() {
  state.selectedLabelIds.clear();
  _notifyAll();
}

function setSearchQuery(query) {
  state.searchQuery = query;
  _notifyAll();
}

function setSortMode(mode) {
  state.sortMode = mode;
  _notifyAll();
}

function getSortedFilteredLabels() {
  let result = [...state.labels];

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    result = result.filter(l => l.name.toLowerCase().includes(q));
  }

  if (state.sortMode === 'name_asc') {
    result.sort((a, b) => a.name.localeCompare(b.name));
  } else if (state.sortMode === 'name_desc') {
    result.sort((a, b) => b.name.localeCompare(a.name));
  } else if (state.sortMode === 'size_asc') {
    result.sort((a, b) => (a.widthMM * a.heightMM) - (b.widthMM * b.heightMM));
  } else if (state.sortMode === 'size_desc') {
    result.sort((a, b) => (b.widthMM * b.heightMM) - (a.widthMM * a.heightMM));
  }

  return result;
}

function setActiveElement(elementId, multi = false) {
  if (!multi) {
    state.activeElementIds.clear();
  }
  if (elementId) {
    if (state.activeElementIds.has(elementId)) {
      if (multi) state.activeElementIds.delete(elementId);
    } else {
      state.activeElementIds.add(elementId);
    }
  }
  _notifyAll();
}

function getActiveLabel() {
  return state.labels.find((l) => l.id === state.activeLabelId) ?? null;
}

function getActiveElement() {
  const label = getActiveLabel();
  if (!label || state.activeElementIds.size === 0) return null;
  const firstId = state.activeElementIds.values().next().value;
  return label.elements.find((el) => el.id === firstId) ?? null;
}

function getActiveElements() {
  const label = getActiveLabel();
  if (!label || state.activeElementIds.size === 0) return [];
  return label.elements.filter((el) => state.activeElementIds.has(el.id));
}

function updateActiveElements(updates) {
  const label = getActiveLabel();
  if (!label) return;
  for (const elId of state.activeElementIds) {
    const el = label.elements.find(e => e.id === elId);
    if (el) {
      Object.assign(el, updates);
    }
  }
  pushHistory();
  _notifyAll();
  _scheduleSave();
}

function updateLabel(labelId, updates) {
  if (state.selectedLabelIds.has(labelId) && state.selectedLabelIds.size > 1) {
    batchUpdateLabels(updates);
    return;
  }
  
  const label = state.labels.find((l) => l.id === labelId);
  if (!label) return;
  
  Object.assign(label, updates);
  pushHistory();
  _notifyAll();
  _scheduleSave();
}

function batchUpdateLabels(updates) {
  if (state.selectedLabelIds.size === 0) return;
  
  // Helper to deep merge updates without clobbering physical properties when updating styles
  const isStylingUpdate = ('elements' in updates) || ('background' in updates) || ('border' in updates) || ('autoLayout' in updates);

  for (const label of state.labels) {
    if (!state.selectedLabelIds.has(label.id)) continue;
    
    // We only merge allowed keys based on the context. If it's pure styling, we don't merge width/height.
    Object.keys(updates).forEach(key => {
      if (isStylingUpdate && (key === 'widthMM' || key === 'heightMM' || key === 'unit')) return;
      
      const val = updates[key];
      if (val !== null && typeof val === 'object' && !Array.isArray(val) && label[key]) {
        label[key] = { ...label[key], ...val };
      } else {
        label[key] = val;
      }
    });
  }
  pushHistory();
  _notifyAll();
  _scheduleSave();
}

function updateElement(labelId, elementId, updates) {
  if (state.selectedLabelIds.has(labelId) && state.selectedLabelIds.size > 1) {
    const sourceLabel = state.labels.find(l => l.id === labelId);
    if (!sourceLabel) return;
    const elementIndex = sourceLabel.elements.findIndex(el => el.id === elementId);
    if (elementIndex === -1) return;

    for (const label of state.labels) {
      if (!state.selectedLabelIds.has(label.id)) continue;
      const targetElement = label.elements[elementIndex];
      if (targetElement) Object.assign(targetElement, updates);
    }
    pushHistory();
    _notifyAll();
    _scheduleSave();
    return;
  }

  const label = state.labels.find((l) => l.id === labelId);
  if (!label) return;
  const element = label.elements.find((el) => el.id === elementId);
  if (!element) return;
  Object.assign(element, updates);
  pushHistory();
  _notifyAll();
  _scheduleSave();
}

function addElement(labelId, elementType = 'text', overrides = {}) {
  const label = state.labels.find((l) => l.id === labelId);
  if (!label) return null;
  const element = elementType === 'image'
    ? createDefaultImageElement(overrides)
    : createDefaultTextElement(overrides);
  label.elements.push(element);
  state.activeElementIds.clear();
  state.activeElementIds.add(element.id);
  pushHistory();
  _notifyAll();
  _scheduleSave();
  return element;
}

function removeElement(labelId, elementId) {
  const label = state.labels.find((l) => l.id === labelId);
  if (!label) return;
  const idx = label.elements.findIndex((el) => el.id === elementId);
  if (idx === -1) return;
  label.elements.splice(idx, 1);
  if (state.activeElementIds.has(elementId)) {
    state.activeElementIds.delete(elementId);
  }
  pushHistory();
  _notifyAll();
  _scheduleSave();
  gcImages();
}

function updatePrintSettings(updates) {
  Object.assign(state.printSettings, updates);
  _notifyAll();
  _scheduleSave();
}

/* ---------- Restore State ---------- */

async function restoreState() {
  try {
    const saved = await loadAutoState();
    if (saved?.labels?.length) {
      state.labels = saved.labels;
      state.activeLabelId = saved.activeLabelId ?? state.labels[0]?.id ?? null;
      state.printSettings = { ...state.printSettings, ...(saved.printSettings ?? {}) };
      state.zoom = saved.zoom ?? 1;
      pushHistory();
      _notifyAll();
      return true;
    }
  } catch (e) {
    console.error('Restore state failed:', e);
  }
  return false;
}

/* ---------- Export Project ---------- */

function exportProject() {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    labels: state.labels,
    printSettings: state.printSettings,
  }, null, 2);
}

function importProject(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (data.labels?.length) {
      state.labels = data.labels;
      state.activeLabelId = state.labels[0]?.id ?? null;
      state.activeElementIds.clear();
      if (data.printSettings) {
        Object.assign(state.printSettings, data.printSettings);
      }
      pushHistory();
      _notifyAll();
      _scheduleSave();
      gcImages();
      return true;
    }
  } catch (e) {
    console.error('Import project failed:', e);
  }
  return false;
}

function moveElementZIndex(labelId, elementId, direction) {
  const label = state.labels.find((l) => l.id === labelId);
  if (!label) return;
  const idx = label.elements.findIndex((el) => el.id === elementId);
  if (idx === -1) return;

  if (direction === 'up' && idx < label.elements.length - 1) {
    const el = label.elements.splice(idx, 1)[0];
    label.elements.splice(idx + 1, 0, el);
  } else if (direction === 'down' && idx > 0) {
    const el = label.elements.splice(idx, 1)[0];
    label.elements.splice(idx - 1, 0, el);
  } else {
    return; // No change
  }

  pushHistory();
  _notifyAll();
  _scheduleSave();
}

async function gcImages() {
  const referencedImageIds = new Set();
  for (const label of state.labels) {
    for (const el of label.elements) {
      if (el.type === 'image' && el.imageId) {
        referencedImageIds.add(el.imageId);
      }
    }
  }

  try {
    const allImages = await dbGetAll(STORES.images);
    for (const img of allImages) {
      if (!referencedImageIds.has(img.id)) {
        await deleteImage(img.id);
        console.log(`[GC] Deleted orphaned image: ${img.id}`);
      }
    }
  } catch (e) {
    console.error('Image GC failed:', e);
  }
}

/* ---------- Public API ---------- */

export {
  state,
  subscribe,
  setView,
  setZoom,
  addLabel,
  duplicateLabel,
  removeLabel,
  deleteAllLabels,
  deleteSelectedLabels,
  setActiveLabel,
  setActiveElement,
  toggleLabelSelection,
  selectAllLabels,
  clearSelection,
  setSearchQuery,
  setSortMode,
  getActiveLabel,
  getActiveElement,
  getActiveElements,
  updateActiveElements,
  updateLabel,
  batchUpdateLabels,
  updateElement,
  addElement,
  removeElement,
  gcImages,
  updatePrintSettings,
  moveElementZIndex,
  getSortedFilteredLabels,
  restoreState,
  exportProject,
  importProject,
  undo,
  redo,
  createDefaultLabel,
  createDefaultTextElement,
  createDefaultImageElement,
};
