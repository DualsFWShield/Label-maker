/**
 * app.js — Main application orchestrator
 * Initializes all modules, wires up the UI, and manages view transitions
 */

import {
  state, subscribe, setView, setZoom,
  addLabel, duplicateLabel, removeLabel,
  setActiveLabel, setActiveElement, getActiveLabel, getActiveElement,
  updateLabel, batchUpdateLabels, updateElement, addElement, removeElement,
  updatePrintSettings, restoreState,
  exportProject, importProject,
  undo, redo,
  toggleLabelSelection, selectAllLabels, clearSelection, setSearchQuery, setSortMode,
  deleteSelectedLabels, deleteAllLabels, getSortedFilteredLabels,
} from './state.js';
import { initEditor, addImageFromFile, addImageFromUrl, renderPreview } from './editor.js';
import { initPrint, renderPrintPreview, triggerPrint } from './print.js';
import { importFile, downloadTemplate } from './importer.js';
import { FONT_CATALOGUE, loadFont, preloadCommonFonts, getFonts, getCategories, fontFamilyCSS } from './fonts.js';
import { initPWA, promptInstall, forceUpdate } from './pwa.js';

/* ---------- Toast ---------- */

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ---------- Boot ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize modules
  initEditor();
  initPrint();
  initPWA();

  // Preload fonts
  preloadCommonFonts();

  // Restore saved state or create a default label
  const restored = await restoreState();
  if (restored) {
    showToast('Session restored', 'success');
  } else {
    addLabel({ name: 'My Label' });
  }

  // Wire up UI
  setupNavigation();
  setupSidebar();
  setupLabelsPanel();
  setupPrintPanel();
  setupImportView();
  setupHeaderActions();
  setupZoomControls();

  // Subscribe to state changes for sidebar + labels panel updates
  subscribe(updateSidebarUI);
  subscribe(updateLabelsPanelUI);

  // Initial render
  updateSidebarUI();
  updateLabelsPanelUI();

  // Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
});

/* ---------- Navigation ---------- */

function setupNavigation() {
  document.querySelectorAll('.header-nav button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      setView(view);
      document.querySelectorAll('.header-nav button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      // Toggle view visibility
      document.querySelectorAll('#view-editor, #view-print, #view-import').forEach((v) => v.classList.remove('active'));
      const viewEl = document.getElementById(`view-${view}`);
      if (viewEl) viewEl.classList.add('active');

      if (view === 'print') renderPrintPreview();
    });
  });
}

/* ---------- Header Actions ---------- */

function setupHeaderActions() {
  // Undo / Redo
  document.getElementById('btn-undo')?.addEventListener('click', () => {
    undo() ? showToast('Undo', 'info') : showToast('Nothing to undo', 'warning');
  });
  document.getElementById('btn-redo')?.addEventListener('click', () => {
    redo() ? showToast('Redo', 'info') : showToast('Nothing to redo', 'warning');
  });

  // Export project
  document.getElementById('btn-export-project')?.addEventListener('click', () => {
    const json = exportProject();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'label-project.labelstudio';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Project exported', 'success');
  });

  // Import project
  document.getElementById('btn-import-project')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.labelstudio,.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      if (importProject(text)) {
        showToast('Project imported', 'success');
      } else {
        showToast('Import failed', 'error');
      }
    };
    input.click();
  });

  // Install PWA
  document.getElementById('btn-install-pwa')?.addEventListener('click', promptInstall);

  // Force update
  document.getElementById('btn-force-update')?.addEventListener('click', forceUpdate);

  // Update bar apply button
  document.getElementById('btn-apply-update')?.addEventListener('click', () => {
    const { applyUpdate } = window.__pwa || {};
    if (applyUpdate) applyUpdate();
    else window.location.reload(true);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  });
}

/* ---------- Zoom Controls ---------- */

function setupZoomControls() {
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => setZoom(state.zoom + 0.2));
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => setZoom(state.zoom - 0.2));
  document.getElementById('btn-zoom-reset')?.addEventListener('click', () => setZoom(1));

  subscribe(() => {
    const display = document.getElementById('zoom-display');
    if (display) display.textContent = `${Math.round(state.zoom * 100)}%`;
  });
}

/* ---------- Sidebar (Properties) ---------- */

function setupSidebar() {
  // Section collapse toggles
  document.querySelectorAll('.sidebar-section-header').forEach((header) => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('collapsed');
    });
  });

  // Label dimensions
  setupDimensionInputs();

  // Auto Layout controls
  setupAutoLayoutControls();

  // Background controls
  setupBackgroundControls();

  // Border controls
  setupBorderControls();

  // Typography controls
  setupTypographyControls();

  // Element actions
  setupElementActions();
}

function setupDimensionInputs() {
  const widthInput = document.getElementById('label-width');
  const heightInput = document.getElementById('label-height');
  const unitSelect = document.getElementById('label-unit');
  const copiesInput = document.getElementById('label-copies');
  const nameInput = document.getElementById('label-name');

  const presetChips = document.querySelectorAll('.preset-chip[data-preset]');

  presetChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const [w, h] = chip.dataset.preset.split('x').map(Number);
      const unit = chip.dataset.unit || 'mm';
      const label = getActiveLabel();
      if (label) {
        updateLabel(label.id, { widthMM: w, heightMM: h, unit });
        presetChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
      }
    });
  });

  [widthInput, heightInput].forEach((input) => {
    input?.addEventListener('change', () => {
      const label = getActiveLabel();
      if (label) {
        updateLabel(label.id, {
          widthMM: parseFloat(widthInput.value) || label.widthMM,
          heightMM: parseFloat(heightInput.value) || label.heightMM,
        });
      }
    });
  });

  unitSelect?.addEventListener('change', () => {
    const label = getActiveLabel();
    if (label) updateLabel(label.id, { unit: unitSelect.value });
  });

  copiesInput?.addEventListener('change', () => {
    const label = getActiveLabel();
    if (label) updateLabel(label.id, { copies: Math.max(1, parseInt(copiesInput.value) || 1) });
  });

  nameInput?.addEventListener('change', () => {
    const label = getActiveLabel();
    if (label) updateLabel(label.id, { name: nameInput.value || 'New Label' });
  });
}

function setupAutoLayoutControls() {
  const enabledToggle = document.getElementById('auto-layout-enabled');
  const optionsDiv = document.getElementById('auto-layout-options');
  const imgPosition = document.getElementById('auto-layout-img-position');
  const imgSize = document.getElementById('auto-layout-img-size');
  const padding = document.getElementById('auto-layout-padding');
  const vAlign = document.getElementById('auto-layout-valign');
  const imgSizeVal = document.getElementById('auto-layout-img-size-val');
  const paddingVal = document.getElementById('auto-layout-padding-val');

  enabledToggle?.addEventListener('change', () => {
    const label = getActiveLabel();
    if (label) {
      const autoLayout = { ...label.autoLayout, enabled: enabledToggle.checked };
      updateLabel(label.id, { autoLayout });
    }
  });

  imgPosition?.addEventListener('change', () => {
    const label = getActiveLabel();
    if (label) {
      const autoLayout = { ...label.autoLayout, imagePosition: imgPosition.value };
      updateLabel(label.id, { autoLayout });
    }
  });

  imgSize?.addEventListener('input', () => {
    if (imgSizeVal) imgSizeVal.textContent = imgSize.value;
    const label = getActiveLabel();
    if (label) {
      const autoLayout = { ...label.autoLayout, imageSizePercent: parseInt(imgSize.value) };
      updateLabel(label.id, { autoLayout });
    }
  });

  padding?.addEventListener('input', () => {
    if (paddingVal) paddingVal.textContent = padding.value;
    const label = getActiveLabel();
    if (label) {
      const autoLayout = { ...label.autoLayout, padding: parseInt(padding.value) };
      updateLabel(label.id, { autoLayout });
    }
  });

  vAlign?.addEventListener('change', () => {
    const label = getActiveLabel();
    if (label) {
      const autoLayout = { ...label.autoLayout, textVerticalAlign: vAlign.value };
      updateLabel(label.id, { autoLayout });
    }
  });
}

function setupBackgroundControls() {
  const bgType = document.getElementById('bg-type');
  const bgColor = document.getElementById('bg-color');
  const gradType = document.getElementById('gradient-type');
  const gradAngle = document.getElementById('gradient-angle');
  const gradStop1Color = document.getElementById('grad-stop1-color');
  const gradStop1Pos = document.getElementById('grad-stop1-pos');
  const gradStop2Color = document.getElementById('grad-stop2-color');
  const gradStop2Pos = document.getElementById('grad-stop2-pos');
  const bgImageInput = document.getElementById('bg-image-input');
  const bgImageFit = document.getElementById('bg-image-fit');
  const bgImageOpacity = document.getElementById('bg-image-opacity');

  bgType?.addEventListener('change', () => {
    const label = getActiveLabel();
    if (label) {
      const bg = { ...label.background, type: bgType.value };
      updateLabel(label.id, { background: bg });
      toggleBackgroundSections(bgType.value);
    }
  });

  bgColor?.addEventListener('input', () => {
    const label = getActiveLabel();
    if (label) {
      const bg = { ...label.background, color: bgColor.value };
      updateLabel(label.id, { background: bg });
    }
  });

  [gradType, gradAngle, gradStop1Color, gradStop1Pos, gradStop2Color, gradStop2Pos].forEach((el) => {
    el?.addEventListener('input', () => {
      const label = getActiveLabel();
      if (label) {
        const bg = JSON.parse(JSON.stringify(label.background));
        bg.gradient.type = gradType.value;
        bg.gradient.angle = parseInt(gradAngle.value) || 135;
        bg.gradient.stops = [
          { color: gradStop1Color.value, position: parseInt(gradStop1Pos.value) || 0 },
          { color: gradStop2Color.value, position: parseInt(gradStop2Pos.value) || 100 },
        ];
        updateLabel(label.id, { background: bg });
      }
    });
  });

  bgImageInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const label = getActiveLabel();
      if (label) {
        const bg = JSON.parse(JSON.stringify(label.background));
        bg.image.src = ev.target.result;
        bg.type = 'image';
        updateLabel(label.id, { background: bg });
      }
    };
    reader.readAsDataURL(file);
  });

  bgImageFit?.addEventListener('change', () => {
    const label = getActiveLabel();
    if (label) {
      const bg = JSON.parse(JSON.stringify(label.background));
      bg.image.fit = bgImageFit.value;
      updateLabel(label.id, { background: bg });
    }
  });

  bgImageOpacity?.addEventListener('input', () => {
    const label = getActiveLabel();
    if (label) {
      const bg = JSON.parse(JSON.stringify(label.background));
      bg.image.opacity = parseFloat(bgImageOpacity.value);
      updateLabel(label.id, { background: bg });
    }
  });
}

function toggleBackgroundSections(type) {
  document.getElementById('bg-color-section')?.classList.toggle('hidden', type !== 'color');
  document.getElementById('bg-gradient-section')?.classList.toggle('hidden', type !== 'gradient');
  document.getElementById('bg-image-section')?.classList.toggle('hidden', type !== 'image');
}

function setupBorderControls() {
  const borderEnabled = document.getElementById('border-enabled');
  const borderWidth = document.getElementById('border-width');
  const borderStyle = document.getElementById('border-style');
  const borderColor = document.getElementById('border-color');
  const borderRadius = document.getElementById('border-radius');

  borderEnabled?.addEventListener('change', () => {
    const label = getActiveLabel();
    if (label) {
      const border = { ...label.border, enabled: borderEnabled.checked };
      updateLabel(label.id, { border });
    }
  });

  [borderWidth, borderStyle, borderColor, borderRadius].forEach((el) => {
    el?.addEventListener('input', () => {
      const label = getActiveLabel();
      if (label) {
        const border = {
          ...label.border,
          width: parseFloat(borderWidth.value) || 1,
          style: borderStyle.value,
          color: borderColor.value,
          radius: parseFloat(borderRadius.value) || 0,
        };
        updateLabel(label.id, { border });
      }
    });
  });
}

function setupTypographyControls() {
  const fontSelect = document.getElementById('font-select');
  const fontCategoryFilter = document.getElementById('font-category');
  const fontSize = document.getElementById('font-size');
  const textColor = document.getElementById('text-color');
  const highlightColor = document.getElementById('highlight-color');
  const textAlign = document.getElementById('text-align');
  const lineHeight = document.getElementById('line-height');
  const letterSpacing = document.getElementById('letter-spacing');

  // Populate font selector
  populateFontSelect(fontSelect);

  fontCategoryFilter?.addEventListener('change', () => {
    populateFontSelect(fontSelect, fontCategoryFilter.value);
  });

  fontSelect?.addEventListener('change', () => {
    const el = getActiveElement();
    const label = getActiveLabel();
    if (el && label && el.type === 'text') {
      loadFont(fontSelect.value);
      updateElement(label.id, el.id, { fontFamily: fontSelect.value });
    }
  });

  fontSize?.addEventListener('change', () => {
    const el = getActiveElement();
    const label = getActiveLabel();
    if (el && label && el.type === 'text') {
      updateElement(label.id, el.id, { fontSize: parseFloat(fontSize.value) || 16 });
    }
  });

  textColor?.addEventListener('input', () => {
    const el = getActiveElement();
    const label = getActiveLabel();
    if (el && label && el.type === 'text') {
      updateElement(label.id, el.id, { color: textColor.value });
    }
  });

  highlightColor?.addEventListener('input', () => {
    const el = getActiveElement();
    const label = getActiveLabel();
    if (el && label && el.type === 'text') {
      updateElement(label.id, el.id, { highlightColor: highlightColor.value });
    }
  });

  textAlign?.addEventListener('change', () => {
    const el = getActiveElement();
    const label = getActiveLabel();
    if (el && label && el.type === 'text') {
      updateElement(label.id, el.id, { textAlign: textAlign.value });
    }
  });

  lineHeight?.addEventListener('input', () => {
    const el = getActiveElement();
    const label = getActiveLabel();
    if (el && label && el.type === 'text') {
      updateElement(label.id, el.id, { lineHeight: parseFloat(lineHeight.value) || 1.4 });
    }
  });

  letterSpacing?.addEventListener('input', () => {
    const el = getActiveElement();
    const label = getActiveLabel();
    if (el && label && el.type === 'text') {
      updateElement(label.id, el.id, { letterSpacing: parseFloat(letterSpacing.value) || 0 });
    }
  });

  // Style toggles
  document.getElementById('btn-bold')?.addEventListener('click', () => {
    const el = getActiveElement();
    const label = getActiveLabel();
    if (el && label && el.type === 'text') {
      const newWeight = el.fontWeight === 'bold' ? 'normal' : 'bold';
      updateElement(label.id, el.id, { fontWeight: newWeight });
    }
  });

  document.getElementById('btn-italic')?.addEventListener('click', () => {
    const el = getActiveElement();
    const label = getActiveLabel();
    if (el && label && el.type === 'text') {
      const newStyle = el.fontStyle === 'italic' ? 'normal' : 'italic';
      updateElement(label.id, el.id, { fontStyle: newStyle });
    }
  });

  document.getElementById('btn-underline')?.addEventListener('click', () => {
    const el = getActiveElement();
    const label = getActiveLabel();
    if (el && label && el.type === 'text') {
      const newDeco = el.textDecoration === 'underline' ? 'none' : 'underline';
      updateElement(label.id, el.id, { textDecoration: newDeco });
    }
  });

  document.getElementById('btn-strikethrough')?.addEventListener('click', () => {
    const el = getActiveElement();
    const label = getActiveLabel();
    if (el && label && el.type === 'text') {
      const newDeco = el.textDecoration === 'line-through' ? 'none' : 'line-through';
      updateElement(label.id, el.id, { textDecoration: newDeco });
    }
  });
}

function populateFontSelect(select, category = '') {
  if (!select) return;
  const fonts = category ? getFonts(category) : FONT_CATALOGUE;
  select.innerHTML = '';
  for (const font of fonts) {
    const option = document.createElement('option');
    option.value = font.name;
    option.textContent = font.name;
    select.appendChild(option);
  }
}

function setupElementActions() {
  document.getElementById('btn-add-text')?.addEventListener('click', () => {
    const label = getActiveLabel();
    if (label) {
      addElement(label.id, 'text');
      showToast('Text element added', 'success');
    }
  });

  document.getElementById('btn-add-image')?.addEventListener('click', () => {
    const label = getActiveLabel();
    if (!label) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        await addImageFromFile(label.id, file);
        showToast('Image added', 'success');
      }
    };
    input.click();
  });

  document.getElementById('btn-add-image-url')?.addEventListener('click', () => {
    const url = prompt('Enter image URL:');
    if (url) {
      const label = getActiveLabel();
      if (label) {
        addImageFromUrl(label.id, url);
        showToast('Image added', 'success');
      }
    }
  });

  document.getElementById('btn-delete-element')?.addEventListener('click', () => {
    const label = getActiveLabel();
    const el = getActiveElement();
    if (label && el) {
      removeElement(label.id, el.id);
      showToast('Element removed', 'info');
    }
  });
}

/* ---------- Sidebar UI Sync ---------- */

function updateSidebarUI() {
  const label = getActiveLabel();
  const element = getActiveElement();

  if (!label) return;

  // Dimensions
  setInputValue('label-name', label.name);
  setInputValue('label-width', label.widthMM);
  setInputValue('label-height', label.heightMM);
  setInputValue('label-unit', label.unit);
  setInputValue('label-copies', label.copies);

  // Auto Layout
  const autoLayoutCheckbox = document.getElementById('auto-layout-enabled');
  if (autoLayoutCheckbox) autoLayoutCheckbox.checked = label.autoLayout?.enabled ?? false;
  const autoLayoutOptions = document.getElementById('auto-layout-options');
  if (autoLayoutOptions) {
    autoLayoutOptions.style.opacity = label.autoLayout?.enabled ? '1' : '0.5';
    autoLayoutOptions.style.pointerEvents = label.autoLayout?.enabled ? 'auto' : 'none';
  }
  setInputValue('auto-layout-img-position', label.autoLayout?.imagePosition ?? 'left');
  setInputValue('auto-layout-img-size', label.autoLayout?.imageSizePercent ?? 30);
  setInputValue('auto-layout-padding', label.autoLayout?.padding ?? 8);
  setInputValue('auto-layout-valign', label.autoLayout?.textVerticalAlign ?? 'center');
  
  const imgSizeVal = document.getElementById('auto-layout-img-size-val');
  if (imgSizeVal) imgSizeVal.textContent = label.autoLayout?.imageSizePercent ?? 30;
  const paddingVal = document.getElementById('auto-layout-padding-val');
  if (paddingVal) paddingVal.textContent = label.autoLayout?.padding ?? 8;

  // Background
  setInputValue('bg-type', label.background.type);
  setInputValue('bg-color', label.background.color);
  setInputValue('gradient-type', label.background.gradient.type);
  setInputValue('gradient-angle', label.background.gradient.angle);
  if (label.background.gradient.stops[0]) {
    setInputValue('grad-stop1-color', label.background.gradient.stops[0].color);
    setInputValue('grad-stop1-pos', label.background.gradient.stops[0].position);
  }
  if (label.background.gradient.stops[1]) {
    setInputValue('grad-stop2-color', label.background.gradient.stops[1].color);
    setInputValue('grad-stop2-pos', label.background.gradient.stops[1].position);
  }
  setInputValue('bg-image-fit', label.background.image.fit);
  setInputValue('bg-image-opacity', label.background.image.opacity);
  toggleBackgroundSections(label.background.type);

  // Border
  const borderCheckbox = document.getElementById('border-enabled');
  if (borderCheckbox) borderCheckbox.checked = label.border.enabled;
  setInputValue('border-width', label.border.width);
  setInputValue('border-style', label.border.style);
  setInputValue('border-color', label.border.color);
  setInputValue('border-radius', label.border.radius);

  // Typography (if text element selected)
  const typoSection = document.getElementById('typography-section');
  const elementSection = document.getElementById('element-section');

  if (element && element.type === 'text') {
    if (typoSection) typoSection.style.display = '';
    setInputValue('font-select', element.fontFamily);
    setInputValue('font-size', element.fontSize);
    setInputValue('text-color', element.color);
    setInputValue('highlight-color', element.highlightColor || '#ffffff');
    setInputValue('text-align', element.textAlign);
    setInputValue('line-height', element.lineHeight);
    setInputValue('letter-spacing', element.letterSpacing);

    // Toggle buttons
    toggleActiveClass('btn-bold', element.fontWeight === 'bold');
    toggleActiveClass('btn-italic', element.fontStyle === 'italic');
    toggleActiveClass('btn-underline', element.textDecoration === 'underline');
    toggleActiveClass('btn-strikethrough', element.textDecoration === 'line-through');
  } else {
    if (typoSection) typoSection.style.display = element ? '' : 'none';
  }

  if (elementSection) {
    elementSection.style.display = element ? '' : 'none';
  }

  // Image element controls
  const imageControls = document.getElementById('image-element-controls');
  if (imageControls) {
    imageControls.style.display = (element && element.type === 'image') ? '' : 'none';
  }
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el && el.value !== String(value)) el.value = value;
}

function toggleActiveClass(id, isActive) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('active', isActive);
}

/* ---------- Labels Panel ---------- */

function setupLabelsPanel() {
  document.getElementById('btn-add-label')?.addEventListener('click', () => {
    addLabel({ name: `Label ${state.labels.length + 1}` });
    showToast('New label created', 'success');
  });

  document.getElementById('labels-search')?.addEventListener('input', (e) => {
    setSearchQuery(e.target.value);
  });

  document.getElementById('labels-sort')?.addEventListener('change', (e) => {
    setSortMode(e.target.value);
  });

  document.getElementById('btn-select-all')?.addEventListener('click', () => {
    if (state.selectedLabelIds.size === state.labels.length && state.labels.length > 0) {
      clearSelection();
    } else {
      selectAllLabels();
    }
  });

  document.getElementById('btn-delete-selected')?.addEventListener('click', () => {
    if (state.selectedLabelIds.size > 0 && confirm(`Delete ${state.selectedLabelIds.size} selected label(s)?`)) {
      deleteSelectedLabels();
      showToast('Labels deleted', 'info');
    }
  });

  document.getElementById('btn-clear-labels')?.addEventListener('click', () => {
    if (state.labels.length > 0 && confirm('Are you sure you want to delete ALL labels?')) {
      deleteAllLabels();
      showToast('All labels cleared', 'info');
    }
  });
}

function updateLabelsPanelUI() {
  const listEl = document.getElementById('labels-list');
  if (!listEl) return;

  // Update badge count
  const badge = document.getElementById('labels-count');
  if (badge) badge.textContent = state.labels.length;

  listEl.innerHTML = '';

  const filteredLabels = getSortedFilteredLabels();

  if (filteredLabels.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <i data-lucide="tag"></i>
        <h3>No labels found</h3>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons({ nodes: listEl.querySelectorAll('[data-lucide]') });
    return;
  }

  for (const label of filteredLabels) {
    const isSelected = state.selectedLabelIds.has(label.id);
    const isActive = state.activeLabelId === label.id;
    const card = document.createElement('div');
    card.className = `label-card ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`;
    card.dataset.labelId = label.id;
    if (isSelected) card.style.borderLeft = '3px solid var(--accent-primary)';

    const unit = label.unit === 'cm' ? 'cm' : label.unit === 'in' ? 'in' : 'mm';
    card.innerHTML = `
      <div class="label-card-checkbox" style="display: flex; align-items: center; justify-content: center; padding: 0 8px;">
        <input type="checkbox" ${isSelected ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;">
      </div>
      <div class="label-card-thumbnail" style="background: ${label.background.color || '#fff'}"></div>
      <div class="label-card-info">
        <h4>${escapeHtml(label.name)}</h4>
        <span>${label.widthMM}×${label.heightMM} ${unit} · ×${label.copies ?? 1}</span>
      </div>
      <div class="label-card-actions">
        <button class="duplicate-btn" title="Duplicate"><i data-lucide="copy"></i></button>
      </div>
    `;

    // Toggle selection on checkbox click
    card.querySelector('input[type="checkbox"]').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLabelSelection(label.id);
    });

    card.addEventListener('click', (e) => {
      if (e.target.closest('.label-card-actions') || e.target.closest('input')) return;
      // If ctrl/cmd is pressed, toggle selection, otherwise standard active
      if (e.ctrlKey || e.metaKey) {
        toggleLabelSelection(label.id);
      } else {
        setActiveLabel(label.id);
      }
    });

    card.querySelector('.duplicate-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      duplicateLabel(label.id);
      showToast('Label duplicated', 'success');
    });

    listEl.appendChild(card);
  }

  if (window.lucide) window.lucide.createIcons({ nodes: listEl.querySelectorAll('[data-lucide]') });
}

/* ---------- Print Panel ---------- */

function setupPrintPanel() {
  const pageFormat = document.getElementById('print-page-format');
  const orientation = document.getElementById('print-orientation');
  const margin = document.getElementById('print-margin');
  const gap = document.getElementById('print-gap');
  const cutMarks = document.getElementById('print-cut-marks');
  const singleLabel = document.getElementById('print-single-label');

  [pageFormat, orientation].forEach((el) => {
    el?.addEventListener('change', () => {
      updatePrintSettings({
        pageFormat: pageFormat.value,
        orientation: orientation.value,
      });
    });
  });

  [margin, gap].forEach((el) => {
    el?.addEventListener('change', () => {
      updatePrintSettings({
        marginMM: parseFloat(margin.value) || 5,
        gapMM: parseFloat(gap.value) || 2,
      });
    });
  });

  cutMarks?.addEventListener('change', () => {
    updatePrintSettings({ showCutMarks: cutMarks.checked });
  });

  singleLabel?.addEventListener('change', () => {
    updatePrintSettings({ singleLabel: singleLabel.checked });
  });

  document.getElementById('btn-print')?.addEventListener('click', () => {
    triggerPrint();
  });
}

/* ---------- Import View ---------- */

function setupImportView() {
  const dropzone = document.getElementById('import-dropzone');
  const fileInput = document.getElementById('import-file-input');

  // Click to open file picker
  dropzone?.addEventListener('click', () => fileInput?.click());

  // Drag & drop
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone?.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files[0];
    if (file) await handleImport(file);
  });

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await handleImport(file);
    fileInput.value = '';
  });

  // Template download buttons
  document.querySelectorAll('[data-download-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const format = btn.dataset.downloadTemplate;
      downloadTemplate(format);
      showToast(`${format.toUpperCase()} template downloaded`, 'success');
    });
  });
}

async function handleImport(file) {
  try {
    if (state.labels.length > 0) {
      if (confirm('You already have labels. Do you want to Append the new ones?\n\nClick OK to Append, or Cancel to Replace.')) {
        // Append -> do nothing
      } else {
        // Replace -> clear existing
        deleteAllLabels();
      }
    }
    
    const labels = await importFile(file);
    showToast(`${labels.length} label(s) imported`, 'success');
    setView('editor');
    // Switch nav
    document.querySelectorAll('.header-nav button').forEach((b) => b.classList.remove('active'));
    document.querySelector('.header-nav button[data-view="editor"]')?.classList.add('active');
    document.querySelectorAll('#view-editor, #view-print, #view-import').forEach((v) => v.classList.remove('active'));
    document.getElementById('view-editor')?.classList.add('active');
  } catch (e) {
    showToast(`Import failed: ${e.message}`, 'error');
  }
}

/* ---------- Utility ---------- */

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
