'use strict';

const path = require('path');
const { write } = require('../../core/fs');
const { CommandError } = require('../../core/errors');
const { syncProject, formatSyncReport } = require('../../services/sync.service');
const { printJson } = require('../formatters');

const MAX_FILES = 5;

/**
 * Terminal view of a sync report: which docs to update, the files to read for each,
 * then anything else that needs a look.
 *
 * @param {ReturnType<typeof import('../ui').createUi>} ui
 * @param {Record<string, any>} report
 */
function printSyncReport(ui, report) {
  const { c, symbol } = ui;
  const toUpdate = report.modules.filter(m => m.state === 'needs-update' || m.state === 'undocumented-changed');
  const broken = report.modules.filter(m => m.state === 'broken');
  const unverified = report.modules.filter(m => m.state === 'unverified' || m.state === 'unknown-ref');
  const ok = report.modules.filter(m => m.state === 'ok').length;

  ui.section('Docs to update', toUpdate.length);
  if (!toUpdate.length) ui.row(symbol.ok, 'none: every documented module matches its code');
  for (const mod of toUpdate) {
    const ignored = mod.ignored ? ` · ${mod.ignored} test/doc/formatting change(s) ignored` : '';
    ui.row(symbol.warn, c.bold(mod.slug), mod.doc
      ? `${mod.changed.length} file(s) changed since ${mod.base || '--since'}${ignored}`
      : `no doc yet: create .ai/modules/${mod.slug}.md from _TEMPLATE.md${ignored}`);
    for (const file of mod.changed.slice(0, MAX_FILES)) ui.line(`      ${c.dim(file)}`);
    if (mod.changed.length > MAX_FILES) ui.line(`      ${c.dim(`${ui.glyph.more} +${mod.changed.length - MAX_FILES} more`)}`);
    ui.line(`      ${c.dim('inspect:')} ${c.cyan(`git diff ${mod.base || '<ref>'} -- ${mod.paths.join(' ')}`)}`);
  }

  if (broken.length || unverified.length) {
    ui.section('Needs a look');
    ui.rows([
      ...broken.map(m => [symbol.error, m.slug, `code paths gone: ${m.missing.join(', ')}`]),
      ...unverified.map(m => [symbol.info, m.slug, m.state === 'unverified' ? 'never verified' : 'verified_at is not in git history'])
    ]);
  }
  if (report.signals.length) {
    ui.section('Also update');
    ui.rows(report.signals.map(s => [symbol.info, s.target, `${s.files.length} ${s.name} file(s) changed`]));
  }
  if (report.unmapped.length) {
    ui.section('Changed files in no module', report.unmapped.length);
    for (const file of report.unmapped.slice(0, MAX_FILES)) ui.line(`  ${c.dim(file)}`);
    if (report.unmapped.length > MAX_FILES) ui.line(`  ${c.dim(`${ui.glyph.more} +${report.unmapped.length - MAX_FILES} more`)}`);
  }

  ui.verdict({
    errors: broken.length,
    warnings: toUpdate.length,
    errorText: `${broken.length} broken doc(s)`,
    warningText: `${toUpdate.length} doc(s) to update`,
    ok: 'Docs are in sync with the code',
    extra: `${ok} up to date · HEAD ${report.head}`
  });
  if (toUpdate.length) {
    ui.next([
      ['update the docs above', 'only where behaviour, rules or flow changed'],
      [`npx repocanon stamp ${toUpdate[0].slug}`, 'after committing, for each doc you re-checked']
    ]);
  }
}

/**
 * Handles the `repocanon sync` CLI command.
 */
function handleSync(context) {
  const { root, flags, options, isJson, ui } = context;
  const sinceRef = options.since || null;
  const report = syncProject(root, { since: sinceRef });

  if (isJson) {
    printJson(report);
    return;
  }
  if (report.error) {
    throw new CommandError(report.error, 1, 'run it inside a git repository');
  }

  ui.header(`sync${sinceRef ? ` --since=${sinceRef}` : ''}`, path.basename(root));
  printSyncReport(ui, report);

  if (flags.has('--write')) {
    write(path.join(root, '.ai/.sync-report.md'), `${formatSyncReport(report)}\n`);
    ui.hint('saved as markdown to .ai/.sync-report.md');
  }
}

module.exports = {
  handleSync
};
