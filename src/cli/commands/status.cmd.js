'use strict';

const path = require('path');
const { getDocStatus } = require('../../services/status.service');
const { getFreshnessScore, formatScore } = require('../../services/score.service');
const { printJson, formatGithubAnnotation, wantsGithubFormat } = require('../formatters');

/**
 * Handles the `repocanon status` CLI command.
 */
function handleStatus(context) {
  const { root, isJson, isCi, ui } = context;
  const rows = getDocStatus(root);
  const score = getFreshnessScore(root, rows);
  const count = state => rows.filter(r => r.state === state).length;
  const badCount = count('stale') + count('broken');

  if (isJson) {
    printJson({ docs: rows, score });
  } else if (wantsGithubFormat(context)) {
    for (const row of rows.filter(r => r.state === 'stale' || r.state === 'broken')) {
      const level = row.state === 'broken' ? 'error' : 'warn';
      console.log(formatGithubAnnotation(level, `${row.doc} is ${row.state}: ${row.detail}`, { file: row.doc, line: 1 }));
    }
    console.log(formatScore(score));
  } else {
    const { c, symbol } = ui;
    const look = {
      fresh: [symbol.ok, c.green],
      stale: [symbol.warn, c.yellow],
      broken: [symbol.error, c.red],
      unverified: [symbol.info, c.cyan],
      unknown: [symbol.warn, c.yellow],
      'n/a': [symbol.same, c.dim]
    };
    ui.header('status', path.basename(root));
    if (!rows.length) {
      ui.row(symbol.warn, 'No .ai/ docs yet');
      ui.next([['npx repocanon init', 'create the knowledge layer']]);
      return;
    }
    ui.table(rows.map(row => {
      const [sym, tint] = look[row.state] || [symbol.same, c.dim];
      const label = row.state === 'fresh' && row.verifiedBy === 'agent' ? 'fresh (agent)' : row.state;
      return [sym, row.doc, tint(label), c.dim(row.detail)];
    }));
    ui.line('');
    ui.meter('Freshness', score.score);
    ui.verdict({
      errors: count('broken'),
      warnings: count('stale'),
      errorText: `${count('broken')} broken doc(s)`,
      warningText: `${count('stale')} stale doc(s)`,
      ok: 'Every doc matches the code',
      extra: [
        `${rows.length} docs`,
        count('unverified') ? `${count('unverified')} unverified` : '',
        score.agentVerified.length ? `${score.agentVerified.length} verified by an agent` : ''
      ].filter(Boolean).join(' · ')
    });
    ui.next([
      badCount && ['npx repocanon sync', 'what changed and which docs to update'],
      (count('unverified') || badCount) && ['npx repocanon stamp <doc>', 'after you re-checked a doc against the code'],
      !badCount && score.agentVerified.length && ['npx repocanon stamp <doc>', 'confirm a doc an agent verified']
    ]);
  }

  if (isCi && badCount > 0) {
    process.exit(1);
  }
}

module.exports = {
  handleStatus
};
