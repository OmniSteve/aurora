const KEY = 'aurora_theme';

export function getTheme() {
  return (
    localStorage.getItem(KEY) ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(KEY, theme);
}

export function initTheme() {
  document.documentElement.classList.toggle('dark', getTheme() === 'dark');
}