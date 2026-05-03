import { loadEnv } from './env.js';

export interface AgentUpdatePayload {
  displayName?: string;
  wave?: number | null;
  startedAt?: string;
  finishedAt?: string;
  subprogress?: { current: number; total: number; label: string };
  lastMessage?: string;
  tokensInput?: number;
  tokensOutput?: number;
  cachedTokens?: number;
  errorMessage?: string;
}

export class ProgressPublisher {
  constructor(private runId: string, private agentId: string) {}

  async heartbeat(): Promise<void> {
    await this.post({ runId: this.runId, kind: 'heartbeat' });
  }

  async setStatus(
    status: 'pending' | 'running' | 'completed' | 'failed',
    extra: AgentUpdatePayload = {},
  ): Promise<void> {
    await this.post({
      runId: this.runId,
      kind: 'agent-update',
      payload: { agentId: this.agentId, status, ...extra },
    });
  }

  async setSubprogress(
    subprogress: { current: number; total: number; label: string },
    extra: AgentUpdatePayload = {},
  ): Promise<void> {
    await this.post({
      runId: this.runId,
      kind: 'agent-update',
      payload: { agentId: this.agentId, status: 'running', subprogress, ...extra },
    });
  }

  /** Run-level cumulative tokens + cost. Updates v3_runs, not v3_run_agents. */
  async setRunTokens(tokensInput: number, tokensOutput: number, costUsd: number): Promise<void> {
    await this.post({
      runId: this.runId,
      kind: 'tokens',
      payload: { tokensInput, tokensOutput, costUsd },
    });
  }

  async setPhase(phase: string, phaseLabel?: string): Promise<void> {
    await this.post({
      runId: this.runId,
      kind: 'phase-update',
      payload: { phase, phaseLabel },
    });
  }

  private async post(body: unknown): Promise<void> {
    const env = loadEnv();
    try {
      const res = await fetch(`${env.WORKER_CALLBACK_URL}/api/v3/pipeline/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Callback-Secret': env.WORKER_CALLBACK_SECRET,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn(`progress POST returned ${res.status}`, body);
      }
    } catch (err) {
      // Never let progress failures fail the agent run.
      console.warn('progress POST failed', err);
    }
  }
}
