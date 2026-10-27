'use strict';

const { getDocStatus } = require('../../services/status.service');
const { getFreshnessScore, formatScore } = require('../../services/score.service');
const { STATUS_ICONS, printJson, formatGithubAnnotation, wantsGithubFormat } = require('../formatters');

/**
 * Handles the `repocanon status` CLI command.
 */
function handleStatus(context) {
  const { root, isJson, isCi } = context;
  const rows = getDocStatus(root);
  const score = getFreshnessScore(root, rows);
  const badCount = rows.filter(r => r.state === 'stale' || r.state === 'broken').length;
  const unverifiedCount = rows.filter(r => r.state === 'unverified').length;

  if (isJson) {
    printJson({ docs: rows, score });
  } else if (wantsGithubFormat(context)) {
    for (const row of rows.filter(r => r.state === 'stale' || r.state === 'broken')) {
      const level = row.state === 'broken' ? 'error' : 'warn';
      console.log(formatGithubAnnotation(level, `${row.doc} is ${row.state}: ${row.detail}`, { file: row.doc, line: 1 }));
    }
    console.log(formatScore(score));
  } else {
    const maxDocLength = Math.max(...rows.map(r => r.doc.length), 10);
    for (const row of rows) {
      const icon = STATUS_ICONS[row.state] || '?';
      console.log(`${icon} ${row.doc.padEnd(maxDocLength)}  ${row.state.padEnd(10)} ${row.detail}`);
    }
    console.log(`\n${badCount} stale/broken, ${unverifiedCount} unverified · ${formatScore(score)}`);
  }

  if (isCi && badCount > 0) {
    process.exit(1);
  }
}

module.exports = {
  handleStatus
};
