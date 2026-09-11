/**
 * fonts.js — Google Fonts dynamic catalogue and loader
 */

const FONT_CATALOGUE = [
  // Sans-serif
  { name: 'Inter', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { name: 'Roboto', category: 'sans-serif', weights: [300, 400, 500, 700] },
  { name: 'Open Sans', category: 'sans-serif', weights: [300, 400, 600, 700] },
  { name: 'Montserrat', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800] },
  { name: 'Poppins', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { name: 'Lato', category: 'sans-serif', weights: [300, 400, 700] },
  { name: 'Nunito', category: 'sans-serif', weights: [300, 400, 600, 700] },
  { name: 'Outfit', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { name: 'Raleway', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { name: 'Oswald', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { name: 'Quicksand', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { name: 'Work Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { name: 'DM Sans', category: 'sans-serif', weights: [400, 500, 700] },
  { name: 'Barlow', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { name: 'Rubik', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { name: 'Manrope', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800] },
  { name: 'Space Grotesk', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { name: 'Plus Jakarta Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800] },

  // Serif
  { name: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700, 800] },
  { name: 'Merriweather', category: 'serif', weights: [300, 400, 700] },
  { name: 'Lora', category: 'serif', weights: [400, 500, 600, 700] },
  { name: 'PT Serif', category: 'serif', weights: [400, 700] },
  { name: 'Cinzel', category: 'serif', weights: [400, 500, 600, 700] },
  { name: 'EB Garamond', category: 'serif', weights: [400, 500, 600, 700] },
  { name: 'Cormorant Garamond', category: 'serif', weights: [300, 400, 500, 600, 700] },
  { name: 'Crimson Text', category: 'serif', weights: [400, 600, 700] },
  { name: 'Libre Baskerville', category: 'serif', weights: [400, 700] },
  { name: 'DM Serif Display', category: 'serif', weights: [400] },

  // Display / Decorative
  { name: 'Abril Fatface', category: 'display', weights: [400] },
  { name: 'Righteous', category: 'display', weights: [400] },
  { name: 'Bebas Neue', category: 'display', weights: [400] },
  { name: 'Anton', category: 'display', weights: [400] },
  { name: 'Alfa Slab One', category: 'display', weights: [400] },
  { name: 'Lobster', category: 'display', weights: [400] },
  { name: 'Permanent Marker', category: 'display', weights: [400] },
  { name: 'Fredoka One', category: 'display', weights: [400] },
  { name: 'Bungee', category: 'display', weights: [400] },

  // Handwriting / Script
  { name: 'Dancing Script', category: 'handwriting', weights: [400, 500, 600, 700] },
  { name: 'Pacifico', category: 'handwriting', weights: [400] },
  { name: 'Caveat', category: 'handwriting', weights: [400, 500, 600, 700] },
  { name: 'Great Vibes', category: 'handwriting', weights: [400] },
  { name: 'Sacramento', category: 'handwriting', weights: [400] },
  { name: 'Satisfy', category: 'handwriting', weights: [400] },
  { name: 'Kalam', category: 'handwriting', weights: [300, 400, 700] },
  { name: 'Shadows Into Light', category: 'handwriting', weights: [400] },
  { name: 'Indie Flower', category: 'handwriting', weights: [400] },
  { name: 'Amatic SC', category: 'handwriting', weights: [400, 700] },

  // Monospace
  { name: 'Fira Code', category: 'monospace', weights: [300, 400, 500, 600, 700] },
  { name: 'JetBrains Mono', category: 'monospace', weights: [300, 400, 500, 600, 700] },
  { name: 'Source Code Pro', category: 'monospace', weights: [300, 400, 500, 600, 700] },
  { name: 'Roboto Mono', category: 'monospace', weights: [300, 400, 500, 600, 700] },
  { name: 'IBM Plex Mono', category: 'monospace', weights: [300, 400, 500, 600, 700] },
];

const _loadedFonts = new Set();

/**
 * Load a Google Font dynamically by injecting a <link> element
 */
function loadFont(fontName) {
  // Standard web-safe fonts don't need to be loaded
  const systemFonts = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Tahoma', 'Trebuchet MS', 'Impact', 'Comic Sans MS', 'serif', 'sans-serif', 'monospace'];
  if (systemFonts.includes(fontName) || _loadedFonts.has(fontName)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const encoded = fontName.replace(/\s+/g, '+');
    const fontEntry = FONT_CATALOGUE.find((f) => f.name === fontName);
    const weights = fontEntry?.weights?.join(';') ?? '400;700';

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@${weights}&display=swap`;
    link.onload = () => {
      _loadedFonts.add(fontName);
      resolve();
    };
    link.onerror = () => {
      console.warn(`Failed to load font: ${fontName}`);
      resolve(); // Don't block on font failures
    };
    document.head.appendChild(link);
  });
}

/**
 * Preload the most common fonts used in the editor
 */
function preloadCommonFonts() {
  const common = ['Inter', 'Roboto', 'Montserrat', 'Playfair Display', 'Dancing Script', 'Oswald'];
  return Promise.all(common.map(loadFont));
}

/**
 * Get all fonts, optionally filtered by category
 */
function getFonts(category = null) {
  if (!category) return FONT_CATALOGUE;
  return FONT_CATALOGUE.filter((f) => f.category === category);
}

/**
 * Get unique categories
 */
function getCategories() {
  return [...new Set(FONT_CATALOGUE.map((f) => f.category))];
}

/**
 * Build the font-family CSS value
 */
function fontFamilyCSS(fontName) {
  const font = FONT_CATALOGUE.find((f) => f.name === fontName);
  const fallback = font?.category === 'monospace' ? 'monospace'
    : font?.category === 'serif' ? 'serif'
    : 'sans-serif';
  return `'${fontName}', ${fallback}`;
}

export {
  FONT_CATALOGUE,
  loadFont,
  preloadCommonFonts,
  getFonts,
  getCategories,
  fontFamilyCSS,
};
