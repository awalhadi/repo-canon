'use strict';

/**
 * Runs Claude Code headless on one task and reads its usage from the JSON result.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ALLOWED_TOOLS = 'Read Edit Write Glob Grep Bash mcp__repocanon';

/**
 * Arguments for `claude -p`. Every condition gets the same ones; only --mcp-config differs.
 *
 * @param {{ prompt: string, model: string, budgetUsd: number, mcpConfigPath: string }} options
 * @returns {string[]}
 */
function buildArgs({ prompt, model, budgetUsd, mcpConfigPath }) {
  return [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--model', model,
    '--max-budget-usd', String(budgetUsd),
    '--permission-mode', 'acceptEdits',
    '--allowedTools', ALLOWED_TOOLS,
    '--setting-sources', 'project',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--mcp-config', mcpConfigPath
  ];
}

/**
 * Reads the fields the report needs from the final `result` event of
 * `claude -p --output-format stream-json`, tolerating missing ones (older CLIs, errors).
 *
 * @param {string} stdout
 * @returns {{ ok: boolean, costUsd: number, inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number, totalTokens: number, turns: number, durationMs: number, model: string|null, subtype: string|null, text: string }}
 */
function parseResult(stdout) {
  let data = {};
  for (const line of String(stdout || '').trim().split('\n').reverse()) {
    try {
      const event = JSON.parse(line);
      if (event && event.type === 'result') {
        data = event;
        break;
      }
    } catch {
      // Not JSON (a partial line from a killed run)
    }
  }
  const usage = data.usage || {};
  const num = value => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const inputTokens = num(usage.input_tokens);
  const outputTokens = num(usage.output_tokens);
  const cacheReadTokens = num(usage.cache_read_input_tokens);
  const cacheWriteTokens = num(usage.cache_creation_input_tokens);
  // Claude Code also uses a small model for background work: report the one that did the task
  const models = Object.entries(data.modelUsage || {})
    .sort(([, a], [, b]) => num(b && (b.costUSD || b.outputTokens)) - num(a && (a.costUSD || a.outputTokens)))
    .map(([name]) => name);
  return {
    ok: data.type === 'result' && !data.is_error,
    costUsd: num(data.total_cost_usd),
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    turns: num(data.num_turns),
    durationMs: num(data.duration_ms),
    model: models[0] || null,
    subtype: data.subtype || null,
    text: String(data.result || '').slice(0, 2000)
  };
}

/**
 * What the agent did: tool calls by name, and which knowledge it opened.
 *
 * @param {string} stdout - stream-json lines
 * @param {string} repoDir - to make read paths repo-relative
 * @returns {{ counts: Record<string, number>, knowledgeReads: string[], repocanonCalls: string[] }}
 */
function parseToolUse(stdout, repoDir = '') {
  const counts = {};
  const knowledgeReads = [];
  const repocanonCalls = [];
  for (const line of String(stdout || '').split('\n')) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const content = event && event.type === 'assistant' && event.message && Array.isArray(event.message.content) ? event.message.content : [];
    for (const block of content.filter(b => b && b.type === 'tool_use')) {
      counts[block.name] = (counts[block.name] || 0) + 1;
      if (block.name.startsWith('mcp__repocanon__')) repocanonCalls.push(block.name.replace('mcp__repocanon__', ''));
      const file = block.input && (block.input.file_path || block.input.path);
      if (block.name === 'Read' && typeof file === 'string') {
        const rel = repoDir && file.startsWith(repoDir) ? file.slice(repoDir.length + 1) : file;
        if (/^\.ai\/|(^|\/)(AGENTS|CLAUDE)\.md$|^\.claude\/skills\//.test(rel)) knowledgeReads.push(rel);
      }
    }
  }
  return { counts, knowledgeReads, repocanonCalls };
}

/**
 * Runs the agent in repoDir. Resolves even on failure, with ok: false.
 *
 * @param {{ repoDir: string, prompt: string, model: string, budgetUsd: number, mcpConfig: object|null, timeoutMs: number }} options
 * @returns {Promise<ReturnType<typeof parseResult> & { exitCode: number|null, timedOut: boolean, stderr: string }>}
 */
function runAgent({ repoDir, prompt, model, budgetUsd, mcpConfig, timeoutMs }) {
  const mcpConfigPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rc-bench-mcp-')), 'mcp.json');
  fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig || { mcpServers: {} }));
  return new Promise(resolve => {
    const child = cp.spawn('claude', buildArgs({ prompt, model, budgetUsd, mcpConfigPath }), { cwd: repoDir, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', exitCode => {
      clearTimeout(timer);
      fs.rmSync(path.dirname(mcpConfigPath), { recursive: true, force: true });
      resolve({ ...parseResult(stdout), tools: parseToolUse(stdout, repoDir), exitCode, timedOut, stderr: stderr.slice(-1000) });
    });
  });
}

module.exports = { buildArgs, parseResult, parseToolUse, runAgent, ALLOWED_TOOLS };
