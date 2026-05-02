import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Candidate roots in priority order.
//   Dev (tsx from src/agents/):   ../../../agents-v2  → repo-root/agents-v2
//   Prod (Docker from dist/agents): ../../agents-v2     → /app/agents-v2
const CANDIDATE_ROOTS = [
  resolve(__dirname, '../../../agents-v2'),
  resolve(__dirname, '../../agents-v2'),
];

const cache = new Map<string, string>();

async function findPromptPath(agentName: string): Promise<string> {
  for (const root of CANDIDATE_ROOTS) {
    const candidate = resolve(root, agentName, 'prompt.md');
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(`Prompt not found for agent "${agentName}". Tried: ${CANDIDATE_ROOTS.map(r => resolve(r, agentName, 'prompt.md')).join(', ')}`);
}

export async function loadAgentPrompt(agentName: string): Promise<string> {
  if (cache.has(agentName)) return cache.get(agentName)!;

  const path = await findPromptPath(agentName);
  const content = await readFile(path, 'utf-8');

  if (!content.trim()) {
    throw new Error(`Empty prompt at ${path}`);
  }
  cache.set(agentName, content);
  return content;
}
