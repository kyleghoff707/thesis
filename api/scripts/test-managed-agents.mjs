#!/usr/bin/env node
// Test script for validating the Managed Agents API surface.
// Verifies request/response shapes before deploying the pipeline.
//
// Usage: ANTHROPIC_API_KEY=sk-... node api/scripts/test-managed-agents.mjs
//
// Tests:
// 1. Agent creation (POST /v1/agents)
// 2. Session creation (POST /v1/sessions)
// 3. Send user message (POST /v1/sessions/{id}/events)
// 4. Poll events — verify custom tool use event shape
// 5. Send tool result — verify session resumes
// 6. Poll for terminal event — verify completion

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERROR: Set ANTHROPIC_API_KEY environment variable');
  process.exit(1);
}

const API = 'https://api.anthropic.com';
const BETA = 'managed-agents-2026-04-01';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-beta': BETA,
};

let agentId = null;
let sessionId = null;
const results = [];

function log(label, status, detail) {
  const icon = status === 'PASS' ? '\x1b[32m✓\x1b[0m' : status === 'FAIL' ? '\x1b[31m✗\x1b[0m' : '\x1b[33m?\x1b[0m';
  console.log(`  ${icon} ${label}${detail ? ': ' + detail : ''}`);
  results.push({ label, status, detail });
}

function checkFields(obj, fields, context) {
  const missing = fields.filter(f => !(f in obj));
  if (missing.length > 0) {
    log(`${context} — missing fields`, 'FAIL', missing.join(', '));
    return false;
  }
  log(`${context} — all fields present`, 'PASS', fields.join(', '));
  return true;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('\nManaged Agents API Validation\n');

  // ── 1. Create agent ──
  console.log('1. Agent creation (POST /v1/agents)');
  try {
    const res = await fetch(`${API}/v1/agents`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        name: 'thes1s-test-agent',
        description: 'API shape validation test',
        model: 'claude-sonnet-4-6',
        system: 'You are a test agent. When asked to greet, call the greet tool with the name provided.',
        custom_tools: [{
          name: 'greet',
          description: 'Generate a greeting for a person',
          input_schema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      log('Agent creation', 'FAIL', `${res.status} ${body.slice(0, 200)}`);
      console.log('\n  Response headers:');
      for (const [k, v] of res.headers) console.log(`    ${k}: ${v}`);
      return;
    }

    const agent = await res.json();
    log('Agent creation', 'PASS', `status ${res.status}`);
    checkFields(agent, ['id'], 'Agent response shape');

    // Try common field names
    agentId = agent.id || agent.agent_id;
    console.log(`  Agent ID: ${agentId}`);
    console.log(`  Full response keys: ${Object.keys(agent).join(', ')}`);
  } catch (err) {
    log('Agent creation', 'FAIL', err.message);
    return;
  }

  // ── 2. Create session ──
  console.log('\n2. Session creation (POST /v1/sessions)');
  try {
    const res = await fetch(`${API}/v1/sessions`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ agent_id: agentId }),
    });

    if (!res.ok) {
      const body = await res.text();
      log('Session creation', 'FAIL', `${res.status} ${body.slice(0, 200)}`);
      return;
    }

    const session = await res.json();
    log('Session creation', 'PASS', `status ${res.status}`);
    checkFields(session, ['id'], 'Session response shape');

    sessionId = session.id || session.session_id;
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Full response keys: ${Object.keys(session).join(', ')}`);
  } catch (err) {
    log('Session creation', 'FAIL', err.message);
    return;
  }

  // ── 3. Send user message ──
  console.log('\n3. Send user message (POST /v1/sessions/{id}/events)');
  try {
    const res = await fetch(`${API}/v1/sessions/${sessionId}/events`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        type: 'user.message',
        content: 'Please greet the name "TestUser".',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      log('Send message', 'FAIL', `${res.status} ${body.slice(0, 200)}`);

      // Try alternative event format
      console.log('  Trying alternative event format...');
      const res2 = await fetch(`${API}/v1/sessions/${sessionId}/events`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
          role: 'user',
          content: 'Please greet the name "TestUser".',
        }),
      });
      if (res2.ok) {
        log('Send message (alt format)', 'PASS', `status ${res2.status}`);
        const altResp = await res2.json();
        console.log(`  Alt response keys: ${Object.keys(altResp).join(', ')}`);
      } else {
        const body2 = await res2.text();
        log('Send message (alt format)', 'FAIL', `${res2.status} ${body2.slice(0, 200)}`);
      }
    } else {
      log('Send message', 'PASS', `status ${res.status}`);
      const sendResp = await res.json();
      console.log(`  Response keys: ${Object.keys(sendResp).join(', ')}`);
    }
  } catch (err) {
    log('Send message', 'FAIL', err.message);
  }

  // ── 4. Poll for events (expect custom tool use) ──
  console.log('\n4. Poll events (GET /v1/sessions/{id}/events)');
  let toolUseEvent = null;
  const maxPolls = 15;

  for (let i = 0; i < maxPolls; i++) {
    await sleep(2000);
    try {
      const res = await fetch(`${API}/v1/sessions/${sessionId}/events`, {
        headers: { ...HEADERS, 'Content-Type': undefined },
      });

      if (!res.ok) {
        const body = await res.text();
        log(`Poll attempt ${i + 1}`, 'FAIL', `${res.status} ${body.slice(0, 100)}`);
        continue;
      }

      const data = await res.json();
      const events = data.events || data.data || (Array.isArray(data) ? data : []);

      if (i === 0) {
        console.log(`  Events response keys: ${Object.keys(data).join(', ')}`);
        console.log(`  Events array key: ${data.events ? 'events' : data.data ? 'data' : 'root array'}`);
      }

      if (events.length > 0) {
        console.log(`  Poll ${i + 1}: ${events.length} events`);
        for (const e of events) {
          const type = e.type || e.event || 'unknown';
          console.log(`    Event type: "${type}" | keys: ${Object.keys(e).join(', ')}`);

          if (type === 'agent.custom_tool_use' || type === 'tool_use' || type === 'content_block_start') {
            toolUseEvent = e;
            log('Custom tool use event found', 'PASS', `type="${type}"`);

            // Validate tool use event shape
            const toolId = e.tool_use_id || e.id || e.content?.id;
            const toolName = e.name || e.content?.name;
            const toolInput = e.input || e.content?.input;
            console.log(`    tool_use_id: ${toolId}`);
            console.log(`    name: ${toolName}`);
            console.log(`    input: ${JSON.stringify(toolInput)}`);
            break;
          }
        }
      }

      if (toolUseEvent) break;
    } catch (err) {
      log(`Poll attempt ${i + 1}`, 'FAIL', err.message);
    }
  }

  if (!toolUseEvent) {
    log('Custom tool use detection', 'FAIL', `No tool_use event after ${maxPolls} polls`);
    return;
  }

  // ── 5. Send tool result ──
  console.log('\n5. Send tool result (POST /v1/sessions/{id}/events)');
  const toolUseId = toolUseEvent.tool_use_id || toolUseEvent.id || toolUseEvent.content?.id;
  try {
    const res = await fetch(`${API}/v1/sessions/${sessionId}/events`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        type: 'user.custom_tool_result',
        tool_use_id: toolUseId,
        content: JSON.stringify({ greeting: 'Hello, TestUser!' }),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      log('Send tool result', 'FAIL', `${res.status} ${body.slice(0, 200)}`);

      // Try alternative format
      const res2 = await fetch(`${API}/v1/sessions/${sessionId}/events`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: JSON.stringify({ greeting: 'Hello, TestUser!' }),
        }),
      });
      if (res2.ok) {
        log('Send tool result (alt format)', 'PASS', `status ${res2.status}`);
      } else {
        log('Send tool result (alt format)', 'FAIL', `${res2.status}`);
      }
    } else {
      log('Send tool result', 'PASS', `status ${res.status}`);
    }
  } catch (err) {
    log('Send tool result', 'FAIL', err.message);
  }

  // ── 6. Poll for terminal event ──
  console.log('\n6. Poll for session completion');
  let completed = false;
  const terminalTypes = new Set([
    'session.turn_complete', 'session.end', 'agent.turn_complete',
    'turn_complete', 'end', 'done',
  ]);

  for (let i = 0; i < maxPolls; i++) {
    await sleep(2000);
    try {
      const res = await fetch(`${API}/v1/sessions/${sessionId}/events`, {
        headers: { ...HEADERS, 'Content-Type': undefined },
      });
      if (!res.ok) continue;

      const data = await res.json();
      const events = data.events || data.data || (Array.isArray(data) ? data : []);

      for (const e of events) {
        const type = e.type || e.event || '';
        if (terminalTypes.has(type) || e.stop_reason) {
          log('Terminal event found', 'PASS', `type="${type}" stop_reason="${e.stop_reason || 'none'}"`);
          completed = true;

          // Check for usage metadata
          if (e.usage) {
            log('Usage metadata in terminal event', 'PASS', JSON.stringify(e.usage));
          } else {
            log('Usage metadata in terminal event', 'INFO', 'Not present — coordinator cost tracking will need alternative');
          }
          break;
        }
      }
      if (completed) break;
    } catch {}
  }

  if (!completed) {
    log('Session completion', 'FAIL', `No terminal event after ${maxPolls} polls`);
  }

  // ── Summary ──
  console.log('\n' + '='.repeat(50));
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const info = results.filter(r => r.status === 'INFO').length;
  console.log(`Results: ${passed} passed, ${failed} failed, ${info} info`);

  if (failed > 0) {
    console.log('\nFailed checks:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`  ✗ ${r.label}: ${r.detail}`);
    }
    process.exit(1);
  } else {
    console.log('\nAll checks passed. API surface matches expectations.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
