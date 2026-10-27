'use strict';

const { planSkills, applySkills, getPendingSkills, getSkillProblems } = require('../../services/skills.service');
const { printJson } = require('../formatters');

const SYMBOLS = { create: '+', update: '~', remove: '-' };

/**
 * Handles `repocanon skills [--check] [--json]`: generates the verify-a-change skill and
 * copies every .ai/skills/<name>/SKILL.md into the skill folders of the chosen tools.
 * --check writes nothing and exits 1 when anything is out of date.
 */
function handleSkills(context) {
  const { root, flags, isJson } = context;
  const check = flags.has('--check');
  const plan = check ? planSkills(root) : applySkills(root, planSkills(root));
  const pending = getPendingSkills(plan);
  const problems = getSkillProblems(plan);

  if (isJson) {
    printJson(plan.map(({ content, ...row }) => row));
  } else {
    if (!pending.length) {
      const count = plan.filter(row => row.action === 'unchanged' || row.action === 'kept').length;
      if (count) {
        console.log(`Up to date — ${count} skill file(s).`);
      } else if (!problems.length) {
        console.log('No skills: no lint/typecheck/test commands found and nothing in .ai/skills/.');
      }
    }
    const verb = { create: 'created', update: 'updated', remove: 'removed' };
    for (const row of pending) {
      const label = check ? `would be ${verb[row.action]}` : verb[row.action];
      console.log(`  ${SYMBOLS[row.action]} ${row.file} (${label})`);
    }
    for (const row of problems) {
      console.log(`  ! ${row.file}: ${row.reason}`);
    }
    if (check && pending.length) console.log('\nRun: npx repocanon skills');
  }

  if (check && pending.length) {
    process.exitCode = 1;
  }
}

module.exports = {
  handleSkills
};
