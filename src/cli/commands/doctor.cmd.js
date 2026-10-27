'use strict';

const path = require('path');
const { runDoctor } = require('../../services/doctor.service');
const { formatScore } = require('../../services/score.service');
const { printJson, formatGithubAnnotation, wantsGithubFormat } = require('../formatters');

const GROUPS = [['error', 'Errors'], ['warn', 'Warnings'], ['info', 'Info']];

/**
 * Commands the findings already suggest ("— run: npx repocanon rules"), deduplicated.
 *
 * @param {Array<{ msg: string }>} findings
 * @returns {string[]}
 */
function suggestedCommands(findings) {
  const commands = [];
  for (const { msg } of findings) {
    const match = msg.match(/run: ((?:npx )?repocanon [\w<>.-]+(?: [\w<>.-]+)?)/);
    if (!match) continue;
    const command = match[1].startsWith('npx ') ? match[1] : `npx ${match[1]}`;
    if (!commands.includes(command)) commands.push(command);
  }
  return commands;
}

/**
 * Handles the `repocanon doctor` CLI command.
 * --ci fails on errors; --strict also fails on warnings; --format=github (automatic in
 * GitHub Actions with --ci) prints workflow annotations instead of plain lines.
 */
function handleDoctor(context) {
  const { root, flags, isJson, isCi, ui } = context;
  const report = runDoctor(root);
  const byLevel = level => report.findings.filter(f => f.level === level);

  if (isJson) {
    printJson(report);
  } else if (wantsGithubFormat(context)) {
    for (const finding of report.findings) {
      console.log(formatGithubAnnotation(finding.level, finding.msg, finding));
    }
    if (report.score) console.log(formatScore(report.score));
  } else {
    const { c, symbol } = ui;
    const symbols = { error: symbol.error, warn: symbol.warn, info: symbol.info };
    ui.header('doctor', path.basename(root));

    for (const [level, title] of GROUPS) {
      const findings = byLevel(level);
      if (!findings.length) continue;
      ui.section(title, findings.length);
      for (const finding of findings) ui.row(symbols[level], finding.msg);
    }

    if (report.budget) {
      const { entryTokens, repoTokens, ratio } = report.budget;
      ui.section('Token budget');
      ui.table([
        ['Entry context (AGENTS + PROJECT + INDEX)', `~${entryTokens.toLocaleString('en-US')} tokens`],
        ['Whole repo source', `~${repoTokens.toLocaleString('en-US')} tokens`],
        ...(ratio != null ? [['Entry share of the repo', `${ratio}%`]] : [])
      ].map(([label, value]) => [label, c.bold(value)]));
      ui.hint('estimates: word-aware for docs, bytes/4 for code');
    }

    if (report.score) {
      ui.line('');
      ui.meter('Freshness', report.score.score);
    }

    const errors = byLevel('error').length;
    const warnings = byLevel('warn').length;
    ui.verdict({ errors, warnings, ok: 'Healthy: no problems found', extra: byLevel('info').length ? `${byLevel('info').length} note(s)` : '' });
    ui.next([
      ...suggestedCommands(report.findings).slice(0, 4).map(command => [command, '']),
      (errors || warnings) && ['npx repocanon doctor', 'run again after fixing']
    ]);
  }

  const failLevels = flags.has('--strict') ? ['error', 'warn'] : ['error'];
  if (isCi && report.findings.some(f => failLevels.includes(f.level))) {
    process.exit(1);
  }
}

module.exports = {
  handleDoctor
};
