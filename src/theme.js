// stickeR1-inspired slate palette + Rule One Toolbox teal accent
// Mutable C object switches between palettes

export const C_LIGHT = {
  bg: '#f8f9fb',
  bgCard: '#ffffff',
  bgHover: '#f1f5f9',
  bgInput: '#ffffff',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  text: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  accent: '#0f766e',
  accentHover: '#0d9488',
  accentLight: '#f0fdfa',
  green: '#16a34a',
  greenBg: '#dcfce7',
  yellow: '#ca8a04',
  yellowBg: '#fef9c3',
  red: '#dc2626',
  redBg: '#fee2e2',
  sidebar: '#ffffff',
  sidebarHover: '#f1f5f9',
  sidebarActive: '#f0fdfa',
  header: '#ffffff',
  headerBorder: '#e2e8f0',
  headerBg: '#f8f9fb',
  scoreBgGreen: '#16a34a',
  scoreBgYellow: '#ca8a04',
  scoreBgRed: '#dc2626',
  badge: '#f1f5f9',
  badgeText: '#64748b',
  shadow: 'rgba(0, 0, 0, 0.08)',
  tooltipBg: '#1e293b',
  tooltipText: '#f1f5f9',
};

export const C_DARK = {
  bg: '#0f172a',
  bgCard: '#1e293b',
  bgHover: '#334155',
  bgInput: '#1e293b',
  border: '#334155',
  borderLight: '#1e293b',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  accent: '#2dd4bf',
  accentHover: '#5eead4',
  accentLight: '#042f2e',
  green: '#4ade80',
  greenBg: '#052e16',
  yellow: '#fbbf24',
  yellowBg: '#422006',
  red: '#f87171',
  redBg: '#450a0a',
  sidebar: '#0f172a',
  sidebarHover: '#1e293b',
  sidebarActive: '#042f2e',
  header: '#1e293b',
  headerBorder: '#334155',
  headerBg: '#0f172a',
  scoreBgGreen: '#16a34a',
  scoreBgYellow: '#ca8a04',
  scoreBgRed: '#dc2626',
  badge: '#334155',
  badgeText: '#94a3b8',
  shadow: 'rgba(0, 0, 0, 0.3)',
  tooltipBg: '#f1f5f9',
  tooltipText: '#1e293b',
};

// Mutable palette object — components read from this
export const C = { ...C_LIGHT };

export function applyTheme(isDark) {
  const source = isDark ? C_DARK : C_LIGHT;
  Object.assign(C, source);
  // Update CSS custom properties for scrollbar
  document.documentElement.style.setProperty('--scrollbar-thumb', isDark ? '#475569' : '#cbd5e1');
  document.documentElement.style.setProperty('--scrollbar-hover', isDark ? '#64748b' : '#94a3b8');
}
