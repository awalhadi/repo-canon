'use strict';

const { initProject } = require('../../services/init.service');
const { analyzeProject } = require('../../services/analyze.service');

const STATUS_MAP = {
  created: '+',
  kept: '=',
  appended: '~',
  updated: '~',
  unchanged: '='
};

/**
 * Handles the `repocanon init` CLI command.
 */
function handleInit(context) {
  const { root, flags } = context;
  const result = initProject(root, { force: flags.has('--force') });

  console.log(`Detected: ${result.detected.stacks.join(', ') || 'unknown stack'}`);
  for (const [status, filePath] of result.log) {
    const symbol = STATUS_MAP[status] || '*';
    console.log(`  ${symbol} ${filePath} (${status})`);
  }

  const analysis = analyzeProject(root, {});
  console.log(`\nIndexed ${analysis.modules.length} module candidates → .ai/INDEX.md`);
  console.log('\nNext: repocanon prompt fill   (paste into your AI agent)\n      repocanon doctor        (check the result)');
}

module.exports = {
  handleInit
};
