'use strict';

/**
 * Wilson score interval for a pass rate.
 *
 * @param {number} passes
 * @param {number} n
 * @param {number} [z=1.96] - 95%
 * @returns {{ rate: number, low: number, high: number }}
 */
function wilson(passes, n, z = 1.96) {
  if (!n) return { rate: 0, low: 0, high: 0 };
  const p = passes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { rate: p, low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
}

/**
 * @param {number[]} values
 * @param {number} q - 0..1
 * @returns {number}
 */
function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

const median = values => quantile(values, 0.5);
const mean = values => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

/**
 * Per-condition summary of run records.
 *
 * @param {Array<{ condition: string, task: string, pass: boolean, checks: Array<{ ok: boolean }>, agent: { costUsd: number, totalTokens: number, turns: number, durationMs: number } }>} runs
 * @param {string[]} conditions - order to report in
 * @returns {Array<Record<string, any>>}
 */
function summarize(runs, conditions) {
  return conditions.map(condition => {
    const rows = runs.filter(r => r.condition === condition);
    const passes = rows.filter(r => r.pass).length;
    const checks = rows.flatMap(r => r.checks);
    const tokens = rows.map(r => r.agent.totalTokens);
    return {
      condition,
      runs: rows.length,
      passes,
      passRate: wilson(passes, rows.length),
      ruleAdherence: checks.length ? checks.filter(c => c.ok).length / checks.length : 0,
      medianTokens: median(tokens),
      iqrTokens: [quantile(tokens, 0.25), quantile(tokens, 0.75)],
      meanCostUsd: mean(rows.map(r => r.agent.costUsd)),
      totalCostUsd: rows.reduce((sum, r) => sum + r.agent.costUsd, 0),
      medianTurns: median(rows.map(r => r.agent.turns)),
      medianSeconds: median(rows.map(r => r.agent.durationMs / 1000))
    };
  });
}

/**
 * Pass count per task and condition.
 *
 * @param {Array<{ condition: string, task: string, pass: boolean }>} runs
 * @param {string[]} tasks
 * @param {string[]} conditions
 * @returns {Array<{ task: string, cells: Record<string, string> }>}
 */
function perTask(runs, tasks, conditions) {
  return tasks.map(task => ({
    task,
    cells: Object.fromEntries(conditions.map(condition => {
      const rows = runs.filter(r => r.task === task && r.condition === condition);
      return [condition, `${rows.filter(r => r.pass).length}/${rows.length}`];
    }))
  }));
}

module.exports = { wilson, quantile, median, mean, summarize, perTask };
