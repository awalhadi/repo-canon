'use strict';

const { analyzeProject } = require('../../services/analyze.service');

/**
 * Handles the `repocanon analyze` CLI command.
 */
function handleAnalyze(context) {
  const { root, flags } = context;
  const analysis = analyzeProject(root, { scaffold: flags.has('--scaffold') });

  console.log(`${analysis.modules.length} modules${analysis.config ? ' (.repocanon.json applied)' : ''}:`);
  for (const mod of analysis.modules) {
    const mark = mod.has ? '✓' : '·';
    console.log(`  ${mark} ${mod.slug}  (${mod.paths.join(', ')} — ${mod.files} files)`);
  }

  for (const scaffoldedFile of analysis.scaffolded) {
    console.log(`  + ${scaffoldedFile}`);
  }
}

module.exports = {
  handleAnalyze
};
