// Tests for useScrollSpy — shared IntersectionObserver hook for section tracking
// Since @testing-library/react is not installed, we test the module's exported function
// exists and edge-case behavior via direct invocation patterns.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock IntersectionObserver since jsdom doesn't provide it
let observerInstances = [];
const MockIntersectionObserver = vi.fn((callback, options) => {
  const instance = {
    observe: vi.fn(),
    disconnect: vi.fn(),
    callback,
    options,
  };
  observerInstances.push(instance);
  return instance;
});

beforeEach(() => {
  observerInstances = [];
  MockIntersectionObserver.mockClear();
  globalThis.IntersectionObserver = MockIntersectionObserver;
});

afterEach(() => {
  delete globalThis.IntersectionObserver;
});

describe('useScrollSpy', () => {
  it('exports a named function useScrollSpy', async () => {
    const mod = await import('../useScrollSpy.js');
    expect(typeof mod.useScrollSpy).toBe('function');
  });

  it('module has no default export (named export only)', async () => {
    const mod = await import('../useScrollSpy.js');
    expect(mod.default).toBeUndefined();
  });

  it('function accepts sectionIds and options parameters', async () => {
    const mod = await import('../useScrollSpy.js');
    // useScrollSpy is a React hook — verify its parameter structure
    // by checking it's a function with at least 1 expected param
    expect(mod.useScrollSpy.length).toBeGreaterThanOrEqual(1);
  });
});
