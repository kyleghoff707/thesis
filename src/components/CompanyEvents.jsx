import { C } from '../theme';

// ─── Color mapping for left border accent ────────────────────

const ACCENT_COLORS = {
  earnings: () => C.accent,
  dividend: () => C.green,
  deal: () => C.yellow,
  contract: () => C.yellow,
  person: () => C.textMuted,
  vote: () => C.textMuted,
  info: () => C.textMuted,
  annual: () => C.textSecondary,
  quarterly: () => C.textSecondary,
  proxy: () => C.textSecondary,
};

function accentColor(icon) {
  return (ACCENT_COLORS[icon] || (() => C.textMuted))();
}

// ─── Date badge (calendar-style) ─────────────────────────────

function DateBadge({ dateStr }) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const year = d.getFullYear();

  return (
    <div style={{
      minWidth: 52,
      textAlign: 'center',
      padding: '6px 4px',
      flexShrink: 0,
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>{day}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: '0.03em' }}>{month}</div>
      <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.3 }}>{year}</div>
    </div>
  );
}

// ─── Single event row ────────────────────────────────────────

function EventRow({ event }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'stretch',
      borderBottom: `1px solid ${C.border}`,
      transition: 'background .1s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Left accent bar */}
      <div style={{
        width: 3,
        flexShrink: 0,
        background: event.isEstimate ? C.yellow : accentColor(event.icon),
        borderRadius: '3px 0 0 3px',
      }} />

      {/* Date badge */}
      <DateBadge dateStr={event.date} />

      {/* Event info */}
      <div style={{
        flex: 1,
        padding: '8px 10px 8px 6px',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{event.label}</span>
          {event.isEstimate && (
            <span style={{
              fontSize: 10,
              fontWeight: 500,
              color: C.yellow,
              background: `${C.yellowBg}`,
              padding: '1px 6px',
              borderRadius: 9,
              lineHeight: '16px',
            }}>estimate</span>
          )}
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              title="View filing"
              style={{ color: C.textMuted, textDecoration: 'none', fontSize: 12, marginLeft: 'auto', flexShrink: 0 }}
            >&#x2197;</a>
          )}
        </div>
        {event.description && (
          <div style={{
            fontSize: 11,
            color: C.textSecondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{event.description}</div>
        )}
        <div style={{ fontSize: 10, color: C.textMuted }}>{event.source}</div>
      </div>
    </div>
  );
}

// ─── Section header with optional link ───────────────────────

function SectionHeader({ label, linkText, linkUrl }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
      marginTop: 4,
    }}>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: C.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>{label}</span>
      {linkText && linkUrl && (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 12,
            color: C.accent,
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >{linkText} &#x2197;</a>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────

export default function CompanyEvents({ events, loading, error, ticker }) {
  if (loading) {
    return (
      <div style={{ color: C.textMuted, fontSize: 12, fontStyle: 'italic', padding: '8px 0' }}>
        Loading events...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: C.red, fontSize: 12, padding: '8px 0' }}>
        Failed to load events: {error}
      </div>
    );
  }

  if (!events) return null;

  const { upcoming, recent } = events;
  const hasUpcoming = upcoming && upcoming.length > 0;
  const hasRecent = recent && recent.length > 0;

  if (!hasUpcoming && !hasRecent) {
    return (
      <div style={{ color: C.textMuted, fontSize: 12, fontStyle: 'italic', padding: '8px 0' }}>
        No upcoming events or recent filings found.
      </div>
    );
  }
  const edgarLink = ticker
    ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ticker}&type=&dateb=&owner=include&count=40`
    : null;

  return (
    <div>
      {/* Upcoming section */}
      {hasUpcoming && (
        <div>
          <SectionHeader label="Upcoming" />
          <div style={{
            background: C.bgCard,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            {upcoming.map((event, i) => (
              <EventRow key={`${event.type}-${event.date}-${i}`} event={event} />
            ))}
          </div>
        </div>
      )}

      {/* Recent section */}
      {hasRecent && (
        <div style={{ marginTop: hasUpcoming ? 20 : 0 }}>
          <SectionHeader label="Recent (Last 90 Days)" linkText="SEC Filings" linkUrl={edgarLink} />
          <div style={{
            background: C.bgCard,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            {recent.map((event, i) => (
              <EventRow key={`${event.type}-${event.date}-${i}`} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
