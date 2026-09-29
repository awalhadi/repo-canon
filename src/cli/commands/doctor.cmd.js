'use strict';

const { runDoctor } = require('../../services/doctor.service');
const { STATUS_ICONS, printJson } = require('../formatters');

/**
 * Handles the `contextforge doctor` CLI command.
 */
function handleDoctor(context) {
  const { root, flags, isJson, isCi } = context;
  const report = runDoctor(root);

  if (isJson) {
    printJson(report);
  } else {
    for (const finding of report.findings) {
      const icon = STATUS_ICONS[finding.level] || '·';
      console.log(`${icon} ${finding.msg}`);
    }

    if (!report.findings.length) {
      console.log('✓ no findings');
    }

    if (report.budget) {
      const { estimate, entryTokens, repoTokens, ratio } = report.budget;
      const ratioLine = ratio != null ? `\n  entry = ${ratio}% of repo` : '';
      console.log(
        `\nToken budget (${estimate}):\n  entry context (AGENTS+PROJECT+INDEX): ~${entryTokens}\n  whole repo source:                    ~${repoTokens}${ratioLine}`
      );
    }
  }

  if (isCi && report.findings.some(f => f.level === 'error')) {
    process.exit(1);
  }
}

module.exports = {
  handleDoctor
};
