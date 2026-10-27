'use strict';

const path = require('path');
const { planSkills, applySkills, getPendingSkills, getSkillProblems } = require('../../services/skills.service');
const { printJson } = require('../formatters');

/**
 * Handles `repocanon skills [--check] [--json]`. --check writes nothing and exits 1 when
 * anything is out of date.
 */
function handleSkills(context) {
  const { root, flags, isJson, ui } = context;
  const check = flags.has('--check');
  const plan = check ? planSkills(root) : applySkills(root, planSkills(root));
  const pending = getPendingSkills(plan);
  const problems = getSkillProblems(plan);

  if (isJson) {
    printJson(plan.map(({ content, ...row }) => row));
  } else {
    const { symbol } = ui;
    ui.header(`skills${check ? ' --check' : ''}`, path.basename(root));
    ui.actions(pending.map(row => [row.action, row.file, check ? 'pending' : '']));
    ui.rows(problems.map(row => [symbol.warn, row.file, row.reason]));
    const total = plan.filter(row => row.action === 'unchanged' || row.action === 'kept').length;
    if (!pending.length && !problems.length) {
      ui.row(symbol.same, total ? `${total} skill file(s), all current` : 'No skills: no lint/typecheck/test commands found and nothing in .ai/skills/');
    }
    ui.verdict({
      warnings: check ? pending.length : problems.length,
      warningText: check && pending.length ? `${pending.length} file(s) out of date` : '',
      ok: pending.length ? `${pending.length} file(s) written` : 'Up to date',
      extra: `${total} skill file(s)`
    });
    if (check && pending.length) ui.next([['npx repocanon skills', 'write them']]);
  }

  if (check && pending.length) {
    process.exitCode = 1;
  }
}

module.exports = {
  handleSkills
};
