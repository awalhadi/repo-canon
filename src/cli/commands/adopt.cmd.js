'use strict';

const path = require('path');
const { adoptProject } = require('../../services/adopt.service');
const { printJson } = require('../formatters');

const formatNumber = n => Number(n).toLocaleString('en-US');

/**
 * Handles `repocanon adopt [--dry-run] [--move] [--json]`: imports existing agent
 * instruction files (CLAUDE.md, Cursor/Copilot rules, Cline memory bank…) into .ai/.
 */
function handleAdopt(context) {
  const { root, flags, isJson, ui } = context;
  const dryRun = flags.has('--dry-run');
  const result = adoptProject(root, { dryRun, move: flags.has('--move') });

  if (isJson) {
    printJson({ ...result, rows: result.rows.map(({ sections, ...row }) => row) });
    return;
  }

  const { c, symbol } = ui;
  ui.header(`adopt${dryRun ? ' --dry-run' : ''}`, path.basename(root));
  if (result.initialized) {
    ui.row(symbol.ok, 'Created the knowledge layer (.ai/, AGENTS.md) first');
  }
  if (!result.rows.length && !result.skipped.length) {
    ui.row(symbol.same, 'Nothing to adopt', 'no CLAUDE.md, .cursorrules, Cursor/Copilot rules, GEMINI.md, .windsurfrules, .clinerules or memory-bank/ with your own text');
    ui.next([['npx repocanon init', 'start a fresh knowledge layer instead']]);
    return;
  }

  ui.section(dryRun ? 'Would import' : 'Imported');
  ui.rows([
    ...result.rows.map(row => {
      if (row.status === 'already') return [symbol.same, row.rel, 'already imported'];
      const where = Object.entries(row.destinations).map(([doc, n]) => `${doc} (${n})`).join(', ') || 'nothing left after cleaning';
      const removed = [
        row.inferableTokens ? `−${formatNumber(row.inferableTokens)} inferable` : '',
        row.secretLines ? `${row.secretLines} secret line(s) dropped` : '',
        row.status === 'changed' ? 'changed since last import' : ''
      ].filter(Boolean).join(' · ');
      return [dryRun ? symbol.info : c.green('+'), row.rel, `${formatNumber(row.tokens)} tokens → ${where}${removed ? ` · ${removed}` : ''}`];
    }),
    ...result.skipped.map(item => [symbol.same, item.rel, `skipped: ${item.reason}`])
  ]);

  if (result.moved.length || result.notMoved.length) {
    ui.section('Originals');
    ui.rows([
      ...result.moved.map(item => [symbol.ok, item.rel, item.action === 'removed' ? 'removed (its text now lives in .ai/)' : 'now only points to AGENTS.md']),
      ...result.notMoved.map(item => [symbol.warn, item.rel, `not moved: ${item.reason}`])
    ]);
  }

  const imported = result.rows.filter(r => r.status !== 'already');
  const sum = key => imported.reduce((total, row) => total + row[key], 0);
  ui.verdict({
    warnings: result.notMoved.length,
    ok: imported.length
      ? `${dryRun ? 'Would import' : 'Imported'} ${formatNumber(sum('importedTokens'))} tokens from ${imported.length} file(s)`
      : 'Already imported: nothing new',
    extra: [
      sum('inferableTokens') ? `${formatNumber(sum('inferableTokens'))} tokens of code-derivable text dropped` : '',
      sum('secretLines') ? `${sum('secretLines')} secret line(s) dropped` : ''
    ].filter(Boolean).join(' · ')
  });

  if (dryRun) {
    ui.hint('dry run: nothing written');
    ui.next([['npx repocanon adopt', 'import for real']]);
  } else if (!flags.has('--move')) {
    ui.next([
      ['review the "Imported from …" sections in .ai/', ''],
      ['npx repocanon doctor', 'check the result'],
      ['git commit, then npx repocanon adopt --move', 'so tools stop reading the old copies']
    ]);
  }
}

module.exports = {
  handleAdopt
};
