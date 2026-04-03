// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

// Helper: render component to a DOM container and return container
function renderToContainer(element) {
  const container = document.createElement('div');
  const root = createRoot(container);
  flushSync(() => root.render(element));
  return container;
}

describe('ReportMarkdown', () => {
  it('default export is a function', async () => {
    const mod = await import('../ReportMarkdown.jsx');
    expect(typeof mod.default).toBe('function');
  });

  it('returns null when content is null', async () => {
    const mod = await import('../ReportMarkdown.jsx');
    const ReportMarkdown = mod.default;
    const container = renderToContainer(React.createElement(ReportMarkdown, { content: null }));
    expect(container.innerHTML).toBe('');
  });

  it('returns null when content is undefined', async () => {
    const mod = await import('../ReportMarkdown.jsx');
    const ReportMarkdown = mod.default;
    const container = renderToContainer(React.createElement(ReportMarkdown, { content: undefined }));
    expect(container.innerHTML).toBe('');
  });

  it('returns null when content is empty string', async () => {
    const mod = await import('../ReportMarkdown.jsx');
    const ReportMarkdown = mod.default;
    const container = renderToContainer(React.createElement(ReportMarkdown, { content: '' }));
    expect(container.innerHTML).toBe('');
  });
});

describe('processChildrenWithCitations', () => {
  it('returns children unchanged when no citations provided', async () => {
    const mod = await import('../ReportMarkdown.jsx');
    const { processChildrenWithCitations } = mod;
    expect(processChildrenWithCitations('some text', null, null)).toBe('some text');
  });

  it('returns children unchanged when citations is empty array', async () => {
    const mod = await import('../ReportMarkdown.jsx');
    const { processChildrenWithCitations } = mod;
    expect(processChildrenWithCitations('some text', [], null)).toBe('some text');
  });

  it('returns string unchanged when no [N] pattern present', async () => {
    const mod = await import('../ReportMarkdown.jsx');
    const { processChildrenWithCitations } = mod;
    const citations = [{ id: 1, source: 'Test', text: 'test' }];
    // React.Children.map wraps single child in array, but content is preserved
    const result = processChildrenWithCitations('no markers here', citations, null);
    expect(result).toEqual(['no markers here']);
  });
});

describe('ReportMarkdown rendering', () => {
  it('renders ## Heading as a div with fontSize 16', async () => {
    const mod = await import('../ReportMarkdown.jsx');
    const ReportMarkdown = mod.default;
    const container = renderToContainer(React.createElement(ReportMarkdown, { content: '## Test Heading' }));
    const allDivs = container.querySelectorAll('div');
    const h2Div = Array.from(allDivs).find(d => d.style.fontSize === '16px');
    expect(h2Div).toBeTruthy();
    expect(h2Div.textContent).toBe('Test Heading');
  });

  it('renders **bold** as a strong element with fontWeight 600', async () => {
    const mod = await import('../ReportMarkdown.jsx');
    const ReportMarkdown = mod.default;
    const container = renderToContainer(React.createElement(ReportMarkdown, { content: 'This is **bold** text' }));
    const strong = container.querySelector('strong');
    expect(strong).toBeTruthy();
    expect(strong.style.fontWeight).toBe('600');
    expect(strong.textContent).toBe('bold');
  });
});
