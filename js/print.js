/**
 * print.js — Print preview generation and physical printing
 * Generates accurate mm-based print pages with cut marks
 */

import { state, subscribe } from './state.js';
import { computeLayout, toMM, PAGE_FORMATS } from './layout-engine.js';
import { renderLabelToNode, PX_PER_MM } from './editor.js';

const SCREEN_PX_PER_MM = PX_PER_MM; // 3.78px/mm at 96dpi
let customPrintScale = null; // null means "fit to screen", otherwise it's a multiplier for PX_PER_MM

/* ---------- Render Print Preview (on-screen, scaled) ---------- */

function renderPrintPreview() {
  const previewArea = document.getElementById('print-preview-area');
  if (!previewArea || state.currentView !== 'print') return;

  previewArea.innerHTML = '';

  const allLabels = state.labels;
  const labels = state.printSettings.printSelectedOnly && state.selectedLabelIds.size > 0
    ? allLabels.filter(l => state.selectedLabelIds.has(l.id))
    : allLabels;
  if (labels.length === 0) {
    previewArea.innerHTML = `<div class="empty-state"><h3>No labels to print</h3><p>${state.printSettings.printSelectedOnly ? 'No labels selected. Select labels in the editor panel.' : 'Create labels in the editor first.'}</p></div>`;
    updatePrintSummary(null, allLabels);
    return;
  }

  const layout = computeLayout(labels, state.printSettings);
  const { pages, grid, area } = layout;

  // Update summary info
  updatePrintSummary(layout, labels);

  // Screen scale factor: if customPrintScale is set, use it for 1:1 mapping (1mm = PX_PER_MM * customPrintScale pixels)
  // Otherwise, fit page preview to ~600px width
  const screenScale = customPrintScale !== null 
    ? (SCREEN_PX_PER_MM * customPrintScale) 
    : (600 / area.pageWidth);

  for (const page of pages) {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'print-page-preview';
    pageDiv.style.width = `${area.pageWidth * screenScale}px`;
    pageDiv.style.height = `${area.pageHeight * screenScale}px`;
    pageDiv.style.position = 'relative';

    // Render each label on this page
    for (const entry of page.labels) {
      const cellDiv = document.createElement('div');
      cellDiv.style.position = 'absolute';
      cellDiv.style.left = `${(area.marginMM + entry.x) * screenScale}px`;
      cellDiv.style.top = `${(area.marginMM + entry.y) * screenScale}px`;
      cellDiv.style.width = `${entry.widthMM * screenScale}px`;
      cellDiv.style.height = `${entry.heightMM * screenScale}px`;
      cellDiv.style.overflow = 'hidden';

      const labelNode = renderLabelToNode(entry.label, entry.widthMM * screenScale, entry.heightMM * screenScale);
      cellDiv.appendChild(labelNode);
      pageDiv.appendChild(cellDiv);
    }

    // Cut marks
    if (state.printSettings.cutMarksType !== 'none' && !state.printSettings.singleLabel) {
      renderCutMarks(pageDiv, page, area, page.grid, screenScale, 'px', true);
    }

    // Page number
    const pageNum = document.createElement('div');
    pageNum.className = 'page-number';
    pageNum.textContent = `Page ${page.pageIndex + 1} / ${pages.length}`;
    pageDiv.appendChild(pageNum);

    previewArea.appendChild(pageDiv);
  }
}

function renderCutMarks(pageDiv, page, area, grid, scale, unit = 'px', includeMarginOffset = false) {
  if (page.labels.length === 0) return;
  const cutMarksType = state.printSettings.cutMarksType || 'both';
  if (cutMarksType === 'none') return;

  const firstLabel = page.labels[0];
  const labelW = firstLabel.widthMM;
  const labelH = firstLabel.heightMM;
  const gapMM = state.printSettings.gapMM;
  const marginOffset = includeMarginOffset ? area.marginMM : 0;

  // Horizontal cut marks
  for (let row = 0; row <= grid.rows; row++) {
    const isOutside = (row === 0 || row === grid.rows);
    const isInside = (row > 0 && row < grid.rows);
    
    if (cutMarksType === 'inside' && isOutside) continue;
    if (cutMarksType === 'outside' && isInside) continue;

    const y = marginOffset + firstLabel.y + row * (labelH + gapMM) - gapMM / 2;

    const mark = document.createElement('div');
    mark.style.cssText = `
      position: absolute;
      left: ${(marginOffset + firstLabel.x) * scale}${unit};
      top: ${y * scale}${unit};
      width: ${(grid.cols * labelW + (grid.cols - 1) * gapMM) * scale}${unit};
      height: 0;
      border-top: 1px dashed rgba(0,0,0,0.4);
    `;
    pageDiv.appendChild(mark);
  }

  // Vertical cut marks
  for (let col = 0; col <= grid.cols; col++) {
    const isOutside = (col === 0 || col === grid.cols);
    const isInside = (col > 0 && col < grid.cols);

    if (cutMarksType === 'inside' && isOutside) continue;
    if (cutMarksType === 'outside' && isInside) continue;

    const x = marginOffset + firstLabel.x + col * (labelW + gapMM) - gapMM / 2;

    const mark = document.createElement('div');
    mark.style.cssText = `
      position: absolute;
      left: ${x * scale}${unit};
      top: ${(marginOffset + firstLabel.y) * scale}${unit};
      width: 0;
      height: ${(grid.rows * labelH + (grid.rows - 1) * gapMM) * scale}${unit};
      border-left: 1px dashed rgba(0,0,0,0.4);
    `;
    pageDiv.appendChild(mark);
  }
}

function updatePrintSummary(layout, labels) {
  const summaryEl = document.getElementById('print-summary');
  if (!summaryEl) return;

  // Update selection info
  const selInfo = document.getElementById('print-selection-info');
  if (selInfo) {
    if (state.printSettings.printSelectedOnly) {
      const selectedCount = state.selectedLabelIds.size;
      selInfo.textContent = selectedCount > 0
        ? `${selectedCount} / ${state.labels.length} label(s) selected`
        : 'No labels selected';
      selInfo.style.color = selectedCount > 0 ? 'var(--accent-secondary)' : '#ef4444';
    } else {
      selInfo.textContent = '';
    }
  }

  if (!layout) {
    summaryEl.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">No labels to display</div>`;
    return;
  }

  const totalLabels = labels.reduce((sum, l) => sum + Math.max(1, l.copies ?? 1), 0);
  const { pages, grid } = layout;

  summaryEl.innerHTML = `
    <div class="form-row" style="margin-bottom: 8px;">
      <span style="color: var(--text-secondary); font-size: 0.8rem;">Labels per page:</span>
      <strong style="font-size: 0.9rem;">${grid.totalPerPage}</strong>
    </div>
    <div class="form-row" style="margin-bottom: 8px;">
      <span style="color: var(--text-secondary); font-size: 0.8rem;">Grid:</span>
      <strong style="font-size: 0.9rem;">${grid.cols} × ${grid.rows}</strong>
    </div>
    <div class="form-row" style="margin-bottom: 8px;">
      <span style="color: var(--text-secondary); font-size: 0.8rem;">Total labels:</span>
      <strong style="font-size: 0.9rem;">${totalLabels}</strong>
    </div>
    <div class="form-row">
      <span style="color: var(--text-secondary); font-size: 0.8rem;">Pages required:</span>
      <strong style="font-size: 0.9rem; color: var(--accent-secondary);">${pages.length}</strong>
    </div>
  `;

  const container = document.getElementById('scale-slider-container');
  if (container) {
    container.style.display = customPrintScale !== null ? 'block' : 'none';
  }
}

/* ---------- Actual Print (physical) ---------- */

function triggerPrint() {
  const allLabels = state.labels;
  const labels = state.printSettings.printSelectedOnly && state.selectedLabelIds.size > 0
    ? allLabels.filter(l => state.selectedLabelIds.has(l.id))
    : allLabels;
  if (labels.length === 0) return;

  const layout = computeLayout(labels, state.printSettings);
  const { pages, area } = layout;
  const { marginMM } = state.printSettings;

  // Build print output
  let printContainer = document.getElementById('print-output');
  if (!printContainer) {
    printContainer = document.createElement('div');
    printContainer.id = 'print-output';
    document.body.appendChild(printContainer);
  }
  printContainer.innerHTML = '';

  // Inject @page rule with proper page size
  const pageSize = state.printSettings.orientation === 'landscape'
    ? `${area.pageHeight}mm ${area.pageWidth}mm`
    : `${area.pageWidth}mm ${area.pageHeight}mm`;

  let printStyle = document.getElementById('dynamic-print-style');
  if (!printStyle) {
    printStyle = document.createElement('style');
    printStyle.id = 'dynamic-print-style';
    document.head.appendChild(printStyle);
  }
  printStyle.textContent = `
    @media print {
      @page { size: ${pageSize}; margin: 0 !important; }
      body { margin: 0 !important; padding: 0 !important; }
      .print-page { width: ${area.pageWidth}mm !important; height: ${area.pageHeight}mm !important; margin: 0 !important; padding: 0 !important; border: none !important; }
    }
  `;

  // Create print pages with mm-based dimensions
  for (const page of pages) {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'print-page';
    pageDiv.style.width = `${area.pageWidth}mm`;
    pageDiv.style.height = `${area.pageHeight}mm`;
    pageDiv.style.position = 'relative';
    pageDiv.style.pageBreakAfter = 'always';
    pageDiv.style.overflow = 'hidden';

    for (const entry of page.labels) {
      const cell = document.createElement('div');
      cell.className = 'print-label-cell';
      cell.style.position = 'absolute';
      cell.style.left = `${area.marginMM + entry.x}mm`;
      cell.style.top = `${area.marginMM + entry.y}mm`;
      cell.style.width = `${entry.widthMM}mm`;
      cell.style.height = `${entry.heightMM}mm`;
      cell.style.overflow = 'hidden';

      // Use mm-based rendering for label content
      const labelNode = renderLabelToNode(entry.label, entry.widthMM * SCREEN_PX_PER_MM, entry.heightMM * SCREEN_PX_PER_MM);
      labelNode.style.width = '100%';
      labelNode.style.height = '100%';
      cell.appendChild(labelNode);
      pageDiv.appendChild(cell);
    }

    // Cut marks for physical print
    if (state.printSettings.cutMarksType !== 'none' && !state.printSettings.singleLabel) {
      renderCutMarks(pageDiv, page, area, page.grid, 1, 'mm', true);
    }

    printContainer.appendChild(pageDiv);
  }

  // Trigger browser print dialog
  requestAnimationFrame(() => {
    window.print();
    // Clean up after print
    setTimeout(() => {
      printContainer.innerHTML = '';
    }, 1000);
  });
}

/* ---------- Init ---------- */

function initPrint() {
  document.getElementById('btn-toggle-1-1')?.addEventListener('click', () => {
    if (customPrintScale !== null) {
      customPrintScale = null; // back to fit
    } else {
      customPrintScale = 1; // 1:1 CSS pixels
      const slider = document.getElementById('print-scale-slider');
      if (slider) slider.value = 1;
      const val = document.getElementById('print-scale-val');
      if (val) val.textContent = '100%';
    }
    const container = document.getElementById('scale-slider-container');
    if (container) {
      container.style.display = customPrintScale !== null ? 'block' : 'none';
    }
    renderPrintPreview();
  });

  document.getElementById('print-scale-slider')?.addEventListener('input', (e) => {
    customPrintScale = parseFloat(e.target.value);
    document.getElementById('print-scale-val').textContent = `${Math.round(customPrintScale*100)}%`;
    renderPrintPreview();
  });

  subscribe(() => {
    if (state.currentView === 'print') {
      renderPrintPreview();
    }
  });
}

export { initPrint, renderPrintPreview, triggerPrint };
