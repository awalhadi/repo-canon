'use strict';

const path = require('path');
const { write } = require('../../core/fs');
const { syncProject, formatSyncReport } = require('../../services/sync.service');
const { printJson } = require('../formatters');

/**
 * Handles the `repocanon sync` CLI command.
 */
function handleSync(context) {
  const { root, flags, options, isJson } = context;
  const sinceRef = options.since || null;
  const report = syncProject(root, { since: sinceRef });

  if (isJson) {
    printJson(report);
    return;
  }

  const formattedText = formatSyncReport(report);
  console.log(formattedText);

  if (flags.has('--write') && !report.error) {
    const reportPath = path.join(root, '.ai/.sync-report.md');
    write(reportPath, `${formattedText}\n`);
    console.log('\n→ saved .ai/.sync-report.md');
  }
}

module.exports = {
  handleSync
};
