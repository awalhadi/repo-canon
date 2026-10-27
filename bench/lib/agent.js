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
    '--output-format', 'json',
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
 * Reads the fields the report needs from `claude -p --output-format json`, tolerating
 * missing ones (older CLIs, errors).
 *
 * @param {string} stdout
 * @returns {{ ok: boolean, costUsd: number, inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number, totalTokens: number, turns: number, durationMs: number, model: string|null, subtype: string|null, text: string }}
 */
function parseResult(stdout) {
  let data = {};
  try {
    const lines = String(stdout || '').trim().split('\n');
    data = JSON.parse(lines[lines.length - 1] || '{}');
  } catch {
    data = {};
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
      resolve({ ...parseResult(stdout), exitCode, timedOut, stderr: stderr.slice(-1000) });
    });
  });
}

module.exports = { buildArgs, parseResult, runAgent, ALLOWED_TOOLS };
