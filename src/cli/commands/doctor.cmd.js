'use strict';

const { runDoctor } = require('../../services/doctor.service');
const { formatScore } = require('../../services/score.service');
const { STATUS_ICONS, printJson, formatGithubAnnotation, wantsGithubFormat } = require('../formatters');

/**
 * Handles the `repocanon doctor` CLI command.
 * --ci fails on errors; --strict also fails on warnings; --format=github (automatic in
 * GitHub Actions with --ci) prints workflow annotations instead of plain lines.
 */
function handleDoctor(context) {
  const { root, flags, isJson, isCi } = context;
  const report = runDoctor(root);

  if (isJson) {
    printJson(report);
  } else if (wantsGithubFormat(context)) {
    for (const finding of report.findings) {
      console.log(formatGithubAnnotation(finding.level, finding.msg, finding));
    }
    if (report.score) console.log(formatScore(report.score));
  } else {
    for (const finding of report.findings) {
      const icon = STATUS_ICONS[finding.level] || '·';
      console.log(`${icon} ${finding.msg}`);
    }

    if (!report.findings.length) {
      console.log('✓ no findings');
    }

    if (report.score) {
      console.log(`\n${formatScore(report.score)}`);
    }

    if (report.budget) {
      const { estimate, entryTokens, repoTokens, ratio } = report.budget;
      const ratioLine = ratio != null ? `\n  entry = ${ratio}% of repo` : '';
      console.log(
        `\nToken budget (${estimate}):\n  entry context (AGENTS+PROJECT+INDEX): ~${entryTokens}\n  whole repo source:                    ~${repoTokens}${ratioLine}`
      );
    }
  }

  const failLevels = flags.has('--strict') ? ['error', 'warn'] : ['error'];
  if (isCi && report.findings.some(f => failLevels.includes(f.level))) {
    process.exit(1);
  }
}

module.exports = {
  handleDoctor
};
