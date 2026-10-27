'use strict';

const { summarize, perTask } = require('./stats');

const pct = n => `${Math.round(n * 100)}%`;
const k = n => `${(n / 1000).toFixed(0)}k`;

/**
 * Markdown report for a results folder.
 *
 * @param {Array<Record<string, any>>} runs - runs.jsonl records
 * @param {{ conditions: string[], tasks: string[], env: Record<string, any> }} meta
 * @returns {{ markdown: string, summary: ReturnType<typeof summarize> }}
 */
function renderReport(runs, meta) {
  const summary = summarize(runs, meta.conditions);
  const lines = [
    '# RepoCanon benchmark results',
    '',
    `${runs.length} runs · ${meta.tasks.length} tasks · model \`${meta.env.model || 'unknown'}\` · Claude Code ${meta.env.cli || '?'} · ${meta.env.date}`,
    '',
    '| Condition | Tasks passed | 95% CI | Rule checks passed | Opened docs / rc_* | Median tokens (IQR) | Mean cost | Median turns | Median time |',
    '|---|---|---|---|---|---|---|---|---|',
    ...summary.map(s => `| ${s.condition} | ${s.passes}/${s.runs} (${pct(s.passRate.rate)}) | ${pct(s.passRate.low)}–${pct(s.passRate.high)} | ${pct(s.ruleAdherence)} | ${s.condition === 'none' ? '—' : pct(s.usedKnowledge)} | ${k(s.medianTokens)} (${k(s.iqrTokens[0])}–${k(s.iqrTokens[1])}) | $${s.meanCostUsd.toFixed(3)} | ${s.medianTurns} | ${Math.round(s.medianSeconds)} s |`),
    '',
    '## Per task (passed / runs)',
    '',
    `| Task | ${meta.conditions.join(' | ')} |`,
    `|---|${meta.conditions.map(() => '---').join('|')}|`,
    ...perTask(runs, meta.tasks, meta.conditions).map(row => `| ${row.task} | ${meta.conditions.map(c => row.cells[c]).join(' | ')} |`),
    '',
    'A task passes when the hidden tests and every rule check pass. "Opened docs / rc_*" counts runs that read AGENTS.md, CLAUDE.md, an .ai/ doc or a skill, or called a RepoCanon MCP tool (content imported into context by CLAUDE.md is not a read). Tokens include cache reads and writes.',
    ''
  ];
  return { markdown: lines.join('\n'), summary };
}

module.exports = { renderReport };
