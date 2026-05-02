import { useState } from 'react';
import { C } from '../theme';
import PromiseStatusBadge from './PromiseStatusBadge.jsx';

// Status values may be free-form ("KEPT (2 years early)", "BROKEN (89%, abandoned silently)").
// Extract the leading enum word so counts and badges match.
export function normalizePromiseStatus(raw) {
  if (!raw) return 'PENDING';
  const word = String(raw).trim().split(/[\s(]/)[0].toUpperCase();
  return ['KEPT', 'PARTIAL', 'BROKEN', 'PENDING'].includes(word) ? word : 'PENDING';
}

// Compute proportional bar segments from promise status counts
function computePromiseBarSegments(promises) {
  if (!promises || !promises.length) return [];
  const counts = { KEPT: 0, PARTIAL: 0, BROKEN: 0, PENDING: 0 };
  for (const p of promises) {
    counts[normalizePromiseStatus(p.status)]++;
  }
  const segments = [];
  if (counts.KEPT > 0) segments.push({ flex: counts.KEPT, color: C.green, label: 'kept' });
  if (counts.PARTIAL > 0) segments.push({ flex: counts.PARTIAL, color: C.yellow, label: 'partial' });
  if (counts.BROKEN > 0) segments.push({ flex: counts.BROKEN, color: C.red, label: 'broken' });
  if (counts.PENDING > 0) segments.push({ flex: counts.PENDING, color: C.badge, label: 'pending' });
  return segments;
}

// Format promise counts as display text with middot separators
function formatPromiseScoreText(promises) {
  if (!promises || !promises.length) return '';
  const counts = { KEPT: 0, PARTIAL: 0, BROKEN: 0, PENDING: 0 };
  for (const p of promises) {
    counts[normalizePromiseStatus(p.status)]++;
  }
  return `${counts.KEPT} KEPT \u00B7 ${counts.PARTIAL} PARTIAL \u00B7 ${counts.BROKEN} BROKEN`;
}

export default function PromiseTracker({ promises, sectionId }) {
  const [expanded, setExpanded] = useState(new Set());

  function toggle(i) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  // Empty state
  if (!promises || promises.length === 0) {
    return (
      <div
        id={sectionId}
        style={{
          border: '1px solid ' + C.border,
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 20,
          background: C.bgCard,
          boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04)',
          scrollMarginTop: 160,
        }}
      >
        {/* Section Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid ' + C.border,
          paddingBottom: 12,
          marginBottom: 16,
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: C.badge,
            color: C.badgeText,
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}>
            7
          </span>
          <span style={{
            fontSize: 16,
            fontWeight: 700,
            color: C.text,
            flex: 1,
          }}>
            Management Promise Tracker
          </span>
        </div>

        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.textMuted }}>No Promises Tracked</div>
          <div style={{ fontSize: 13, fontWeight: 400, color: C.textMuted, marginTop: 4 }}>
            Management promise data has not been generated for this report.
          </div>
        </div>
      </div>
    );
  }

  const segments = computePromiseBarSegments(promises);
  const scoreText = formatPromiseScoreText(promises);

  return (
    <div
      id={sectionId}
      style={{
        border: '1px solid ' + C.border,
        borderRadius: 8,
        padding: '16px 20px',
        marginBottom: 20,
        background: C.bgCard,
        boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04)',
        scrollMarginTop: 160,
      }}
    >
      {/* Section Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: '1px solid ' + C.border,
        paddingBottom: 12,
        marginBottom: 16,
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: C.badge,
          color: C.badgeText,
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
        }}>
          7
        </span>
        <span style={{
          fontSize: 16,
          fontWeight: 700,
          color: C.text,
          flex: 1,
        }}>
          Management Promise Tracker
        </span>
      </div>

      {/* Aggregate Bar */}
      {segments.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            display: 'flex',
            height: 8,
            borderRadius: 4,
            overflow: 'hidden',
            background: C.borderLight,
          }}>
            {segments.map((seg, i) => (
              <div key={i} style={{ flex: seg.flex, background: seg.color }} />
            ))}
          </div>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: C.textSecondary,
            marginTop: 8,
          }}>
            {scoreText}
          </div>
        </div>
      )}

      {/* Timeline Cards */}
      {promises.map((promise, i) => {
        const isExpanded = expanded.has(i);
        return (
          <div key={i} style={{
            border: '1px solid ' + C.borderLight,
            borderRadius: 6,
            padding: '8px 16px',
            marginBottom: 8,
          }}>
            {/* Row 1: quarter tag + category badge + status badge + chevron */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggle(i)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(i); } }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted }}>
                {promise.quarterYear || promise.period}
              </span>
              {promise.category && (
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  background: C.badge, color: C.badgeText,
                  padding: '2px 8px', borderRadius: 4,
                }}>
                  {promise.category}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <PromiseStatusBadge status={normalizePromiseStatus(promise.status)} />
              <span style={{
                fontSize: 11, color: C.textMuted,
                transition: 'transform 0.2s',
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}>
                {'\u25B6'}
              </span>
            </div>

            {/* Row 2: quote / promise text */}
            <div style={{
              fontSize: 13, fontWeight: 400, color: C.text,
              lineHeight: 1.7, fontStyle: 'italic',
              marginTop: 4,
            }}>
              &ldquo;{promise.quote || promise.promise}&rdquo;
            </div>

            {/* Expanded evidence \u2014 show status detail when only enum text is available */}
            {isExpanded && (promise.evidence || promise.status) && (
              <div style={{
                paddingLeft: 20, paddingTop: 8,
                fontSize: 13, color: C.textSecondary, lineHeight: 1.7,
              }}>
                {(promise.quote || promise.promise) && (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: C.textMuted, fontSize: 12 }}>What they said: </span>
                    {promise.quote || promise.promise}
                  </div>
                )}
                <div>
                  <span style={{ fontWeight: 700, color: C.textMuted, fontSize: 12 }}>What happened: </span>
                  {promise.evidence || promise.status}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const _testExports = { computePromiseBarSegments, formatPromiseScoreText };
