import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { C } from '../theme';
import { renderTextWithCitations } from './CitationTooltip.jsx';

// Process react-markdown children to replace [N] patterns with CitationTooltip
// Exported for testing
export function processChildrenWithCitations(children, citations, onCitationClick) {
  if (!children || !citations?.length) return children;

  return React.Children.map(children, child => {
    if (typeof child !== 'string') return child;
    if (!/\[\d+\]/.test(child)) return child;
    return renderTextWithCitations(child, citations, onCitationClick);
  });
}

// Build component overrides — called inside render to read current C palette values
// DO NOT memoize or hoist to module level (Pitfall 5: theme reactivity)
function makeComponents(citations, onCitationClick) {
  return {
    h2: ({ children }) => (
      <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginTop: 20, marginBottom: 12 }}>
        {children}
      </div>
    ),
    h3: ({ children }) => (
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 16, marginBottom: 8 }}>
        {children}
      </div>
    ),
    p: ({ children }) => {
      if (citations?.length > 0) {
        return (
          <p style={{ margin: 0, marginBottom: 12, lineHeight: 1.7 }}>
            {processChildrenWithCitations(children, citations, onCitationClick)}
          </p>
        );
      }
      return <p style={{ margin: 0, marginBottom: 12, lineHeight: 1.7 }}>{children}</p>;
    },
    blockquote: ({ children }) => (
      <div style={{
        background: C.accentLight,
        borderLeft: '3px solid ' + C.accent,
        padding: '12px 16px',
        borderRadius: '0 8px 8px 0',
        marginBottom: 12,
      }}>
        {children}
      </div>
    ),
    ul: ({ children }) => (
      <div style={{ marginBottom: 12 }}>{children}</div>
    ),
    li: ({ children, node }) => {
      // Detect ordered vs unordered by checking parent node type
      const isOrdered = node?.parentNode?.tagName === 'ol' ||
        node?.properties?.className?.includes('ordered');
      if (isOrdered) {
        return (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
            <span style={{ flex: 1 }}>{children}</span>
          </div>
        );
      }
      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <span style={{
            display: 'inline-block', width: 6, height: 6,
            borderRadius: '50%', background: C.textMuted,
            marginTop: 7, flexShrink: 0,
          }} />
          <span style={{ flex: 1 }}>{children}</span>
        </div>
      );
    },
    ol: ({ children }) => (
      <div style={{ marginBottom: 12, counterReset: 'ol-counter' }}>{children}</div>
    ),
    strong: ({ children }) => (
      <strong style={{ fontWeight: 600 }}>{children}</strong>
    ),
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer"
        style={{ color: C.accent, textDecoration: 'underline' }}>
        {children}
      </a>
    ),
    table: ({ children }) => (
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        {children}
      </table>
    ),
    th: ({ children }) => (
      <th style={{
        padding: '8px 12px', borderBottom: '2px solid ' + C.border,
        fontSize: 12, fontWeight: 600, color: C.textMuted, textAlign: 'left',
      }}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td style={{
        padding: '8px 12px', borderBottom: '1px solid ' + C.borderLight,
        fontSize: 12, color: C.text,
      }}>
        {children}
      </td>
    ),
  };
}

export default function ReportMarkdown({ content, citations, onCitationClick }) {
  if (!content) return null;
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={makeComponents(citations, onCitationClick)}
    >
      {content}
    </Markdown>
  );
}
