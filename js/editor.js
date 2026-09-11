/**
 * editor.js — WYSIWYG label editor
 * Renders the label preview, handles element selection, dragging, resizing, and property editing
 */

import {
  state, subscribe, getActiveLabel, getActiveElement,
  updateLabel, updateElement, addElement, removeElement,
  setActiveElement, setZoom,
} from './state.js';
import { loadFont, fontFamilyCSS } from './fonts.js';
import { saveImage, loadImage } from './db.js';

/* ---------- DOM References ---------- */
let previewContainer, previewEl;
let _dragState = null;
let _resizeState = null;

/* ---------- Constants ---------- */
const PX_PER_MM = 3.7795275591; // 1mm ≈ 3.78px at 96dpi

function mmToPx(mm) { return mm * PX_PER_MM; }

/* ---------- Auto Layout Engine ---------- */

/**
 * Compute automatic positions for all elements on a label.
 * Returns a Map<elementId, {x, y, width, height}> with overridden positions (in %).
 */
function computeAutoLayout(label) {
  const layout = label.autoLayout;
  if (!layout?.enabled) return null;

  const pad = layout.padding ?? 8;
  const imgPos = layout.imagePosition ?? 'left';
  const imgSize = layout.imageSizePercent ?? 30;
  const vAlign = layout.textVerticalAlign ?? 'center';

  const textElements = label.elements.filter((el) => el.type === 'text');
  const imageElements = label.elements.filter((el) => el.type === 'image');
  const hasImages = imageElements.length > 0 && imgPos !== 'none';

  const positions = new Map();

  // Define text zone and image zone based on imagePosition
  let textZone, imageZone;

  if (!hasImages) {
    textZone = { x: pad, y: pad, w: 100 - pad * 2, h: 100 - pad * 2 };
    imageZone = null;
  } else {
    const gap = 3; // % gap between image and text zones
    switch (imgPos) {
      case 'left':
        imageZone = { x: pad, y: pad, w: imgSize - pad, h: 100 - pad * 2 };
        textZone = { x: imgSize + gap, y: pad, w: 100 - imgSize - gap - pad, h: 100 - pad * 2 };
        break;
      case 'right':
        textZone = { x: pad, y: pad, w: 100 - imgSize - gap - pad, h: 100 - pad * 2 };
        imageZone = { x: 100 - imgSize, y: pad, w: imgSize - pad, h: 100 - pad * 2 };
        break;
      case 'top':
        imageZone = { x: pad, y: pad, w: 100 - pad * 2, h: imgSize - pad };
        textZone = { x: pad, y: imgSize + gap, w: 100 - pad * 2, h: 100 - imgSize - gap - pad };
        break;
      case 'bottom':
        textZone = { x: pad, y: pad, w: 100 - pad * 2, h: 100 - imgSize - gap - pad };
        imageZone = { x: pad, y: 100 - imgSize, w: 100 - pad * 2, h: imgSize - pad };
        break;
      default:
        textZone = { x: pad, y: pad, w: 100 - pad * 2, h: 100 - pad * 2 };
        imageZone = null;
    }
  }

  // Layout text elements: stack vertically inside textZone
  if (textElements.length > 0) {
    const lineH = textZone.h / textElements.length;

    textElements.forEach((el, idx) => {
      positions.set(el.id, {
        x: textZone.x,
        y: textZone.y + idx * lineH,
        width: textZone.w,
        height: lineH,
        vAlign: vAlign, // Pass vAlign to renderer
      });
    });
  }

  // Layout image elements: stack inside imageZone
  if (imageZone && imageElements.length > 0) {
    const isVerticalStack = imgPos === 'left' || imgPos === 'right';
    if (isVerticalStack) {
      const sliceH = imageZone.h / imageElements.length;
      imageElements.forEach((el, idx) => {
        positions.set(el.id, {
          x: imageZone.x,
          y: imageZone.y + idx * sliceH,
          width: imageZone.w,
          height: sliceH,
        });
      });
    } else {
      const sliceW = imageZone.w / imageElements.length;
      imageElements.forEach((el, idx) => {
        positions.set(el.id, {
          x: imageZone.x + idx * sliceW,
          y: imageZone.y,
          width: sliceW,
          height: imageZone.h,
        });
      });
    }
  }

  return positions;
}

/* ---------- Init ---------- */

function initEditor() {
  previewContainer = document.getElementById('label-preview-container');
  previewEl = document.getElementById('label-preview');

  // Canvas click deselects
  document.getElementById('canvas-area').addEventListener('mousedown', (e) => {
    if (e.target === document.getElementById('canvas-area')) {
      setActiveElement(null);
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);

  // Zoom with mouse wheel
  document.getElementById('canvas-area').addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(state.zoom + delta);
    }
  }, { passive: false });

  subscribe(renderPreview);
}

/* ---------- Keyboard Shortcuts ---------- */

function handleKeyboard(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.target.isContentEditable) return;

  const label = getActiveLabel();
  if (!label) return;

  // Delete element
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.activeElementId) {
    e.preventDefault();
    removeElement(label.id, state.activeElementId);
  }

  // Arrow keys to move element
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && state.activeElementId) {
    e.preventDefault();
    const el = getActiveElement();
    if (!el) return;
    const step = e.shiftKey ? 5 : 1;
    const updates = {};
    if (e.key === 'ArrowUp') updates.y = Math.max(0, el.y - step);
    if (e.key === 'ArrowDown') updates.y = Math.min(100 - el.height, el.y + step);
    if (e.key === 'ArrowLeft') updates.x = Math.max(0, el.x - step);
    if (e.key === 'ArrowRight') updates.x = Math.min(100 - el.width, el.x + step);
    updateElement(label.id, el.id, updates);
  }
}

/* ---------- Render Label Preview ---------- */

function renderPreview() {
  const label = getActiveLabel();
  if (!label || state.currentView !== 'editor') return;

  const widthMM = label.widthMM * (label.unit === 'cm' ? 10 : label.unit === 'in' ? 25.4 : 1);
  const heightMM = label.heightMM * (label.unit === 'cm' ? 10 : label.unit === 'in' ? 25.4 : 1);

  const widthPx = mmToPx(widthMM) * state.zoom;
  const heightPx = mmToPx(heightMM) * state.zoom;

  previewContainer.style.width = `${widthPx}px`;
  previewContainer.style.height = `${heightPx}px`;

  // Background
  previewEl.style.width = '100%';
  previewEl.style.height = '100%';
  previewEl.style.position = 'relative';
  previewEl.style.overflow = 'hidden';

  applyBackground(previewEl, label.background);
  applyBorder(previewEl, label.border);

  // Compute auto-layout positions
  const autoPositions = computeAutoLayout(label);

  // Render elements
  previewEl.innerHTML = '';

  for (const element of label.elements) {
    if (element.type === 'text') {
      renderTextElement(previewEl, element, label, widthPx, heightPx, autoPositions);
    } else if (element.type === 'image') {
      renderImageElement(previewEl, element, label, widthPx, heightPx, autoPositions);
    }
  }
}

function applyBackground(el, bg) {
  el.style.backgroundImage = 'none';
  el.style.backgroundColor = 'transparent';

  switch (bg.type) {
    case 'color':
      el.style.backgroundColor = bg.color;
      break;
    case 'gradient': {
      const stops = bg.gradient.stops.map((s) => `${s.color} ${s.position}%`).join(', ');
      if (bg.gradient.type === 'radial') {
        el.style.backgroundImage = `radial-gradient(circle, ${stops})`;
      } else {
        el.style.backgroundImage = `linear-gradient(${bg.gradient.angle}deg, ${stops})`;
      }
      break;
    }
    case 'image':
      if (bg.image.src) {
        el.style.backgroundImage = `url('${bg.image.src}')`;
        el.style.backgroundSize = bg.image.fit === 'stretch' ? '100% 100%' : bg.image.fit;
        el.style.backgroundPosition = 'center';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.opacity = bg.image.opacity;
      }
      break;
  }
}

function applyBorder(el, border) {
  if (border.enabled) {
    el.style.border = `${border.width}px ${border.style} ${border.color}`;
    el.style.borderRadius = `${border.radius}px`;
  } else {
    el.style.border = 'none';
    el.style.borderRadius = '0';
  }
}

/* ---------- Render Text Element ---------- */

function renderTextElement(parent, element, label, containerW, containerH, autoPositions = null) {
  const div = document.createElement('div');
  div.className = 'label-text-element' + (state.activeElementId === element.id ? ' selected' : '');
  div.dataset.elementId = element.id;

  // Position: use auto-layout if available, else stored values
  const pos = autoPositions?.get(element.id);
  div.style.left = `${pos?.x ?? element.x}%`;
  div.style.top = `${pos?.y ?? element.y}%`;
  div.style.width = `${pos?.width ?? element.width}%`;
  div.style.height = `${pos?.height ?? element.height}%`;

  // In auto-layout: vertically center text inside its slot
  if (pos) {
    div.style.display = 'flex';
    div.style.alignItems = pos.vAlign === 'top' ? 'flex-start' : pos.vAlign === 'bottom' ? 'flex-end' : 'center';
    div.style.justifyContent = element.textAlign === 'center' ? 'center' : element.textAlign === 'right' ? 'flex-end' : 'flex-start';
  }

  // Typography
  loadFont(element.fontFamily);
  div.style.fontFamily = fontFamilyCSS(element.fontFamily);
  div.style.fontSize = `${element.fontSize * state.zoom}px`;
  div.style.fontWeight = element.fontWeight;
  div.style.fontStyle = element.fontStyle;
  div.style.textDecoration = element.textDecoration;
  div.style.textAlign = element.textAlign;
  div.style.lineHeight = element.lineHeight;
  div.style.letterSpacing = `${element.letterSpacing}px`;
  div.style.color = element.color;

  if (element.highlightColor && element.highlightColor !== 'transparent') {
    div.style.backgroundColor = element.highlightColor;
  }

  div.textContent = element.content;

  // Interaction
  div.addEventListener('mousedown', (e) => handleElementMouseDown(e, element, label));
  div.addEventListener('dblclick', (e) => handleTextDoubleClick(e, div, element, label));

  // Resize handles (only if NOT auto-layout)
  if (state.activeElementId === element.id && !pos) {
    appendResizeHandles(div, element, label);
  }

  parent.appendChild(div);
}

/* ---------- Render Image Element ---------- */

function renderImageElement(parent, element, label, containerW, containerH, autoPositions = null) {
  const div = document.createElement('div');
  div.className = 'label-image-element' + (state.activeElementId === element.id ? ' selected' : '');
  div.dataset.elementId = element.id;

  // Position: use auto-layout if available
  const pos = autoPositions?.get(element.id);
  div.style.left = `${pos?.x ?? element.x}%`;
  div.style.top = `${pos?.y ?? element.y}%`;
  div.style.width = `${pos?.width ?? element.width}%`;
  div.style.height = `${pos?.height ?? element.height}%`;
  div.style.opacity = element.opacity;
  div.style.transform = `rotate(${element.rotation ?? 0}deg)`;

  if (element.src) {
    const img = document.createElement('img');
    img.src = element.src;
    img.style.objectFit = element.objectFit;
    img.alt = 'Label illustration';
    div.appendChild(img);
  } else {
    div.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(124,58,237,0.1);border-radius:4px;font-size:11px;color:#a78bfa;">No image</div>`;
  }

  div.addEventListener('mousedown', (e) => handleElementMouseDown(e, element, label));

  // Resize handles only if NOT auto-layout
  if (state.activeElementId === element.id && !pos) {
    appendResizeHandles(div, element, label);
  }

  parent.appendChild(div);
}

/* ---------- Resize Handles ---------- */

function appendResizeHandles(parentDiv, element, label) {
  ['nw', 'ne', 'sw', 'se'].forEach((corner) => {
    const handle = document.createElement('div');
    handle.className = `resize-handle ${corner}`;
    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      startResize(e, element, label, corner);
    });
    parentDiv.appendChild(handle);
  });
}

/* ---------- Drag & Drop ---------- */

function handleElementMouseDown(e, element, label) {
  if (e.button !== 0) return;
  e.stopPropagation();

  setActiveElement(element.id);

  // Start drag
  const rect = previewEl.getBoundingClientRect();
  _dragState = {
    elementId: element.id,
    labelId: label.id,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
    startX: element.x,
    startY: element.y,
    containerW: rect.width,
    containerH: rect.height,
  };

  document.addEventListener('mousemove', handleDragMove);
  document.addEventListener('mouseup', handleDragEnd);
}

function handleDragMove(e) {
  if (!_dragState) return;
  const dx = ((e.clientX - _dragState.startMouseX) / _dragState.containerW) * 100;
  const dy = ((e.clientY - _dragState.startMouseY) / _dragState.containerH) * 100;

  const newX = Math.max(0, Math.min(95, _dragState.startX + dx));
  const newY = Math.max(0, Math.min(95, _dragState.startY + dy));

  updateElement(_dragState.labelId, _dragState.elementId, { x: newX, y: newY });
}

function handleDragEnd() {
  _dragState = null;
  document.removeEventListener('mousemove', handleDragMove);
  document.removeEventListener('mouseup', handleDragEnd);
}

/* ---------- Resize ---------- */

function startResize(e, element, label, corner) {
  const rect = previewEl.getBoundingClientRect();
  _resizeState = {
    elementId: element.id,
    labelId: label.id,
    corner,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
    startX: element.x,
    startY: element.y,
    startW: element.width,
    startH: element.height,
    containerW: rect.width,
    containerH: rect.height,
  };

  document.addEventListener('mousemove', handleResizeMove);
  document.addEventListener('mouseup', handleResizeEnd);
}

function handleResizeMove(e) {
  if (!_resizeState) return;
  const s = _resizeState;
  const dx = ((e.clientX - s.startMouseX) / s.containerW) * 100;
  const dy = ((e.clientY - s.startMouseY) / s.containerH) * 100;

  const updates = {};

  if (s.corner.includes('e')) {
    updates.width = Math.max(5, s.startW + dx);
  }
  if (s.corner.includes('w')) {
    updates.x = s.startX + dx;
    updates.width = Math.max(5, s.startW - dx);
  }
  if (s.corner.includes('s')) {
    updates.height = Math.max(5, s.startH + dy);
  }
  if (s.corner.includes('n')) {
    updates.y = s.startY + dy;
    updates.height = Math.max(5, s.startH - dy);
  }

  updateElement(s.labelId, s.elementId, updates);
}

function handleResizeEnd() {
  _resizeState = null;
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeEnd);
}

/* ---------- Inline Text Editing ---------- */

function handleTextDoubleClick(e, div, element, label) {
  e.stopPropagation();
  div.contentEditable = 'true';
  div.focus();

  // Select all text
  const range = document.createRange();
  range.selectNodeContents(div);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finishEdit = () => {
    div.contentEditable = 'false';
    const newContent = div.textContent.trim() || element.content;
    updateElement(label.id, element.id, { content: newContent });
    div.removeEventListener('blur', finishEdit);
    div.removeEventListener('keydown', handleEditKeys);
  };

  const handleEditKeys = (e) => {
    if (e.key === 'Escape') {
      div.textContent = element.content;
      finishEdit();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finishEdit();
    }
  };

  div.addEventListener('blur', finishEdit);
  div.addEventListener('keydown', handleEditKeys);
}

/* ---------- Add Image from File ---------- */

async function addImageFromFile(labelId, file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const imageId = crypto.randomUUID();
      await saveImage(imageId, dataUrl);
      const element = addElement(labelId, 'image', { src: dataUrl, imageId });
      resolve(element);
    };
    reader.readAsDataURL(file);
  });
}

async function addImageFromUrl(labelId, url) {
  const element = addElement(labelId, 'image', { src: url });
  return element;
}

/* ---------- Render a label to a standalone DOM node (for print / thumbnail) ---------- */

function renderLabelToNode(label, widthPx, heightPx) {
  const container = document.createElement('div');
  container.className = 'label-render';
  container.style.width = `${widthPx}px`;
  container.style.height = `${heightPx}px`;
  container.style.position = 'relative';
  container.style.overflow = 'hidden';

  applyBackground(container, label.background);
  applyBorder(container, label.border);

  // Compute auto-layout positions for print too
  const autoPositions = computeAutoLayout(label);

  for (const element of label.elements) {
    const pos = autoPositions?.get(element.id);

    if (element.type === 'text') {
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.left = `${pos?.x ?? element.x}%`;
      div.style.top = `${pos?.y ?? element.y}%`;
      div.style.width = `${pos?.width ?? element.width}%`;
      div.style.height = `${pos?.height ?? element.height}%`;
      div.style.fontFamily = fontFamilyCSS(element.fontFamily);
      div.style.fontSize = `${element.fontSize}px`;
      div.style.fontWeight = element.fontWeight;
      div.style.fontStyle = element.fontStyle;
      div.style.textDecoration = element.textDecoration;
      div.style.textAlign = element.textAlign;
      div.style.lineHeight = element.lineHeight;
      div.style.letterSpacing = `${element.letterSpacing}px`;
      div.style.color = element.color;
      div.style.whiteSpace = 'pre-wrap';
      div.style.wordBreak = 'break-word';
      div.style.overflow = 'hidden';
      // Vertical alignment in auto-layout
      if (pos) {
        div.style.display = 'flex';
        div.style.alignItems = pos.vAlign === 'top' ? 'flex-start' : pos.vAlign === 'bottom' ? 'flex-end' : 'center';
        div.style.justifyContent = element.textAlign === 'center' ? 'center' : element.textAlign === 'right' ? 'flex-end' : 'flex-start';
      }
      if (element.highlightColor && element.highlightColor !== 'transparent') {
        div.style.backgroundColor = element.highlightColor;
      }
      div.textContent = element.content;
      container.appendChild(div);
    } else if (element.type === 'image' && element.src) {
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.left = `${pos?.x ?? element.x}%`;
      div.style.top = `${pos?.y ?? element.y}%`;
      div.style.width = `${pos?.width ?? element.width}%`;
      div.style.height = `${pos?.height ?? element.height}%`;
      div.style.opacity = element.opacity;
      div.style.transform = `rotate(${element.rotation ?? 0}deg)`;

      const img = document.createElement('img');
      img.src = element.src;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = element.objectFit;
      img.style.display = 'block';
      div.appendChild(img);
      container.appendChild(div);
    }
  }

  return container;
}

export {
  initEditor,
  renderPreview,
  renderLabelToNode,
  addImageFromFile,
  addImageFromUrl,
  applyBackground,
  applyBorder,
  mmToPx,
  PX_PER_MM,
};
