import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { C } from '../theme';
import VerdictBadge from './VerdictBadge';

// Minimal Full Story viewer shell — temporary until Phase 20 builds the full component
// with scroll spy, quality scores, checklist rendering, and debate display.

export default function FullStory({ getReport }) {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const report = getReport ? getReport(id) : null;
  const ticker = report?.ticker;

  useEffect(() => {
    if (!ticker) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchFullStory() {
      try {
        const res = await fetch(`/api/thes1s/reports/${encodeURIComponent(ticker)}/full-story`);
        if (cancelled) return;
        if (res.status === 404) {
          setData(null);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError(`Failed to load Full Story (${res.status})`);
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchFullStory();
    return () => { cancelled = true; };
  }, [ticker]);

  if (loading) {
    return (
      <div style={{ padding: 32, color: C.textSecondary, fontSize: 13 }}>
        Loading Full Story...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, color: C.danger, fontSize: 13 }}>
        Error: {error}
      </div>
    );
  }

  if (!data || !data.sections || data.sections.length === 0) {
    return (
      <div style={{ padding: 32, color: C.textSecondary, fontSize: 13 }}>
        No Full Story found for {ticker || 'this company'}. Generate one with the pipeline.
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 0', maxWidth: 900 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 20 }}>
        Full Story {ticker ? `- ${ticker}` : ''}
      </h2>

      {data.sections.map((section, idx) => (
        <div
          key={section.key || idx}
          style={{
            background: C.bgCard,
            border: '1px solid ' + C.border,
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              {idx + 1}. {section.title || section.key}
            </span>
            {section.verdict && <VerdictBadge verdict={section.verdict} />}
          </div>

          {section.narrative && (
            <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {section.narrative.length > 500
                ? section.narrative.slice(0, 500) + '...'
                : section.narrative}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
