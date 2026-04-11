import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePipeline } from '../src/pipeline/routes.js';

// Mock D1 database
function createMockDB(overrides = {}) {
  const defaultFirst = null;
  const defaultAll = { results: [] };

  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(overrides.first ?? defaultFirst),
        all: vi.fn().mockResolvedValue(overrides.all ?? defaultAll),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  };
}

function createMockEnv(dbOverrides = {}) {
  return {
    DB: createMockDB(dbOverrides),
    PIPELINE_RUNNER: {
      idFromName: vi.fn().mockReturnValue('mock-do-id'),
      get: vi.fn().mockReturnValue({
        fetch: vi.fn().mockResolvedValue(new Response('ok')),
      }),
    },
  };
}

function mockRequest(method, path, body) {
  return {
    method,
    json: body ? vi.fn().mockResolvedValue(body) : vi.fn().mockRejectedValue(new Error('no body')),
    headers: new Headers(),
  };
}

const mockUser = { id: 'user-123', email: 'test@test.com', role: 'admin' };

describe('Pipeline Routes', () => {
  describe('POST /api/pipeline/run', () => {
    it('returns 400 for missing ticker', async () => {
      const env = createMockEnv();
      const req = mockRequest('POST', '/api/pipeline/run', { stage: 'onePager' });
      const res = await handlePipeline(req, env, '/api/pipeline/run', mockUser);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('ticker');
    });

    it('returns 400 for invalid stage', async () => {
      const env = createMockEnv();
      const req = mockRequest('POST', '/api/pipeline/run', { ticker: 'AAPL', stage: 'invalid' });
      const res = await handlePipeline(req, env, '/api/pipeline/run', mockUser);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('stage must be');
    });

    it('returns 409 if pipeline already running', async () => {
      const env = createMockEnv({
        first: {
          id: 'run-1',
          ticker: 'AAPL',
          stage: 'pitchDeck',
          status: 'running',
          updated_at: new Date().toISOString(), // recent, not stale
        },
      });
      const req = mockRequest('POST', '/api/pipeline/run', { ticker: 'AAPL', stage: 'onePager' });
      const res = await handlePipeline(req, env, '/api/pipeline/run', mockUser);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain('already running');
    });

    it('auto-marks stale running pipeline as failed and allows new run', async () => {
      const staleTime = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min ago
      const env = createMockEnv({
        first: {
          id: 'stale-run',
          ticker: 'MSFT',
          stage: 'pitchDeck',
          status: 'running',
          updated_at: staleTime,
        },
      });
      const req = mockRequest('POST', '/api/pipeline/run', { ticker: 'AAPL', stage: 'onePager' });
      const res = await handlePipeline(req, env, '/api/pipeline/run', mockUser);
      // Should succeed (202) because stale run was auto-marked failed
      expect(res.status).toBe(202);
    });

    it('returns 202 with runId on success', async () => {
      const env = createMockEnv();
      const req = mockRequest('POST', '/api/pipeline/run', { ticker: 'AAPL', stage: 'onePager' });
      const res = await handlePipeline(req, env, '/api/pipeline/run', mockUser);
      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.runId).toBeDefined();
      expect(data.ticker).toBe('AAPL');
      expect(data.stage).toBe('onePager');
    });

    it('launches Durable Object on success', async () => {
      const env = createMockEnv();
      const req = mockRequest('POST', '/api/pipeline/run', { ticker: 'AAPL', stage: 'pitchDeck' });
      await handlePipeline(req, env, '/api/pipeline/run', mockUser);
      expect(env.PIPELINE_RUNNER.idFromName).toHaveBeenCalled();
      expect(env.PIPELINE_RUNNER.get).toHaveBeenCalled();
    });
  });

  describe('GET /api/pipeline/status/:runId', () => {
    it('returns 404 for unknown runId', async () => {
      const env = createMockEnv({ first: null });
      const req = mockRequest('GET', '/api/pipeline/status/unknown-id');
      const res = await handlePipeline(req, env, '/api/pipeline/status/unknown-id', mockUser);
      expect(res.status).toBe(404);
    });

    it('returns progress for valid runId', async () => {
      const env = createMockEnv({
        first: {
          id: 'run-1',
          ticker: 'AAPL',
          stage: 'pitchDeck',
          status: 'running',
          current_wave: 2,
          total_waves: 4,
          progress: JSON.stringify({ wave: 2, status: 'wave_complete' }),
          error: null,
          budget_json: null,
          started_at: '2026-04-11T00:00:00Z',
          completed_at: null,
          updated_at: new Date().toISOString(),
          created_at: '2026-04-11T00:00:00Z',
        },
      });
      const req = mockRequest('GET', '/api/pipeline/status/run-1');
      const res = await handlePipeline(req, env, '/api/pipeline/status/run-1', mockUser);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('running');
      expect(data.currentWave).toBe(2);
      expect(data.progress.wave).toBe(2);
    });

    it('auto-marks stale running pipeline as failed on status check', async () => {
      const staleTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const env = createMockEnv({
        first: {
          id: 'stale-run',
          ticker: 'AAPL',
          stage: 'onePager',
          status: 'running',
          current_wave: 1,
          total_waves: 1,
          progress: null,
          error: null,
          budget_json: null,
          started_at: staleTime,
          completed_at: null,
          updated_at: staleTime,
          created_at: staleTime,
        },
      });
      const req = mockRequest('GET', '/api/pipeline/status/stale-run');
      const res = await handlePipeline(req, env, '/api/pipeline/status/stale-run', mockUser);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('failed');
      expect(data.error).toContain('no progress');
    });
  });

  describe('Route matching', () => {
    it('returns 404 for unknown paths', async () => {
      const env = createMockEnv();
      const req = mockRequest('GET', '/api/pipeline/unknown');
      const res = await handlePipeline(req, env, '/api/pipeline/unknown', mockUser);
      expect(res.status).toBe(404);
    });
  });
});
