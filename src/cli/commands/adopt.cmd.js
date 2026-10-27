'use strict';

const { adoptProject } = require('../../services/adopt.service');
const { printJson } = require('../formatters');

const formatNumber = n => Number(n).toLocaleString('en-US');

/**
 * Handles `repocanon adopt [--dry-run] [--move] [--json]`: imports existing agent
 * instruction files (CLAUDE.md, Cursor/Copilot rules, Cline memory bank…) into .ai/.
 */
function handleAdopt(context) {
  const { root, flags, isJson } = context;
  const dryRun = flags.has('--dry-run');
  const result = adoptProject(root, { dryRun, move: flags.has('--move') });

  if (isJson) {
    printJson({ ...result, rows: result.rows.map(({ sections, ...row }) => row) });
    return;
  }

  if (result.initialized) {
    console.log('Created the knowledge layer (.ai/, AGENTS.md) first.\n');
  }
  if (!result.rows.length && !result.skipped.length) {
    console.log('Nothing to adopt: no CLAUDE.md, .cursorrules, Cursor/Copilot rules, GEMINI.md, .windsurfrules, .clinerules or memory-bank/ with your own text.');
    return;
  }

  const width = Math.max(...[...result.rows, ...result.skipped].map(r => r.rel.length));
  for (const row of result.rows) {
    if (row.status === 'already') {
      console.log(`  = ${row.rel.padEnd(width)}  already imported`);
      continue;
    }
    const where = Object.entries(row.destinations).map(([doc, n]) => `${doc} (${n})`).join(', ') || 'nothing left after cleaning';
    const removed = [
      row.inferableTokens ? `−${formatNumber(row.inferableTokens)} inferable` : '',
      row.secretLines ? `${row.secretLines} secret line(s) dropped` : ''
    ].filter(Boolean).join(', ');
    const changed = row.status === 'changed' ? ' (changed since last import)' : '';
    console.log(`  ${dryRun ? '·' : '+'} ${row.rel.padEnd(width)}  ${formatNumber(row.tokens)} tokens → ${where}${removed ? `  ${removed}` : ''}${changed}`);
  }
  for (const item of result.skipped) {
    console.log(`  - ${item.rel.padEnd(width)}  skipped: ${item.reason}`);
  }

  const imported = result.rows.filter(r => r.status !== 'already');
  const sum = key => imported.reduce((total, row) => total + row[key], 0);
  if (imported.length) {
    console.log(
      `\n${dryRun ? 'Would import' : 'Imported'} ${formatNumber(sum('importedTokens'))} tokens from ${imported.length} file(s)` +
      ` · removed ${formatNumber(sum('inferableTokens'))} tokens agents can read from the code` +
      (sum('secretLines') ? ` · dropped ${sum('secretLines')} secret line(s)` : '')
    );
  }

  for (const item of result.moved) {
    console.log(item.action === 'removed'
      ? `  → ${item.rel} removed (its text now lives in .ai/)`
      : `  → ${item.rel} now holds only the RepoCanon pointer to AGENTS.md`);
  }
  for (const item of result.notMoved) console.log(`  ! ${item.rel} not moved: ${item.reason}`);

  if (dryRun) {
    console.log('\nDry run — nothing written. Run: npx repocanon adopt');
  } else if (!flags.has('--move')) {
    console.log('\nNext: review the "Imported from …" sections in .ai/, run npx repocanon doctor, commit,\n      then npx repocanon adopt --move so tools stop reading the old copies.');
  }
}

module.exports = {
  handleAdopt
};
