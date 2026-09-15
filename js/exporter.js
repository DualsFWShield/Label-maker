/**
 * exporter.js — Handles exporting labels to various formats
 */

import { state } from './state.js';
import { computeLayout } from './layout-engine.js';
import { fontFamilyCSS } from './fonts.js';

/* ---------- Word Export (table-based, Word-compatible) ---------- */

/**
 * Compute auto-layout zones for export (simplified, no DOM measurement).
 * Returns { textZone, imageZone } with percentage-based coordinates.
 */
function getAutoLayoutZones(label) {
  const layout = label.autoLayout;
  if (!layout?.enabled) return null;

  const pad = layout.padding ?? 8;
  const imgPos = layout.imagePosition ?? 'left';
  const imgSize = layout.imageSizePercent ?? 30;

  const textElements = label.elements.filter(el => el.type === 'text');
  const imageElements = label.elements.filter(el => el.type === 'image');
  const hasImages = imageElements.length > 0 && imgPos !== 'none';

  if (!hasImages) {
    return { imagePosition: 'none', padding: pad, gap: layout.gap ?? 2, vAlign: layout.textVerticalAlign ?? 'center' };
  }

  return { imagePosition: imgPos, imageSizePercent: imgSize, padding: pad, gap: layout.gap ?? 2, vAlign: layout.textVerticalAlign ?? 'center' };
}

/**
 * Render a single label cell content as Word-compatible HTML (table-based)
 */
function renderLabelContentForWord(label) {
  const zones = getAutoLayoutZones(label);
  const textElements = label.elements.filter(el => el.type === 'text');
  const imageElements = label.elements.filter(el => el.type === 'image');

  // Build text HTML
  const textHTML = textElements.map((el, idx) => {
    const fontWeight = el.fontWeight === 'bold' ? 'bold' : 'normal';
    const fontStyle = el.fontStyle === 'italic' ? 'italic' : 'normal';
    const textDecoration = el.textDecoration && el.textDecoration !== 'none' ? `text-decoration: ${el.textDecoration};` : '';
    const textTransform = el.textTransform && el.textTransform !== 'none' ? `text-transform: ${el.textTransform};` : '';
    const highlightBg = el.highlightColor && el.highlightColor !== 'transparent' && el.highlightColor !== '#ffffff' ? `background-color: ${el.highlightColor};` : '';
    const content = escapeHTML(el.content || '').replace(/\n/g, '<br>');
    const marginBottom = idx < textElements.length - 1 ? `margin-bottom: ${zones?.gap ?? 2}%;` : '';
    const fontCSS = fontFamilyCSS(el.fontFamily);

    return `<p style="margin: 0; ${marginBottom} font-family: ${fontCSS}; font-size: ${el.fontSize}pt; color: ${el.color}; font-weight: ${fontWeight}; font-style: ${fontStyle}; text-align: ${el.textAlign || 'center'}; line-height: ${el.lineHeight || 1.4}; letter-spacing: ${el.letterSpacing || 0}px; ${textDecoration} ${textTransform} ${highlightBg}">${content}</p>`;
  }).join('\n');

  // Build image HTML
  const imageHTML = imageElements.map(el => {
    if (!el.src) return '';
    return `<img src="${el.src}" style="max-width: 100%; max-height: 100%; opacity: ${el.opacity ?? 1};" />`;
  }).join('');

  // If no auto-layout, just stack everything
  if (!zones || zones.imagePosition === 'none' || imageElements.length === 0) {
    const vAlign = zones?.vAlign === 'top' ? 'top' : zones?.vAlign === 'bottom' ? 'bottom' : 'middle';
    const pad = zones?.padding ?? 8;
    return `<table width="100%" height="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout: fixed;">
      <tr><td valign="${vAlign}" style="padding: ${pad}%;">
        ${textHTML}
      </td></tr>
    </table>`;
  }

  // Auto-layout with image + text side by side (or top/bottom)
  const imgPos = zones.imagePosition;
  const imgSize = zones.imageSizePercent ?? 30;
  const textSize = 100 - imgSize;
  const pad = zones.padding ?? 8;
  const vAlign = zones.vAlign === 'top' ? 'top' : zones.vAlign === 'bottom' ? 'bottom' : 'middle';

  if (imgPos === 'left' || imgPos === 'right') {
    // Horizontal layout: image on left/right, text on the other side
    const imgCell = `<td width="${imgSize}%" valign="middle" style="padding: ${pad / 2}%; text-align: center;">
      ${imageHTML}
    </td>`;
    const textCell = `<td width="${textSize}%" valign="${vAlign}" style="padding: ${pad / 2}%;">
      ${textHTML}
    </td>`;

    const cells = imgPos === 'left' ? imgCell + textCell : textCell + imgCell;
    return `<table width="100%" height="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout: fixed;">
      <tr>${cells}</tr>
    </table>`;
  }

  // Vertical layout: image on top/bottom, text on the other side
  const imgRow = `<tr><td height="${imgSize}%" valign="middle" style="padding: ${pad / 2}%; text-align: center;">
    ${imageHTML}
  </td></tr>`;
  const textRow = `<tr><td height="${textSize}%" valign="${vAlign}" style="padding: ${pad / 2}%;">
    ${textHTML}
  </td></tr>`;

  const rows = imgPos === 'top' ? imgRow + textRow : textRow + imgRow;
  return `<table width="100%" height="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout: fixed;">
    ${rows}
  </table>`;
}

export function exportLabelsToWord() {
  if (state.labels.length === 0) return;

  const layout = computeLayout(state.labels, state.printSettings);
  const { pages, area } = layout;
  const margin = state.printSettings.marginMM;
  const gapMM = state.printSettings.gapMM;
  const cutMarksType = state.printSettings.cutMarksType || 'both';

  const pageW = area.pageWidth;
  const pageH = area.pageHeight;

  // Determine border style for cut marks
  let cellBorderStyle = 'border: none;';
  if (cutMarksType === 'both' || cutMarksType === 'outside') {
    cellBorderStyle = 'border: 0.5pt dashed #999999;';
  } else if (cutMarksType === 'inside') {
    cellBorderStyle = 'border: 0.5pt dashed #999999;';
  } else {
    cellBorderStyle = 'border: none;';
  }

  // Pre-compute grid dimensions for CSS (from first page)
  const firstPage = pages[0];
  const grid0 = firstPage?.grid || { cols: 1, rows: 1 };
  const grid0Entry = firstPage?.labels[0];
  const grid0CellW = grid0Entry?.widthMM || 90;
  const grid0CellH = grid0Entry?.heightMM || 50;
  const grid0TotalW = grid0.cols * grid0CellW + (grid0.cols - 1) * gapMM;

  let html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
  xmlns:w='urn:schemas-microsoft-com:office:word'
  xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>Exported Labels</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page {
      size: ${pageW}mm ${pageH}mm;
      margin: ${margin}mm;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
    }
    table.page-grid {
      border-collapse: separate;
      border-spacing: ${gapMM}mm;
      margin: 0 auto;
      table-layout: fixed;
      width: ${grid0TotalW}mm;
    }
    tr.label-row {
      height: ${grid0CellH}mm;
      mso-height-rule: exactly;
    }
    td.label-cell {
      overflow: hidden;
      padding: 0;
      vertical-align: top;
      mso-height-rule: exactly;
    }
    .page-break {
      page-break-after: always;
      clear: both;
      height: 0;
      line-height: 0;
      font-size: 0;
    }
    p { margin: 0; }
    img { border: 0; }
  </style>
</head>
<body>`;

  pages.forEach((page, pageIdx) => {
    if (page.labels.length === 0) return;

    const grid = page.grid;
    const firstEntry = page.labels[0];
    const cellW = firstEntry.widthMM;
    const cellH = firstEntry.heightMM;

    html += `\n<table class="page-grid" cellpadding="0" cellspacing="0">`;

    // Organize labels into rows
    const rows = [];
    let labelIdx = 0;
    for (let r = 0; r < grid.rows && labelIdx < page.labels.length; r++) {
      const row = [];
      for (let c = 0; c < grid.cols && labelIdx < page.labels.length; c++) {
        row.push(page.labels[labelIdx]);
        labelIdx++;
      }
      rows.push(row);
    }

    rows.forEach(row => {
      html += `\n  <tr class="label-row" style="height: ${cellH}mm; mso-height-rule: exactly;">`;

      row.forEach(entry => {
        const lbl = entry.label;

        // Background CSS
        let bgCSS = 'background-color: #ffffff;';
        if (lbl.background?.type === 'color') {
          bgCSS = `background-color: ${lbl.background.color};`;
        } else if (lbl.background?.type === 'gradient') {
          const stops = lbl.background.gradient.stops.map(s => `${s.color} ${s.position}%`).join(', ');
          if (lbl.background.gradient.type === 'radial') {
            bgCSS = `background: ${lbl.background.color || '#ffffff'}; background: radial-gradient(circle, ${stops});`;
          } else {
            bgCSS = `background: ${lbl.background.color || '#ffffff'}; background: linear-gradient(${lbl.background.gradient.angle}deg, ${stops});`;
          }
        }

        // Border CSS (label's own border takes precedence over cut marks)
        let borderCSS = cellBorderStyle;
        if (lbl.border?.enabled) {
          borderCSS = `border: ${lbl.border.width}px ${lbl.border.style} ${lbl.border.color};`;
          if (lbl.border.radius > 0) {
            borderCSS += ` border-radius: ${lbl.border.radius}px;`;
          }
        }

        // Render cell
        html += `\n    <td class="label-cell" style="width: ${cellW}mm; height: ${cellH}mm; mso-height-rule: exactly; ${bgCSS} ${borderCSS}">`;
        html += renderLabelContentForWord(lbl);
        html += `\n    </td>`;
      });

      // Fill empty cells in incomplete rows
      const remaining = grid.cols - row.length;
      for (let i = 0; i < remaining; i++) {
        html += `\n    <td style="width: ${cellW}mm; height: ${cellH}mm; mso-height-rule: exactly; border: none;"></td>`;
      }

      html += `\n  </tr>`;
    });

    html += `\n</table>`;

    // Page break (except last page)
    if (pageIdx < pages.length - 1) {
      html += `\n<div class="page-break">&nbsp;</div>`;
    }
  });

  html += `\n</body>\n</html>`;

  downloadFile(html, 'labels.doc', 'application/msword');
}

/* ---------- JSON Export ---------- */

export function exportLabelsToJSON() {
  const json = JSON.stringify(state.labels, null, 2);
  downloadFile(json, 'labels.json', 'application/json');
}

/* ---------- CSV Export ---------- */

export function exportLabelsToCSV() {
  if (state.labels.length === 0) return;

  // We map the elements back to the import template columns as best as we can
  const headers = [
    'name', 'line2', 'line3', 'width_mm', 'height_mm',
    'font', 'font_size', 'bold', 'italic', 'text_color',
    'font2', 'size2', 'bold2', 'italic2', 'color2',
    'font3', 'size3', 'bold3', 'italic3', 'color3',
    'bg_color', 'border_color', 'image_url', 'image_required'
  ];

  let csvContent = headers.join(',') + '\n';

  state.labels.forEach((label) => {
    const texts = label.elements.filter(el => el.type === 'text');
    const images = label.elements.filter(el => el.type === 'image');

    const t1 = texts[0] || {};
    const t2 = texts[1] || {};
    const t3 = texts[2] || {};
    const img = images[0] || {};

    const row = [
      escapeCSV(t1.content || ''),
      escapeCSV(t2.content || ''),
      escapeCSV(t3.content || ''),
      label.widthMM,
      label.heightMM,
      t1.fontFamily || 'Arial', t1.fontSize || 16, t1.fontWeight === 'bold' ? 'true' : 'false', t1.fontStyle === 'italic' ? 'true' : 'false', t1.color || '#000000',
      t2.fontFamily || 'Arial', t2.fontSize || 14, t2.fontWeight === 'bold' ? 'true' : 'false', t2.fontStyle === 'italic' ? 'true' : 'false', t2.color || '#000000',
      t3.fontFamily || 'Arial', t3.fontSize || 12, t3.fontWeight === 'bold' ? 'true' : 'false', t3.fontStyle === 'italic' ? 'true' : 'false', t3.color || '#000000',
      label.background.type === 'color' ? label.background.color : '#ffffff',
      label.border?.enabled ? label.border.color : '',
      img.src ? escapeCSV(img.src) : '',
      img.src ? 'true' : 'false'
    ];

    csvContent += row.join(',') + '\n';
  });

  downloadFile(csvContent, 'labels.csv', 'text/csv;charset=utf-8;');
}

/* ---------- Helpers ---------- */

function escapeCSV(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
