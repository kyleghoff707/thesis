// Dark and light palette objects — same approach as stickeR1
// Mutable C object switches between palettes

export const C_DARK = {
  bg: '#0d1117',
  bgCard: '#161b22',
  bgHover: '#1c2128',
  bgInput: '#0d1117',
  border: '#30363d',
  borderLight: '#21262d',
  text: '#e6edf3',
  textSecondary: '#8b949e',
  textMuted: '#484f58',
  accent: '#58a6ff',
  accentHover: '#79c0ff',
  green: '#3fb950',
  greenBg: '#0d2818',
  yellow: '#d29922',
  yellowBg: '#2e1f00',
  red: '#f85149',
  redBg: '#3d1214',
  sidebar: '#010409',
  sidebarHover: '#161b22',
  header: '#161b22',
  headerBorder: '#30363d',
  scoreBgGreen: '#238636',
  scoreBgYellow: '#9e6a03',
  scoreBgRed: '#da3633',
  badge: '#30363d',
  badgeText: '#8b949e',
  shadow: 'rgba(0, 0, 0, 0.3)',
};

export const C_LIGHT = {
  bg: '#ffffff',
  bgCard: '#f6f8fa',
  bgHover: '#eef1f5',
  bgInput: '#ffffff',
  border: '#d0d7de',
  borderLight: '#e1e4e8',
  text: '#1f2328',
  textSecondary: '#656d76',
  textMuted: '#8b949e',
  accent: '#0969da',
  accentHover: '#0550ae',
  green: '#1a7f37',
  greenBg: '#dafbe1',
  yellow: '#9a6700',
  yellowBg: '#fff8c5',
  red: '#cf222e',
  redBg: '#ffebe9',
  sidebar: '#f6f8fa',
  sidebarHover: '#eef1f5',
  header: '#f6f8fa',
  headerBorder: '#d0d7de',
  scoreBgGreen: '#2da44e',
  scoreBgYellow: '#bf8700',
  scoreBgRed: '#cf222e',
  badge: '#e1e4e8',
  badgeText: '#656d76',
  shadow: 'rgba(0, 0, 0, 0.1)',
};

// Mutable palette object — components read from this
export const C = { ...C_DARK };

export function applyTheme(isDark) {
  const source = isDark ? C_DARK : C_LIGHT;
  Object.assign(C, source);
}
