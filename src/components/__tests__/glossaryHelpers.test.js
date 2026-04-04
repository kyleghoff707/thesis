// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { processChildrenWithGlossary } from '../ReportMarkdown.jsx';

describe('processChildrenWithGlossary', () => {
  const mockOnClick = vi.fn();

  it('returns children unchanged when glossaryTerms is empty', () => {
    const children = ['This is a test sentence about revenue growth.'];
    const result = processChildrenWithGlossary(children, [], mockOnClick, 3);
    // React.Children.map wraps to an array
    expect(result).toEqual(children);
  });

  it('wraps matching term text in array with React elements', () => {
    const children = ['The same-store sales metric improved significantly.'];
    const terms = [
      { term: 'same-store sales', category: 'Retail KPI', definition: 'Revenue from stores open >1yr' },
    ];

    const result = processChildrenWithGlossary(children, terms, mockOnClick, 3);

    // Result should be an array with: [before-text, span-element, after-text]
    // Flattened from React.Children.map
    expect(Array.isArray(result)).toBe(true);
    // Should contain a React element (the glossary span)
    const flattened = result.flat();
    const hasReactElement = flattened.some(item => React.isValidElement(item));
    expect(hasReactElement).toBe(true);
  });

  it('limits to maxPerParagraph=3 terms per call (4th term not wrapped)', () => {
    const children = ['The ROIC and ROE and BVPS and EPS are all important metrics.'];
    const terms = [
      { term: 'ROIC', category: 'Return', definition: 'Return on invested capital' },
      { term: 'ROE', category: 'Return', definition: 'Return on equity' },
      { term: 'BVPS', category: 'Value', definition: 'Book value per share' },
      { term: 'EPS', category: 'Value', definition: 'Earnings per share' },
    ];

    const result = processChildrenWithGlossary(children, terms, mockOnClick, 3);

    // Count React elements in the flattened result
    const flattened = result.flat();
    const reactElements = flattened.filter(item => React.isValidElement(item));
    // Should only have 3 wrapped terms (4th exceeds maxPerParagraph)
    expect(reactElements.length).toBe(3);
  });

  it('handles case-insensitive matching', () => {
    const children = ['The Same-Store Sales growth was impressive.'];
    const terms = [
      { term: 'same-store sales', category: 'Retail KPI', definition: 'Revenue comparison' },
    ];

    const result = processChildrenWithGlossary(children, terms, mockOnClick, 3);

    const flattened = result.flat();
    const reactElements = flattened.filter(item => React.isValidElement(item));
    expect(reactElements.length).toBe(1);
    // The rendered text should preserve original case
    expect(reactElements[0].props.children).toBe('Same-Store Sales');
  });

  it('passes non-string children through unchanged', () => {
    const spanElement = React.createElement('span', null, 'existing element');
    const children = [spanElement, 'Some text with ROIC in it.'];
    const terms = [
      { term: 'ROIC', category: 'Return', definition: 'Return on invested capital' },
    ];

    const result = processChildrenWithGlossary(children, terms, mockOnClick, 3);

    // First child should be a span with the same content (React.Children.map preserves element type)
    expect(result[0].type).toBe('span');
    expect(result[0].props.children).toBe('existing element');
  });
});
