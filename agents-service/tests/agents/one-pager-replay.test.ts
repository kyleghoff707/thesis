import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OnePagerOutputSchema } from '../../src/agents/schemas/one-pager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../fixtures/replay');

interface Fixture {
  id: string;
  description: string;
  input: { ticker: string };
  expectedShapeValid: boolean;
  output?: unknown;
}

const fixtureFiles = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));

describe('One Pager replay-trace fixtures', () => {
  if (fixtureFiles.length === 0) {
    it.skip('(no fixtures yet — add captured failures to tests/fixtures/replay/)', () => {});
    return;
  }

  for (const file of fixtureFiles) {
    const fixture: Fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8'));

    it(`replay: ${fixture.id} — ${fixture.description}`, () => {
      const parsed = OnePagerOutputSchema.safeParse(fixture.output);
      expect(parsed.success).toBe(fixture.expectedShapeValid);
    });
  }
});
