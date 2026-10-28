'use strict';

const { summarize, perTask } = require('./stats');

const pct = n => `${Math.round(n * 100)}%`;
const k = n => `${(n / 1000).toFixed(0)}k`;

/**
 * Drift tasks only: whose value each condition's runs applied, the code's (right) or the
 * stale doc's (wrong). Empty when no run recorded it.
 *
 * @param {Array<Record<string, any>>} runs
 * @param {string[]} conditions
 * @returns {string[]}
 */
function renderFollowed(runs, conditions) {
  const drift = runs.filter(r => r.followed);
  if (!drift.length) return [];
  const count = (condition, source) => drift.filter(r => r.condition === condition && r.followed === source).length;
  return [
    '## Stale doc vs code (drift tasks)',
    '',
    'Each drift task changes one documented value in the code after the docs were verified. "Code" means the implementation applies the current value (right); "doc" means it applies the stale one.',
    '',
    '| Condition | Followed the code | Followed the stale doc | Neither | Fixed the stale doc |',
    '|---|---|---|---|---|',
    ...conditions
      .filter(c => drift.some(r => r.condition === c))
      .map(c => {
        const total = drift.filter(r => r.condition === c).length;
        const checked = drift.filter(r => r.condition === c && r.docFixed !== undefined);
        const fixed = checked.length ? `${checked.filter(r => r.docFixed).length}/${checked.length}` : '—';
        return `| ${c} | ${count(c, 'code')}/${total} | ${count(c, 'doc')}/${total} | ${count(c, 'neither')}/${total} | ${fixed} |`;
      }),
    ''
  ];
}

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
    ...renderFollowed(runs, meta.conditions),
    'A task passes when the hidden tests and every rule check pass. "Opened docs / rc_*" counts runs that read AGENTS.md, CLAUDE.md, an .ai/ doc or a skill, or called a RepoCanon MCP tool (content imported into context by CLAUDE.md is not a read). Tokens include cache reads and writes.',
    ''
  ];
  return { markdown: lines.join('\n'), summary };
}

module.exports = { renderReport };
