import { describe, it, expect } from 'vitest';
import { _testExports } from '../DebateRenderer.jsx';

const { DATA_KEYS, getStrengthStyle, getSeverityStyle, getExchangeVerdictColor, DEFAULT_TAB } = _testExports;

describe('DebateRenderer: DATA_KEYS', () => {
  it('maps rebuttal tab to step3Rebuttal data key', () => {
    expect(DATA_KEYS.rebuttal).toBe('step3Rebuttal');
  });

  it('maps bull tab to step1Bull data key', () => {
    expect(DATA_KEYS.bull).toBe('step1Bull');
  });

  it('maps bear tab to step2Bear data key', () => {
    expect(DATA_KEYS.bear).toBe('step2Bear');
  });

  it('maps judge tab to step4Judge data key', () => {
    expect(DATA_KEYS.judge).toBe('step4Judge');
  });
});

describe('DebateRenderer: DEFAULT_TAB', () => {
  it('defaults to bull tab', () => {
    expect(DEFAULT_TAB).toBe('bull');
  });
});

describe('DebateRenderer: getStrengthStyle', () => {
  it('strong returns green background', () => {
    const style = getStrengthStyle('strong');
    expect(style).not.toBeNull();
    expect(style.label).toBe('STRONG');
    expect(style.text).toBe('#ffffff');
  });

  it('moderate returns yellow background', () => {
    const style = getStrengthStyle('moderate');
    expect(style).not.toBeNull();
    expect(style.label).toBe('MODERATE');
    expect(style.text).toBe('#ffffff');
  });

  it('weak returns red background', () => {
    const style = getStrengthStyle('weak');
    expect(style).not.toBeNull();
    expect(style.label).toBe('WEAK');
    expect(style.text).toBe('#ffffff');
  });

  it('unknown strength returns fallback style', () => {
    const style = getStrengthStyle('unknown_value');
    expect(style).not.toBeNull();
    expect(style.label).toBe('UNKNOWN_VALUE');
  });

  it('null returns fallback style', () => {
    const style = getStrengthStyle(null);
    expect(style).not.toBeNull();
  });
});

describe('DebateRenderer: getSeverityStyle', () => {
  it('thesis_killer returns red background with THESIS KILLER label', () => {
    const style = getSeverityStyle('thesis_killer');
    expect(style).not.toBeNull();
    expect(style.label).toBe('THESIS KILLER');
    expect(style.text).toBe('#ffffff');
  });

  it('significant returns yellow background with SIGNIFICANT label', () => {
    const style = getSeverityStyle('significant');
    expect(style).not.toBeNull();
    expect(style.label).toBe('SIGNIFICANT');
    expect(style.text).toBe('#ffffff');
  });

  it('unknown severity returns fallback with uppercased label', () => {
    const style = getSeverityStyle('minor');
    expect(style).not.toBeNull();
    expect(style.label).toBe('MINOR');
  });
});

describe('DebateRenderer: getExchangeVerdictColor', () => {
  it('Resolved returns green-family color', () => {
    const color = getExchangeVerdictColor('Resolved');
    expect(color).toMatch(/#16a34a|#4ade80/);
  });

  it('Strong Bull returns green-family color', () => {
    const color = getExchangeVerdictColor('Strong Bull');
    expect(color).toMatch(/#16a34a|#4ade80/);
  });

  it('Unresolved returns yellow-family color', () => {
    const color = getExchangeVerdictColor('Unresolved');
    expect(color).toMatch(/#ca8a04|#fbbf24/);
  });

  it('Strong Bear returns red-family color', () => {
    const color = getExchangeVerdictColor('Strong Bear');
    expect(color).toMatch(/#dc2626|#f87171/);
  });

  it('unknown verdict returns muted fallback', () => {
    const color = getExchangeVerdictColor('Something Else');
    expect(color).toBeTruthy();
  });
});
