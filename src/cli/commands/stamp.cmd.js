'use strict';

const path = require('path');
const { stampDocs } = require('../../services/status.service');
const { lockClaims } = require('../../services/claims.service');
const { CommandError } = require('../../core/errors');

/**
 * Handles the `repocanon stamp` CLI command.
 */
function handleStamp(context) {
  const { root, args, flags, ui } = context;
  const result = stampDocs(root, {
    names: args,
    all: flags.has('--all'),
    force: flags.has('--force')
  });

  if (!result.head) {
    throw new CommandError('nothing stamped: the repo has no commit yet', 1, 'commit your code first, then stamp');
  }

  const knownList = result.known.join(', ') || 'none';
  if (result.needsTarget) {
    throw new CommandError('stamp needs a doc name (or --all)', 1, `known docs: ${knownList}`);
  }
  if (result.unknown.length) {
    throw new CommandError(`no doc named ${result.unknown.join(', ')}: nothing stamped`, 1, `known docs: ${knownList}`);
  }

  // Verifying a doc vouches for its claims: record the code they were checked against
  const claims = lockClaims(root, result.stamped);

  const { symbol } = ui;
  ui.header('stamp', path.basename(root));
  ui.rows([
    ...result.stamped.map(doc => [symbol.ok, doc, `verified at ${result.head}`]),
    ...result.refused.map(({ doc }) => [symbol.error, doc, 'not stamped']),
    ...(claims.locked.length ? [[symbol.ok, '.ai/canon.lock', `${claims.locked.length} claim anchor(s) locked`]] : []),
    ...claims.refused.map(({ id, reason }) => [symbol.warn, `claim ${id}`, `not locked: ${reason}`])
  ]);
  ui.verdict({
    errors: result.refused.length,
    errorText: `${result.refused.length} doc(s) not stamped`,
    ok: `${result.stamped.length} doc(s) marked verified`,
    extra: result.refused.length && result.stamped.length ? `${result.stamped.length} stamped` : ''
  });
  // Refusals usually share one cause (uncommitted code): say it once
  for (const reason of [...new Set(result.refused.map(r => r.reason))]) ui.hint(reason);
  if (result.stamped.length) ui.hint('the change to verified_at goes into your next commit');

  if (result.refused.length) {
    process.exitCode = 1;
  }
}

module.exports = {
  handleStamp
};
