'use strict';

const { planRules, applyRules, getPendingRules } = require('../../services/rules.service');
const { printJson } = require('../formatters');

const SYMBOLS = { create: '+', update: '~', remove: '-' };

/**
 * Handles `repocanon rules [--check] [--json]`: writes per-module rule files that tools
 * load only while editing that module's files. --check writes nothing and exits 1 when
 * anything is out of date.
 */
function handleRules(context) {
  const { root, flags, isJson } = context;
  const check = flags.has('--check');
  const plan = check ? planRules(root) : applyRules(root, planRules(root));
  const pending = getPendingRules(plan);

  if (isJson) {
    printJson(plan.map(({ content, ...row }) => row));
  } else if (!pending.length) {
    console.log(`Up to date — ${plan.length} scoped rule file(s).`);
  } else {
    const verb = { create: 'created', update: 'updated', remove: 'removed' };
    for (const row of pending) {
      const label = check ? `would be ${verb[row.action]}` : verb[row.action];
      console.log(`  ${SYMBOLS[row.action]} ${row.file} (${label})`);
    }
    if (check) console.log('\nRun: npx repocanon rules');
  }

  if (check && pending.length) {
    process.exitCode = 1;
  }
}

module.exports = {
  handleRules
};
