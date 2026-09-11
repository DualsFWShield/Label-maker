/**
 * layout-engine.js — 2D bin-packing layout optimizer
 * Calculates how many labels fit on a page and their positions
 */

/* ---------- Paper definitions (in mm) ---------- */
const PAGE_FORMATS = {
  A4:     { width: 210, height: 297 },
  A3:     { width: 297, height: 420 },
  Letter: { width: 215.9, height: 279.4 },
  Legal:  { width: 215.9, height: 355.6 },
};

/**
 * Convert label dimensions to mm
 */
function toMM(value, unit) {
  switch (unit) {
    case 'cm': return value * 10;
    case 'in': return value * 25.4;
    default: return value; // mm
  }
}

/**
 * Get the printable area of a page in mm
 */
function getPrintableArea(pageFormat, orientation, marginMM) {
  const page = PAGE_FORMATS[pageFormat] ?? PAGE_FORMATS.A4;
  let { width, height } = page;
  if (orientation === 'landscape') {
    [width, height] = [height, width];
  }
  return {
    pageWidth: width,
    pageHeight: height,
    printableWidth: width - marginMM * 2,
    printableHeight: height - marginMM * 2,
    marginMM,
  };
}

/**
 * Calculate how many labels fit in a grid on one page
 * Returns { cols, rows, totalPerPage }
 */
function calculateGrid(labelWidthMM, labelHeightMM, printableWidth, printableHeight, gapMM) {
  if (labelWidthMM <= 0 || labelHeightMM <= 0) return { cols: 0, rows: 0, totalPerPage: 0 };

  const cols = Math.max(1, Math.floor((printableWidth + gapMM) / (labelWidthMM + gapMM)));
  const rows = Math.max(1, Math.floor((printableHeight + gapMM) / (labelHeightMM + gapMM)));
  return { cols, rows, totalPerPage: cols * rows };
}

/**
 * Main layout function: compute positions for all labels across pages
 *
 * @param {Array} labels - Array of label objects
 * @param {Object} printSettings - { pageFormat, orientation, marginMM, gapMM, showCutMarks, singleLabel }
 * @returns {Object} { pages: [{ pageIndex, labels: [{ label, x, y, widthMM, heightMM }] }], grid, area }
 */
function computeLayout(labels, printSettings) {
  const { pageFormat, orientation, marginMM, gapMM, singleLabel } = printSettings;
  const area = getPrintableArea(pageFormat, orientation, marginMM);

  // Build a flat list of (label, count) entries
  const flatLabels = [];
  for (const label of labels) {
    const wMM = toMM(label.widthMM, label.unit);
    const hMM = toMM(label.heightMM, label.unit);
    const copies = Math.max(1, label.copies ?? 1);
    for (let i = 0; i < copies; i++) {
      flatLabels.push({ label, widthMM: wMM, heightMM: hMM });
    }
  }

  if (flatLabels.length === 0) {
    return { pages: [], grid: { cols: 0, rows: 0, totalPerPage: 0 }, area };
  }

  // Single label mode: one label per page
  if (singleLabel) {
    const pages = flatLabels.map((entry, idx) => ({
      pageIndex: idx,
      labels: [{
        ...entry,
        x: (area.printableWidth - entry.widthMM) / 2,
        y: (area.printableHeight - entry.heightMM) / 2,
      }],
    }));
    return { pages, grid: { cols: 1, rows: 1, totalPerPage: 1 }, area };
  }

  // Group labels by size to prevent overlapping different sizes
  const groups = {};
  for (const entry of flatLabels) {
    const key = `${entry.widthMM}x${entry.heightMM}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  }

  const pages = [];
  let pageIndex = 0;

  for (const key of Object.keys(groups)) {
    const groupLabels = groups[key];
    const refW = groupLabels[0].widthMM;
    const refH = groupLabels[0].heightMM;

    // Calculate grid for this specific size
    let grid;
    let effectiveOrientation = orientation;

    if (orientation === 'auto') {
      const areaP = getPrintableArea(pageFormat, 'portrait', marginMM);
      const areaL = getPrintableArea(pageFormat, 'landscape', marginMM);
      const gridP = calculateGrid(refW, refH, areaP.printableWidth, areaP.printableHeight, gapMM);
      const gridL = calculateGrid(refW, refH, areaL.printableWidth, areaL.printableHeight, gapMM);

      if (gridL.totalPerPage > gridP.totalPerPage) {
        effectiveOrientation = 'landscape';
        grid = gridL;
        Object.assign(area, getPrintableArea(pageFormat, 'landscape', marginMM));
      } else {
        effectiveOrientation = 'portrait';
        grid = gridP;
        Object.assign(area, getPrintableArea(pageFormat, 'portrait', marginMM));
      }
    } else {
      grid = calculateGrid(refW, refH, area.printableWidth, area.printableHeight, gapMM);
    }

    area.effectiveOrientation = effectiveOrientation;

    const totalGridWidth = grid.cols * refW + (grid.cols - 1) * gapMM;
    const totalGridHeight = grid.rows * refH + (grid.rows - 1) * gapMM;
    const offsetX = (area.printableWidth - totalGridWidth) / 2;
    const offsetY = (area.printableHeight - totalGridHeight) / 2;

    let labelIdx = 0;
    while (labelIdx < groupLabels.length) {
      const pageLabels = [];
      for (let row = 0; row < grid.rows && labelIdx < groupLabels.length; row++) {
        for (let col = 0; col < grid.cols && labelIdx < groupLabels.length; col++) {
          const entry = groupLabels[labelIdx];
          pageLabels.push({
            ...entry,
            x: offsetX + col * (refW + gapMM),
            y: offsetY + row * (refH + gapMM),
          });
          labelIdx++;
        }
      }
      pages.push({ pageIndex: pageIndex++, labels: pageLabels, grid: grid });
    }
  }

  // Calculate global summary grid for the UI (just use the first group's grid as a rough indicator)
  const firstGrid = pages.length > 0 ? pages[0].grid : { cols: 0, rows: 0, totalPerPage: 0 };

  return { pages, grid: firstGrid, area };
}

export {
  PAGE_FORMATS,
  toMM,
  getPrintableArea,
  calculateGrid,
  computeLayout,
};
