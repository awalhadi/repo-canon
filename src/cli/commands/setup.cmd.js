'use strict';

const { planSetup, applySetup } = require('../../services/setup.service');
const { loadConfig } = require('../../core/config');
const { TARGET_IDS, resolveTargetIds } = require('../../core/targets');
const { CommandError } = require('../../core/errors');
const { printJson } = require('../formatters');

const VALID_HINT = `${TARGET_IDS.join(', ')}, all`;

const ROW_FORMAT = {
  create: row => `+ ${row.file} (created, repocanon server added)`,
  add: row => `+ ${row.file} (repocanon server added; other servers kept)`,
  update: row => `~ ${row.file} (repocanon server updated)`,
  unchanged: row => `= ${row.file} (already set up)`,
  invalid: row => `! ${row.file}: ${row.error} — left untouched. Add this yourself:\n${indent(row.snippet)}`,
  manual: row => `! ${row.label}: global config, paste this into ${row.file}:\n${indent(row.snippet)}`,
  none: row => `- ${row.label}: no MCP config needed`
};

function indent(text) {
  return text.split('\n').map(line => `    ${line}`).join('\n');
}

/**
 * Handles the `repocanon setup` CLI command: registers the RepoCanon MCP server
 * in each chosen tool's config.
 */
function handleSetup(context) {
  const { root, args, isJson } = context;
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
  for (const row of plan) {
    console.log(`  ${ROW_FORMAT[row.action](row)}`);
  }
  if (plan.some(row => ['create', 'add', 'update'].includes(row.action))) {
    console.log('\nRestart or reload the tool so it picks up the server, then ask your agent to "use rc_context".');
  }
}

module.exports = {
  handleSetup
};
