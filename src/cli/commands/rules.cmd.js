'use strict';

const path = require('path');
const { planRules, applyRules, getPendingRules } = require('../../services/rules.service');
const { printJson } = require('../formatters');

/**
 * Handles `repocanon rules [--check] [--json]`. --check writes nothing and exits 1 when
 * anything is out of date.
 */
function handleRules(context) {
  const { root, flags, isJson, ui } = context;
  const check = flags.has('--check');
  const plan = check ? planRules(root) : applyRules(root, planRules(root));
  const pending = getPendingRules(plan);
  const problems = [];

  if (isJson) {
    printJson(plan.map(({ content, ...row }) => row));
  } else {
    const { symbol } = ui;
    ui.header(`rules${check ? ' --check' : ''}`, path.basename(root));
    ui.actions(pending.map(row => [row.action, row.file, check ? 'pending' : '']));
    ui.rows(problems.map(row => [symbol.warn, row.file, row.reason]));
    const total = plan.filter(row => row.kind !== 'entry').length;
    if (!pending.length && !problems.length) {
      ui.row(symbol.same, total ? `${total} scoped rule file(s), all current` : 'nothing to generate yet');
    }
    ui.verdict({
      warnings: check ? pending.length : problems.length,
      warningText: check && pending.length ? `${pending.length} file(s) out of date` : '',
      ok: pending.length ? `${pending.length} file(s) written` : 'Up to date',
      extra: `${total} scoped rule file(s)`
    });
    if (check && pending.length) ui.next([['npx repocanon rules', 'write them']]);
  }

  if (check && pending.length) {
    process.exitCode = 1;
  }
}

module.exports = {
  handleRules
};
