import { describe, it, expect } from 'vitest';
import { loadAgentPrompt } from '../../src/agents/prompts.js';

describe('loadAgentPrompt', () => {
  it('loads the One Pager prompt and returns a non-empty string', async () => {
    const prompt = await loadAgentPrompt('one-pager');
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(1000);
    expect(prompt).toContain('Rule One');
  });

  it('throws on unknown agent name', async () => {
    await expect(loadAgentPrompt('does-not-exist')).rejects.toThrow();
  });
});
