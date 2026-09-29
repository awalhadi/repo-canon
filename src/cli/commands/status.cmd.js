'use strict';

const { getDocStatus } = require('../../services/status.service');
const { STATUS_ICONS, printJson } = require('../formatters');

/**
 * Handles the `contextforge status` CLI command.
 */
function handleStatus(context) {
  const { root, isJson, isCi } = context;
  const rows = getDocStatus(root);

  if (isJson) {
    printJson(rows);
    return;
  }

  const maxDocLength = Math.max(...rows.map(r => r.doc.length), 10);

  for (const row of rows) {
    const icon = STATUS_ICONS[row.state] || '?';
    console.log(`${icon} ${row.doc.padEnd(maxDocLength)}  ${row.state.padEnd(10)} ${row.detail}`);
  }

  const badCount = rows.filter(r => r.state === 'stale' || r.state === 'broken').length;
  const unverifiedCount = rows.filter(r => r.state === 'unverified').length;

  console.log(`\n${badCount} stale/broken, ${unverifiedCount} unverified`);

  if (isCi && badCount > 0) {
    process.exit(1);
  }
}

module.exports = {
  handleStatus
};
