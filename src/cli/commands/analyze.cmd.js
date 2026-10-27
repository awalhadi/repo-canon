'use strict';

const path = require('path');
const { analyzeProject } = require('../../services/analyze.service');

/**
 * Handles the `repocanon analyze` CLI command.
 */
function handleAnalyze(context) {
  const { root, flags, ui } = context;
  const analysis = analyzeProject(root, { scaffold: flags.has('--scaffold') });
  const { c, symbol } = ui;

  ui.header(`analyze${flags.has('--scaffold') ? ' --scaffold' : ''}`, path.basename(root));
  ui.section('Modules', analysis.modules.length);
  ui.table(analysis.modules.map(mod => [
    mod.has ? symbol.ok : symbol.same,
    mod.slug,
    c.dim(`${mod.files} file(s)`),
    c.dim(mod.paths.join(', '))
  ]), { head: ['', 'module', 'files', 'code paths'] });
  if (analysis.scaffolded.length) {
    ui.section('Doc stubs created');
    ui.actions(analysis.scaffolded.map(file => ['create', file, '']));
  }
  const documented = analysis.modules.filter(mod => mod.has).length;
  ui.verdict({ ok: `Module map written to .ai/INDEX.md`, extra: `${documented}/${analysis.modules.length} documented${analysis.config ? ' · .repocanon.json applied' : ''}` });
  if (!analysis.scaffolded.length && documented < analysis.modules.length) {
    ui.next([['npx repocanon analyze --scaffold', 'create doc stubs for undocumented modules']]);
  }
}

module.exports = {
  handleAnalyze
};
