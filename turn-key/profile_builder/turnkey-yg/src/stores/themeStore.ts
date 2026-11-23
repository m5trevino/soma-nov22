import { createSignal } from 'solid-js';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'turnkey-theme';

function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initialTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const attribute = document.documentElement.dataset.theme;
  if (attribute === 'light' || attribute === 'dark') return attribute;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
  return systemTheme();
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#121419' : '#e9e4d9';
}

const [theme, setThemeSignal] = createSignal<Theme>(initialTheme());
applyTheme(theme());

export function useThemeStore() {
  const setTheme = (next: Theme) => {
    setThemeSignal(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort; the active session still switches.
    }
  };

  const toggleTheme = () => setTheme(theme() === 'light' ? 'dark' : 'light');

  return { theme, setTheme, toggleTheme };
}
