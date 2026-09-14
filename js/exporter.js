/**
 * exporter.js — Handles exporting labels to various formats
 */

import { state } from './state.js';
import { computeLayout } from './layout-engine.js';

export function exportLabelsToJSON() {
  const json = JSON.stringify(state.labels, null, 2);
  downloadFile(json, 'labels.json', 'application/json');
}

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

export function exportLabelsToWord() {
  if (state.labels.length === 0) return;

  const layout = computeLayout(state.labels, state.printSettings);
  const margin = state.printSettings.marginMM;
  const gap = state.printSettings.gapMM;
  const labelW = state.labels[0].widthMM;
  const labelH = state.labels[0].heightMM;

  // Generate an HTML document structured for MS Word with table-based grid
  let html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>Exported Labels</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: ${margin}mm;
        }
        table {
          border-collapse: separate;
          border-spacing: ${gap}mm;
          margin-left: -${gap/2}mm;
        }
        td {
          width: ${labelW}mm;
          height: ${labelH}mm;
          border: 1px solid #ccc;
          padding: 2mm;
          vertical-align: middle;
        }
        .text-line { margin: 0; }
        .page-break { clear: both; page-break-after: always; }
      </style>
    </head>
    <body>
  `;

  layout.pages.forEach(page => {
    html += `<table>`;
    
    // Group labels by row based on Y coordinate (from layout engine)
    const rows = {};
    page.labels.forEach(entry => {
      // Round Y to avoid floating point grouping issues
      const yKey = Math.round(entry.y * 100);
      if (!rows[yKey]) rows[yKey] = [];
      rows[yKey].push(entry);
    });

    // Sort rows top-to-bottom
    const sortedYKeys = Object.keys(rows).sort((a,b) => parseInt(a) - parseInt(b));

    sortedYKeys.forEach(yKey => {
      html += `<tr>`;
      const rowLabels = rows[yKey].sort((a,b) => a.x - b.x); // sort left-to-right
      
      rowLabels.forEach(entry => {
        const lbl = entry.label;
        const vAlign = lbl.autoLayout?.enabled ? (lbl.autoLayout.textVerticalAlign === 'center' ? 'middle' : lbl.autoLayout.textVerticalAlign) : 'top';
        const padding = lbl.autoLayout?.enabled ? `${lbl.autoLayout.padding}%` : '2mm';
        const bg = lbl.background?.type === 'color' ? `background-color: ${lbl.background.color};` : '';
        let borderCSS = `border: none;`;
        if (lbl.border?.enabled) {
          borderCSS = `border: ${lbl.border.width}px ${lbl.border.style} ${lbl.border.color};`;
        } else if (state.printSettings.showCutLines) {
          borderCSS = `border: 1px dashed #999;`;
        }
        
        html += `<td style="vertical-align: ${vAlign}; padding: ${padding}; ${bg} ${borderCSS}">`;
        
        const els = [...lbl.elements].sort((a, b) => a.y - b.y);

        const gap = lbl.autoLayout?.enabled ? lbl.autoLayout.gap : 2;

        els.forEach((t, index) => {
          const marginBottom = index < els.length - 1 ? `${gap}%` : '0';
          
          if (t.type === 'text') {
            const fontWeight = t.fontWeight === 'bold' ? 'bold' : 'normal';
            const fontStyle = t.fontStyle === 'italic' ? 'italic' : 'normal';
            const textTransform = t.textTransform && t.textTransform !== 'none' ? `text-transform: ${t.textTransform};` : '';
            
            // Replace \n with <br> for Word
            const content = escapeHTML(t.content || '').replace(/\n/g, '<br>');

            html += `<p class="text-line" align="${t.textAlign}" style="font-family: '${t.fontFamily}', sans-serif; font-size: ${t.fontSize}pt; color: ${t.color}; font-weight: ${fontWeight}; font-style: ${fontStyle}; text-align: ${t.textAlign}; ${textTransform} line-height: ${t.lineHeight || 1.2}; margin-bottom: ${marginBottom};">
              ${content}
            </p>`;
          } else if (t.type === 'image' && t.src) {
            const width = lbl.autoLayout?.enabled ? `${lbl.autoLayout.imageSizePercent || 30}%` : `${t.width}%`;
            html += `<div style="text-align: center; margin-bottom: ${marginBottom};">
              <img src="${t.src}" style="width: ${width}; max-width: 100%; opacity: ${t.opacity || 1};" />
            </div>`;
          }
        });
        html += `</td>`;
      });
      html += `</tr>`;
    });

    html += `</table><div class="page-break"></div>`;
  });

  html += `</body></html>`;

  downloadFile(html, 'labels.doc', 'application/msword');
}

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
