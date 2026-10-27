'use strict';

const { buildReport, formatReportMarkdown } = require('../../services/report.service');
const { printJson } = require('../formatters');

/**
 * Handles `repocanon report [--base=<ref>] [--format=markdown|json]`: what a pull
 * request does to the knowledge layer, as a PR comment or JSON.
 */
function handleReport(context) {
  const { root, options, isJson } = context;
  const report = buildReport(root, { base: options.base });

  if (isJson || options.format === 'json') {
    printJson(report);
  } else {
    process.stdout.write(formatReportMarkdown(report));
  }
  if (report.error) {
    process.exitCode = 1;
  }
}

module.exports = {
  handleReport
};
