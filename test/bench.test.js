'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const { wilson, quantile, summarize } = require('../bench/lib/stats');
const { parseResult, buildArgs } = require('../bench/lib/agent');
const { loadTasks, prepareRepo } = require('../bench/lib/tasks');
const { applyCondition, CONDITIONS } = require('../bench/lib/conditions');

test('bench stats: Wilson interval, quantiles, per-condition summary', () => {
  const ci = wilson(8, 10);
  assert.equal(ci.rate, 0.8);
  assert.ok(Math.abs(ci.low - 0.4902) < 0.001 && Math.abs(ci.high - 0.9433) < 0.001, JSON.stringify(ci));
  assert.deepEqual(wilson(0, 0), { rate: 0, low: 0, high: 0 });
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  const agent = (tokens, costUsd) => ({ totalTokens: tokens, costUsd, turns: 4, durationMs: 2000 });
  const [none] = summarize([
    { condition: 'none', task: 'a', pass: true, checks: [{ ok: true }, { ok: false }], agent: agent(100, 0.1) },
    { condition: 'none', task: 'b', pass: false, checks: [{ ok: false }], agent: agent(300, 0.3) }
  ], ['none']);
  assert.deepEqual([none.passes, none.runs, none.medianTokens, Math.round(none.ruleAdherence * 100), Number(none.meanCostUsd.toFixed(2))], [1, 2, 200, 33, 0.2]);
});

test('bench agent: isolation flags and defensive result parsing', () => {
  const args = buildArgs({ prompt: 'do it', model: 'sonnet', budgetUsd: 1.5, mcpConfigPath: '/tmp/m.json' });
  for (const flag of ['--strict-mcp-config', '--setting-sources', '--no-session-persistence', '--max-budget-usd']) assert.ok(args.includes(flag), flag);
  assert.equal(args[args.indexOf('--setting-sources') + 1], 'project');

  const parsed = parseResult(JSON.stringify({
    type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.42, num_turns: 9, duration_ms: 61000, result: 'done',
    usage: { input_tokens: 10, output_tokens: 2000, cache_read_input_tokens: 50000, cache_creation_input_tokens: 8000 },
    modelUsage: { 'claude-haiku-x': { costUSD: 0.01 }, 'claude-sonnet-5-5': { costUSD: 0.41 } }
  }));
  assert.deepEqual([parsed.ok, parsed.costUsd, parsed.totalTokens, parsed.turns, parsed.model], [true, 0.42, 60010, 9, 'claude-sonnet-5-5']);
  assert.equal(parseResult('not json').ok, false);
  assert.equal(parseResult('').totalTokens, 0);
});

test('bench conditions: same fixture, only the knowledge differs', () => {
  const task = loadTasks().find(t => t.id === 'node-discounts');
  const has = (dir, file) => fs.existsSync(`${dir}/${file}`);
  const dirs = Object.fromEntries(CONDITIONS.map(condition => {
    const dir = prepareRepo(task, 'unit');
    return [condition, { dir, mcp: applyCondition(condition, dir, task).mcpConfig }];
  }));
  assert.deepEqual(['AGENTS.md', 'CLAUDE.md', '.ai'].map(f => has(dirs.none.dir, f)), [false, false, false]);
  assert.deepEqual(['AGENTS.md', 'CLAUDE.md', '.ai'].map(f => has(dirs['agents-md'].dir, f)), [true, true, false]);
  assert.deepEqual(['AGENTS.md', 'CLAUDE.md', '.ai/CONVENTIONS.md', '.claude/skills/rc-verify-change/SKILL.md'].map(f => has(dirs.repocanon.dir, f)), [true, true, true, true]);
  assert.equal(fs.readFileSync(`${dirs['agents-md'].dir}/CLAUDE.md`, 'utf8'), '@AGENTS.md\n');
  assert.deepEqual([dirs.none.mcp, dirs['agents-md'].mcp], [null, null]);
  assert.ok(dirs.repocanon.mcp.mcpServers.repocanon.args.includes(`--root=${dirs.repocanon.dir}`));
  assert.match(fs.readFileSync(`${dirs.repocanon.dir}/.ai/DECISIONS.md`, 'utf8'), /E_DISCOUNT_INVALID/);   // same facts as AGENTS.md
  for (const { dir } of Object.values(dirs)) fs.rmSync(dir, { recursive: true, force: true });
});
