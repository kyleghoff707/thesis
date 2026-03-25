import { C } from '../theme';

export default function RedFlagCallout({ flags }) {
  if (!flags || flags.length === 0) return null;

  return (
    <div style={{
      background: C.yellowBg,
      border: '1px solid ' + C.yellow + '40',
      borderRadius: 8,
      padding: '12px 16px',
      marginTop: 16,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={C.yellow}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span style={{
          fontSize: 12,
          fontWeight: 700,
          color: C.yellow,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          Red Flags
        </span>
      </div>
      <ul style={{
        margin: '8px 0 0',
        paddingLeft: 20,
        listStyleType: 'disc',
      }}>
        {flags.map((flag, i) => (
          <li key={i} style={{
            fontSize: 13,
            color: C.text,
            lineHeight: 1.5,
            marginBottom: 4,
          }}>
            {flag}
          </li>
        ))}
      </ul>
    </div>
  );
}
