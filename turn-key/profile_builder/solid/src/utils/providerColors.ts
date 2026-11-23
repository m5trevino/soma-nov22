/**
 * Provider colour system.
 *
 * Colours are assigned from a fixed, well-separated palette to the providers
 * that are actually present. Two providers in the same session can therefore
 * never receive the same swatch. Violet is deliberately reserved for the app
 * accent, so providers stay visually distinct from selection UI.
 */

export const PROVIDER_PALETTE = [
  '#b0520e', // burnt orange
  '#0b7c86', // teal
  '#2456c9', // blue
  '#b01e42', // crimson
  '#2f7d3f', // forest
  '#a21caf', // magenta
  '#7a6400', // olive gold
  '#4338ca', // indigo
  '#3b6b95', // steel blue
  '#b23a2a', // brick
  '#127a5e', // sea green
  '#8a4a16', // sienna
  '#a52a6d', // raspberry
  '#445069', // slate
  '#5c7a00', // olive green
  '#0e6f8a', // deep cyan
  '#7d1f8a', // plum
  '#8f3418', // rust
  '#1e3a8a', // navy
  '#0b6b4f', // emerald
  '#6b4f2a', // brown
  '#146b6b', // dark teal
  '#0f5c9e', // ocean
  '#8c2f8c', // orchid
];

const FALLBACK = '#6f675a';

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (segment < 1) [red, green, blue] = [chroma, secondary, 0];
  else if (segment < 2) [red, green, blue] = [secondary, chroma, 0];
  else if (segment < 3) [red, green, blue] = [0, chroma, secondary];
  else if (segment < 4) [red, green, blue] = [0, secondary, chroma];
  else if (segment < 5) [red, green, blue] = [secondary, 0, chroma];
  else [red, green, blue] = [chroma, 0, secondary];

  const match = l - chroma / 2;
  return `#${[red, green, blue]
    .map(channel => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Golden-angle colours for provider counts beyond the curated palette. */
function generatedColor(index: number): string {
  const hue = (index * 137.508 + 19) % 360;
  const lightness = 34 + (index % 5) * 2.5;
  return hslToHex(hue, 61, lightness);
}

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map(channel =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastWithWhite(hex: string): number {
  const luminance = relativeLuminance(hex);
  return (1.05) / (luminance + 0.05);
}

export function readableText(hex: string): string {
  return contrastWithWhite(hex) >= 4.5 ? '#ffffff' : '#241f18';
}

/** Stable fallback when a provider is not part of the active colour map. */
export function providerColor(provider: string): string {
  const key = (provider || 'unknown').toLowerCase().trim();
  if (!key || key === 'unknown') return FALLBACK;
  return PROVIDER_PALETTE[hashString(key) % PROVIDER_PALETTE.length];
}

/** Assigns a unique palette entry to every provider in the supplied order. */
export function buildProviderColorMap(providers: string[]): Record<string, string> {
  const unique: string[] = [];
  for (const provider of providers) {
    const key = (provider || '').trim();
    if (!key || key === 'unknown' || unique.includes(key)) continue;
    unique.push(key);
  }

  const map: Record<string, string> = {};
  unique.forEach((provider, index) => {
    map[provider] = index < PROVIDER_PALETTE.length
      ? PROVIDER_PALETTE[index]
      : generatedColor(index - PROVIDER_PALETTE.length);
  });
  return map;
}

export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Mixes a colour toward black (negative amount) or white (positive amount). */
export function shade(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const channels = [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
  const target = amount < 0 ? 0 : 255;
  const ratio = Math.min(1, Math.abs(amount));
  const mixed = channels.map(c => Math.round(c + (target - c) * ratio));
  return `#${mixed.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Returns a style string with every custom property the skeuomorphic
 * provider surfaces need. Kept as a string so Solid sets real CSS variables.
 */
export function providerVars(color: string): string {
  const text = readableText(color);
  return [
    `--pc:${color}`,
    `--pc-soft:${hexToRgba(color, 0.13)}`,
    `--pc-line:${hexToRgba(color, 0.42)}`,
    `--pc-glow:${hexToRgba(color, 0.45)}`,
    `--pc-deep:${shade(color, -0.2)}`,
    `--pc-light:${shade(color, 0.22)}`,
    `--pc-ink:${shade(color, -0.3)}`,
    `--pc-ink-dark:${shade(color, 0.45)}`,
    `--pc-text:${text}`,
    `--pc-text-shadow:${text === '#ffffff' ? '0 1px 0 rgba(0,0,0,.18)' : '0 1px 0 rgba(255,255,255,.35)'}`,
  ].join(';');
}
