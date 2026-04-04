import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { C } from '../theme';
import { renderTextWithCitations } from './CitationTooltip.jsx';

// Escape special regex characters in a string
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

// Process react-markdown paragraph children to insert "Tell me more" links after notable claim sentences
export function processChildrenWithClaims(children, notableClaims, onDeepDiveClick) {
  if (!children || !notableClaims?.length) return children;

  return React.Children.map(children, child => {
    if (typeof child !== 'string') return child;

    const result = [];
    let remaining = child;
    let foundAny = false;

    for (let ci = 0; ci < notableClaims.length; ci++) {
      const claim = notableClaims[ci];
      const idx = remaining.toLowerCase().indexOf(claim.text.toLowerCase());
      if (idx === -1) continue;

      foundAny = true;
      // Find end of sentence containing the claim
      const afterClaim = idx + claim.text.length;
      let sentenceEnd = afterClaim;
      const sentenceEnders = /[.!?]/;
      for (let i = afterClaim; i < remaining.length; i++) {
        if (sentenceEnders.test(remaining[i])) {
          sentenceEnd = i + 1;
          break;
        }
        if (i === remaining.length - 1) {
          sentenceEnd = remaining.length;
        }
      }

      // Text before the sentence end
      result.push(remaining.slice(0, sentenceEnd));
      // "Tell me more" link
      const claimIndex = ci;
      result.push(
        React.createElement('span', {
          key: `claim-${ci}`,
          onClick: () => onDeepDiveClick(claimIndex),
          style: { color: C.accent, fontWeight: 700, fontSize: 13, cursor: 'pointer' },
          onMouseEnter: (e) => { e.target.style.textDecoration = 'underline'; },
          onMouseLeave: (e) => { e.target.style.textDecoration = 'none'; },
        }, ' Tell me more'),
      );
      remaining = remaining.slice(sentenceEnd);
    }

    if (!foundAny) return child;
    if (remaining) result.push(remaining);
    return result;
  });
}

// Process react-markdown paragraph children to add dashed-underline glossary term spans
// Density limited to maxPerParagraph terms per call
export function processChildrenWithGlossary(children, glossaryTerms, onGlossaryClick, maxPerParagraph = 3) {
  if (!children || !glossaryTerms?.length) return children;

  let matchCount = 0;

  return React.Children.map(children, child => {
    if (typeof child !== 'string') return child;
    if (matchCount >= maxPerParagraph) return child;

    const result = [];
    let remaining = child;

    for (const termObj of glossaryTerms) {
      if (matchCount >= maxPerParagraph) break;

      const regex = new RegExp('\\b' + escapeRegex(termObj.term) + '\\b', 'i');
      const match = remaining.match(regex);
      if (!match) continue;

      const idx = match.index;
      const matchedText = match[0];

      // Text before the match
      if (idx > 0) result.push(remaining.slice(0, idx));

      // Glossary term span with dashed underline
      const term = termObj;
      result.push(
        React.createElement('span', {
          key: `glossary-${matchCount}`,
          onClick: (e) => onGlossaryClick(term, e),
          style: {
            textDecoration: 'underline',
            textDecorationStyle: 'dashed',
            textUnderlineOffset: '3px',
            textDecorationColor: 'rgba(15, 118, 110, 0.4)',
            cursor: 'help',
          },
          onMouseEnter: (e) => {
            e.target.style.textDecorationColor = 'rgba(15, 118, 110, 0.8)';
            e.target.style.backgroundColor = C.accentLight;
          },
          onMouseLeave: (e) => {
            e.target.style.textDecorationColor = 'rgba(15, 118, 110, 0.4)';
            e.target.style.backgroundColor = '';
          },
        }, matchedText),
      );

      matchCount++;
      remaining = remaining.slice(idx + matchedText.length);
    }

    if (result.length === 0) return child;
    if (remaining) result.push(remaining);
    return result;
  });
}

// Build component overrides — called inside render to read current C palette values
// DO NOT memoize or hoist to module level (Pitfall 5: theme reactivity)
function makeComponents(citations, onCitationClick, notableClaims, onDeepDiveClick, glossaryTerms, onGlossaryClick) {
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
      let processed = children;
      if (citations?.length > 0) {
        processed = processChildrenWithCitations(processed, citations, onCitationClick);
      }
      if (notableClaims?.length > 0) {
        processed = processChildrenWithClaims(processed, notableClaims, onDeepDiveClick);
      }
      if (glossaryTerms?.length > 0) {
        processed = processChildrenWithGlossary(processed, glossaryTerms, onGlossaryClick, 3);
      }
      return <p style={{ margin: 0, marginBottom: 12, lineHeight: 1.7 }}>{processed}</p>;
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

export default function ReportMarkdown({ content, citations, onCitationClick, notableClaims, onDeepDiveClick, glossaryTerms, onGlossaryClick }) {
  if (!content) return null;
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={makeComponents(citations, onCitationClick, notableClaims, onDeepDiveClick, glossaryTerms, onGlossaryClick)}
    >
      {content}
    </Markdown>
  );
}
