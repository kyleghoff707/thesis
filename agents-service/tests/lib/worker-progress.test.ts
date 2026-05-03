import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('../../src/lib/env.js', () => ({
  loadEnv: () => ({
    WORKER_CALLBACK_URL: 'https://api.thes1sinvesting.com',
    WORKER_CALLBACK_SECRET: 'test-secret',
  }),
}));

const { ProgressPublisher } = await import('../../src/lib/worker-progress.js');

describe('ProgressPublisher', () => {
  beforeEach(() => mockFetch.mockReset());

  it('POSTs heartbeat with the correct shape and secret', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const pub = new ProgressPublisher('run-1', 'one-pager');
    await pub.heartbeat();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.thes1sinvesting.com/api/v3/pipeline/progress');
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-Callback-Secret']).toBe('test-secret');
    expect(JSON.parse(opts.body)).toEqual({ runId: 'run-1', kind: 'heartbeat' });
  });

  it('POSTs agent-update with merged payload', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const pub = new ProgressPublisher('run-1', 'one-pager');
    await pub.setStatus('running', { displayName: 'One Pager', startedAt: '2026-05-02T15:00:00Z' });

    const [, opts] = mockFetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({
      runId: 'run-1',
      kind: 'agent-update',
      payload: {
        agentId: 'one-pager',
        displayName: 'One Pager',
        status: 'running',
        startedAt: '2026-05-02T15:00:00Z',
      },
    });
  });

  it('swallows fetch errors so progress publishing never fails the agent', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    const pub = new ProgressPublisher('run-1', 'one-pager');
    await expect(pub.heartbeat()).resolves.toBeUndefined();  // no throw
  });
});
