// Deep dive engine — on-demand Claude API calls for "Tell me more" claim analysis.
// Returns { content, error } for all code paths; never throws.

import { CLAUDE_KEY } from './config';

const MAX_DEPTH = 3;

// Build the prompt for a deep dive request
function buildDeepDivePrompt(claim, sectionContext, ticker, previousDives, depth) {
  let prompt = `You are an investment research analyst. Expand on this notable claim with deeper analysis, evidence, and context.

Claim: ${claim.text}
Context: ${claim.context}
Company: ${ticker}
Section context: ${sectionContext}

Provide 2-3 paragraphs of deeper analysis.`;

  if (depth >= 2 && previousDives.length > 0) {
    prompt += `\n\nPrevious analysis:\n${previousDives.map(d => d.content).join('\n---\n')}\n\nGo deeper. Identify assumptions, find supporting/contradicting evidence, and explore implications not yet covered.`;
  }

  return prompt;
}

// Generate a deep dive analysis for a notable claim
export async function generateDeepDive({ claim, sectionContext, ticker, previousDives = [] }) {
  if (!CLAUDE_KEY) {
    return { content: null, error: 'Claude API key not configured.' };
  }

  if (previousDives.length >= MAX_DEPTH) {
    return { content: null, error: 'Maximum analysis depth reached.' };
  }

  const depth = previousDives.length + 1;
  const prompt = buildDeepDivePrompt(claim, sectionContext, ticker, previousDives, depth);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return { content: null, error: 'API error: ' + response.status };
    }

    const data = await response.json();
    return { content: data.content?.[0]?.text || '', error: null };
  } catch (err) {
    return { content: null, error: err.message };
  }
}

export const _testExports = { buildDeepDivePrompt };
