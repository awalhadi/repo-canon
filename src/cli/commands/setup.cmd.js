'use strict';

const path = require('path');
const { planSetup, applySetup } = require('../../services/setup.service');
const { loadConfig } = require('../../core/config');
const { TARGET_IDS, resolveTargetIds } = require('../../core/targets');
const { CommandError } = require('../../core/errors');
const { printJson } = require('../formatters');

const VALID_HINT = `${TARGET_IDS.join(', ')}, all`;

const NOTES = {
  create: 'repocanon server added',
  add: 'repocanon server added; your other servers kept',
  update: 'repocanon server updated',
  unchanged: 'already set up'
};

/**
 * Handles the `repocanon setup` CLI command: registers the RepoCanon MCP server
 * in each chosen tool's config.
 */
function handleSetup(context) {
  const { root, args, isJson, ui } = context;
  let ids;

  if (args.length) {
    const resolved = resolveTargetIds(args);
    if (resolved.unknown.length) {
      throw new CommandError(`unknown tool ${resolved.unknown.join(', ')} — choose from: ${VALID_HINT}`, 1);
    }
    ids = resolved.ids;
  } else {
    const config = loadConfig(root);
    if (!Array.isArray(config.targets) || !config.targets.length) {
      throw new CommandError(`no tools chosen yet — run \`npx repocanon init\`, or name them: npx repocanon setup claude cursor (choose from: ${VALID_HINT})`, 1);
    }
    ids = config.targets;
  }

  const plan = applySetup(root, planSetup(root, ids));

  if (isJson) {
    printJson(plan);
    return;
  }
  const { symbol } = ui;
  ui.header('setup', path.basename(root));
  ui.actions(plan.filter(row => NOTES[row.action]).map(row => [row.action, row.file, NOTES[row.action]]));
  ui.rows(plan.filter(row => row.action === 'none').map(row => [symbol.same, row.label, 'no MCP config needed (reads AGENTS.md)']));
  for (const row of plan) {
    if (row.action === 'invalid') {
      ui.row(symbol.warn, row.file, `${row.error}: left untouched, add this yourself:`);
      ui.block(row.snippet);
    } else if (row.action === 'manual') {
      ui.row(symbol.warn, row.label, `global config: paste this into ${row.file}`);
      ui.block(row.snippet);
    }
  }
  const changed = plan.filter(row => ['create', 'add', 'update'].includes(row.action)).length;
  const manual = plan.filter(row => ['invalid', 'manual'].includes(row.action)).length;
  ui.verdict({ warnings: 0, ok: changed ? `MCP server registered in ${changed} config(s)` : 'Already set up', extra: manual ? `${manual} to paste yourself` : '' });
  if (changed || manual) {
    ui.next([['restart or reload your tool', 'so it starts the server'], ['ask your agent: "use rc_context for this task"', 'to check it works']]);
  }
}

module.exports = {
  handleSetup
};
