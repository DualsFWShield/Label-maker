/**
 * importer.js — Multi-format data importer and sample template generator
 * Supports CSV, XLSX, JSON, TXT import and template download
 */

import { addLabel, createDefaultLabel } from './state.js';

/* ---------- Sample Template Data ---------- */

const SAMPLE_LABELS = [
  {
    name: 'Confiture de Fraises',
    line2: 'Fait maison - 2024',
    line3: '350g',
    width_mm: 90,
    height_mm: 50,
    font: 'Dancing Script',
    font_size: 24,
    bold: true,
    italic: false,
    text_color: '#2d1810',
    font2: 'Inter',
    size2: 12,
    bold2: false,
    italic2: true,
    color2: '#4b5563',
    font3: 'Inter',
    size3: 10,
    bold3: true,
    italic3: false,
    color3: '#111827',
    bg_color: '#fef3c7',
    border_color: '#92400e',
    image_url: '',
  },
  {
    name: 'Miel de Lavande',
    line2: 'Provence - Récolte 2024',
    line3: '250g',
    width_mm: 90,
    height_mm: 50,
    font: 'Playfair Display',
    font_size: 20,
    bold: false,
    italic: false,
    text_color: '#1e3a5f',
    font2: 'Inter',
    size2: 11,
    bold2: false,
    italic2: true,
    color2: '#3b82f6',
    font3: 'Inter',
    size3: 12,
    bold3: true,
    italic3: false,
    color3: '#1e3a5f',
    bg_color: '#eff6ff',
    border_color: '#3b82f6',
    image_url: '',
    image_required: false,
  },
  {
    name: 'Huile d\'Olive',
    line2: 'Extra Vierge',
    line3: '500ml',
    width_mm: 70,
    height_mm: 100,
    font: 'Cinzel',
    font_size: 18,
    bold: true,
    italic: false,
    text_color: '#365314',
    font2: 'Cinzel',
    size2: 14,
    bold2: false,
    italic2: false,
    color2: '#4d7c0f',
    font3: 'Inter',
    size3: 12,
    bold3: true,
    italic3: false,
    color3: '#365314',
    bg_color: '#f0fdf4',
    border_color: '#16a34a',
    image_url: '',
    image_required: true,
  },
];

/* ---------- Template Generators ---------- */

function generateCSVTemplate() {
  const headers = 'name,line2,line3,width_mm,height_mm,font,font_size,bold,italic,text_color,font2,size2,bold2,italic2,color2,font3,size3,bold3,italic3,color3,bg_color,border_color,image_url,image_required';
  const rows = SAMPLE_LABELS.map((l) =>
    `"${l.name}","${l.line2}","${l.line3}",${l.width_mm},${l.height_mm},"${l.font}",${l.font_size},${l.bold},${l.italic},"${l.text_color}","${l.font2}",${l.size2},${l.bold2},${l.italic2},"${l.color2}","${l.font3}",${l.size3},${l.bold3},${l.italic3},"${l.color3}","${l.bg_color}","${l.border_color}","${l.image_url}",${l.image_required}`
  );
  return headers + '\n' + rows.join('\n');
}

function generateJSONTemplate() {
  return JSON.stringify({
    description: 'Label Maker Studio — Import Template',
    columns: {
      name: 'Main text / title of the label (required)',
      line2: 'Second line text (optional)',
      line3: 'Third line text (optional)',
      width_mm: 'Label width in mm (default: 90)',
      height_mm: 'Label height in mm (default: 50)',
      font: 'Font for main text (default: Inter)',
      font_size: 'Font size for main text',
      bold: 'true/false for main text',
      italic: 'true/false for main text',
      text_color: 'Hex color for main text',
      font2: 'Font for line2',
      size2: 'Font size for line2',
      bold2: 'true/false for line2',
      italic2: 'true/false for line2',
      color2: 'Hex color for line2',
      font3: 'Font for line3',
      size3: 'Font size for line3',
      bold3: 'true/false for line3',
      italic3: 'true/false for line3',
      color3: 'Hex color for line3',
      bg_color: 'Hex color for background (default: #ffffff)',
      border_color: 'Hex color for border (default: none)',
      image_url: 'URL to an image/illustration (optional)',
      image_required: 'true/false indicating if this label needs an image (optional)',
    },
    labels: SAMPLE_LABELS,
  }, null, 2);
}

function generateTXTTemplate() {
  const headers = 'name\tline2\tline3\twidth_mm\theight_mm\tfont\tfont_size\tbold\titalic\ttext_color\tfont2\tsize2\tbold2\titalic2\tcolor2\tfont3\tsize3\tbold3\titalic3\tcolor3\tbg_color\tborder_color\timage_url\timage_required';
  const rows = SAMPLE_LABELS.map((l) =>
    `${l.name}\t${l.line2}\t${l.line3}\t${l.width_mm}\t${l.height_mm}\t${l.font}\t${l.font_size}\t${l.bold}\t${l.italic}\t${l.text_color}\t${l.font2}\t${l.size2}\t${l.bold2}\t${l.italic2}\t${l.color2}\t${l.font3}\t${l.size3}\t${l.bold3}\t${l.italic3}\t${l.color3}\t${l.bg_color}\t${l.border_color}\t${l.image_url}\t${l.image_required}`
  );
  return headers + '\n' + rows.join('\n');
}

async function generateXLSXTemplate() {
  // Requires XLSX (SheetJS) to be loaded globally
  if (typeof XLSX === 'undefined') {
    throw new Error('XLSX library not loaded');
  }

  const data = [
    ['name', 'line2', 'line3', 'width_mm', 'height_mm', 'font', 'font_size', 'bold', 'italic', 'text_color', 'font2', 'size2', 'bold2', 'italic2', 'color2', 'font3', 'size3', 'bold3', 'italic3', 'color3', 'bg_color', 'border_color', 'image_url', 'image_required'],
    ...SAMPLE_LABELS.map((l) => [l.name, l.line2, l.line3, l.width_mm, l.height_mm, l.font, l.font_size, l.bold, l.italic, l.text_color, l.font2, l.size2, l.bold2, l.italic2, l.color2, l.font3, l.size3, l.bold3, l.italic3, l.color3, l.bg_color, l.border_color, l.image_url, l.image_required]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Labels');
  XLSX.writeFile(wb, 'modele_etiquettes.xlsx');
}

/* ---------- Download Helper ---------- */

function downloadFile(content, filename, mimeType = 'text/plain') {
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

function downloadTemplate(format) {
  switch (format) {
    case 'csv':
      downloadFile(generateCSVTemplate(), 'modele_etiquettes.csv', 'text/csv;charset=utf-8');
      break;
    case 'json':
      downloadFile(generateJSONTemplate(), 'modele_etiquettes.json', 'application/json');
      break;
    case 'txt':
      downloadFile(generateTXTTemplate(), 'modele_etiquettes.txt', 'text/plain;charset=utf-8');
      break;
    case 'xlsx':
      generateXLSXTemplate();
      break;
  }
}

/* ---------- Importers ---------- */

/**
 * Parse a row of data into a label configuration
 */
function rowToLabel(row) {
  const name = row.name || row.Name || row.nom || row.Nom || 'Label';
  const line2 = row.line2 || row.Line2 || row.ligne2 || '';
  const line3 = row.line3 || row.Line3 || row.ligne3 || '';
  const widthMM = parseFloat(row.width_mm || row.width || row.largeur || 90) || 90;
  const heightMM = parseFloat(row.height_mm || row.height || row.hauteur || 50) || 50;
  const font = row.font || row.police || 'Inter';
  const fontSize = parseFloat(row.font_size || row.taille || 16) || 16;
  const bold = parseBool(row.bold || row.gras);
  const italic = parseBool(row.italic || row.italique);
  const textColor = row.text_color || row.couleur || '#000000';
  const bgColor = row.bg_color || row.fond || '#ffffff';
  const borderColor = row.border_color || row.bordure || '';
  let imageUrl = row.image_url || row.image || row.illustration || '';
  if (typeof imageUrl === 'string') {
    const lowerUrl = imageUrl.toLowerCase().trim();
    if (lowerUrl === "pas d'image" || lowerUrl === "none" || lowerUrl === "false" || lowerUrl === "0" || lowerUrl === "non") {
      imageUrl = '';
    }
  }

  // Check if image is required (even if header is missing, by scanning row values)
  const allValuesStr = Object.values(row).join(' ').toLowerCase();
  let imageRequired = parseBool(row.image_required || row.image_requise || row.image_needed || false);
  if (!imageRequired && (allValuesStr.includes('dessin requis') || allValuesStr.includes('dessin rouleau'))) {
    imageRequired = true;
  }

  const label = createDefaultLabel({
    name,
    widthMM,
    heightMM,
    unit: 'mm',
    background: {
      type: 'color',
      color: bgColor,
      gradient: { type: 'linear', angle: 135, stops: [{ color: bgColor, position: 0 }, { color: bgColor, position: 100 }] },
      image: { src: '', fit: 'cover', opacity: 1 },
    },
    border: borderColor ? {
      enabled: true,
      width: 2,
      style: 'solid',
      color: borderColor,
      radius: 4,
    } : { enabled: false, width: 1, style: 'solid', color: '#000000', radius: 0 },
  });

  // Main text element
  label.elements[0] = {
    ...label.elements[0],
    content: name,
    fontFamily: font,
    fontSize,
    fontWeight: bold ? 'bold' : 'normal',
    fontStyle: italic ? 'italic' : 'normal',
    color: textColor,
    x: 5,
    y: 10,
    width: 90,
    height: 30,
  };

  // Add line 2
  if (line2) {
    const font2 = row.font2 || row.police2 || font;
    const size2 = parseFloat(row.size2 || row.taille2 || row.font_size2) || fontSize * 0.8;
    const bold2 = parseBool(row.bold2 !== undefined ? row.bold2 : row.gras2 !== undefined ? row.gras2 : false);
    const italic2 = parseBool(row.italic2 !== undefined ? row.italic2 : row.italique2 !== undefined ? row.italique2 : false);
    const color2 = row.color2 || row.text_color2 || row.couleur2 || textColor;

    label.elements.push({
      id: crypto.randomUUID(),
      type: 'text',
      content: line2,
      fontFamily: font2,
      fontSize: size2,
      fontWeight: bold2 ? 'bold' : 'normal',
      fontStyle: italic2 ? 'italic' : 'normal',
      color: color2,
      textAlign: 'center',
      lineHeight: 1.4,
      letterSpacing: 0,
      textDecoration: 'none',
      x: 5, y: 30, width: 90, height: 20,
    });
  }

  // Add line 3
  if (line3) {
    const font3 = row.font3 || row.police3 || font;
    const size3 = parseFloat(row.size3 || row.taille3 || row.font_size3) || fontSize * 0.6;
    const bold3 = parseBool(row.bold3 !== undefined ? row.bold3 : row.gras3 !== undefined ? row.gras3 : false);
    const italic3 = parseBool(row.italic3 !== undefined ? row.italic3 : row.italique3 !== undefined ? row.italique3 : false);
    const color3 = row.color3 || row.text_color3 || row.couleur3 || textColor;

    label.elements.push({
      id: crypto.randomUUID(),
      type: 'text',
      content: line3,
      fontFamily: font3,
      fontSize: size3,
      fontWeight: bold3 ? 'bold' : 'normal',
      fontStyle: italic3 ? 'italic' : 'normal',
      color: color3,
      textAlign: 'center',
      lineHeight: 1.4,
      letterSpacing: 0,
      textDecoration: 'none',
      x: 5, y: 50, width: 90, height: 20,
    });
  }

  // Add image element if URL provided or explicitly required
  if (imageUrl || imageRequired) {
    label.elements.push({
      id: crypto.randomUUID(),
      type: 'image',
      src: imageUrl || '',
      imageId: null,
      x: 70,
      y: 5,
      width: 25,
      height: 35,
      objectFit: 'contain',
      opacity: 1,
      rotation: 0,
    });
  }

  return label;
}

function parseBool(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true' || val === '1' || val.toLowerCase() === 'oui';
  return !!val;
}

/* ---------- CSV Parser ---------- */

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  // Detect delimiter
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

  const headers = parseCSVLine(firstLine, delimiter);
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    if (values.length === 0) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] || '').trim(); });
    results.push(row);
  }

  return results;
}

function parseCSVLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result.map((v) => v.replace(/^"|"$/g, ''));
}

/* ---------- JSON Parser ---------- */

function parseJSON(text) {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data;
  if (data.labels && Array.isArray(data.labels)) return data.labels;
  return [data];
}

/* ---------- TXT Parser (tab-delimited) ---------- */

function parseTXT(text) {
  return parseCSV(text); // Same logic, auto-detects tab delimiter
}

/* ---------- XLSX Parser ---------- */

function parseXLSX(arrayBuffer) {
  if (typeof XLSX === 'undefined') {
    throw new Error('XLSX library not loaded');
  }
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws);
}

/* ---------- Main Import Function ---------- */

async function importFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  let rows = [];

  try {
    if (ext === 'csv') {
      const text = await file.text();
      rows = parseCSV(text);
    } else if (ext === 'json') {
      const text = await file.text();
      rows = parseJSON(text);
    } else if (ext === 'txt') {
      const text = await file.text();
      rows = parseTXT(text);
    } else if (ext === 'xlsx' || ext === 'xls') {
      const buffer = await file.arrayBuffer();
      rows = parseXLSX(buffer);
    } else {
      throw new Error(`Unsupported file format: .${ext}`);
    }
  } catch (e) {
    console.error('Import error:', e);
    throw e;
  }

  // Convert rows to labels
  const imported = [];
  for (const row of rows) {
    const labelConfig = rowToLabel(row);
    const label = addLabel(labelConfig);
    imported.push(label);
  }

  return imported;
}

export { importFile, downloadTemplate };
