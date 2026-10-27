'use strict';

const path = require('path');
const { initProject } = require('../../services/init.service');
const { analyzeProject } = require('../../services/analyze.service');
const { resolveDefaultTargets, planTargets } = require('../../services/targets.service');
const { TARGETS, TARGET_IDS, resolveTargetIds, detectTargets } = require('../../core/targets');
const { readManagedBlock } = require('../../core/blocks');
const { CommandError } = require('../../core/errors');
const { planRules, applyRules, getPendingRules } = require('../../services/rules.service');
const { planSkills, applySkills, getPendingSkills } = require('../../services/skills.service');
const { isInteractive, multiSelect, confirm } = require('../prompt');

/** init.service log statuses → the kit's file actions */
const ACTION_OF = {
  created: 'create',
  appended: 'update',
  updated: 'update',
  removed: 'remove',
  deleted: 'remove',
  keep: 'keep'
};

const CHANGED = new Set(['created', 'appended', 'updated', 'removed', 'deleted']);
const VALID_TARGETS_HINT = `${TARGET_IDS.join(', ')}, all, none`;

/**
 * Rows for the picker: what each tool gets, and whether it is already set up.
 */
function buildPickerItems(root) {
  const detected = new Map(detectTargets(root).map(d => [d.id, d.evidence]));
  return TARGETS.map(target => {
    let note = '';
    if (target.native) {
      note = 'reads AGENTS.md natively';
    } else if (readManagedBlock(path.join(root, target.file)) !== null) {
      note = 'set up';
    } else if (detected.has(target.id)) {
      note = `detected (${detected.get(target.id)})`;
    }
    return {
      id: target.id,
      label: target.label,
      detail: target.file || 'AGENTS.md (no extra file)',
      note
    };
  });
}

/**
 * Selection order: --targets → interactive picker → saved choice → detected tools.
 *
 * @returns {Promise<{ ids: string[], source: string, interactive: boolean } | null>} null = cancelled
 */
async function chooseTargets(root, context) {
  const { flags, options } = context;

  if (options.targets !== undefined || flags.has('--targets')) {
    if (!options.targets) {
      throw new CommandError(`--targets needs a value, e.g. --targets=claude,cursor (choose from: ${VALID_TARGETS_HINT})`, 1);
    }
    const { ids, unknown } = resolveTargetIds(options.targets);
    if (unknown.length) {
      throw new CommandError(`unknown target ${unknown.join(', ')} — choose from: ${VALID_TARGETS_HINT}`, 1);
    }
    return { ids, source: 'flag', interactive: false };
  }

  const defaults = resolveDefaultTargets(root);
  if (flags.has('--yes') || !isInteractive()) {
    return { ...defaults, interactive: false };
  }

  const picked = await multiSelect({
    title: 'RepoCanon — which AI tools should read this project\'s knowledge layer?',
    hint: '↑/↓ move · space toggle · a all/none · enter confirm · esc cancel',
    footer: 'AGENTS.md is always written: it is the one source every tool reads.',
    items: buildPickerItems(root),
    selected: defaults.ids
  });
  return picked && { ids: picked, source: 'picker', interactive: true };
}

/**
 * Handles the `repocanon init` CLI command.
 */
async function handleInit(context) {
  const { root, flags, ui } = context;
  const selection = await chooseTargets(root, context);

  if (!selection) {
    ui.row(ui.symbol.same, 'Cancelled: nothing changed.');
    process.exitCode = 130;
    return;
  }

  let prune = flags.has('--prune');
  const unselected = planTargets(root, selection.ids).rows.filter(row => row.action === 'keep');
  if (unselected.length && !prune && selection.interactive) {
    prune = await confirm(
      `Remove the RepoCanon block from ${unselected.map(row => row.file).join(', ')}? (your own text in those files stays)`
    );
  }

  const result = initProject(root, { force: flags.has('--force'), targets: selection.ids, prune });
  const { c, symbol } = ui;
  const toolLabels = TARGETS.filter(t => selection.ids.includes(t.id)).map(t => t.label);
  const isFirstRun = result.log.some(([status, filePath]) => status === 'created' && filePath === '.ai/PROJECT.md');

  ui.header('init', path.basename(root));
  ui.table([
    [c.dim('Stack'), result.detected.stacks.join(', ') || 'not detected'],
    [c.dim('Tools'), toolLabels.join(', ') || 'none (AGENTS.md only)']
  ]);

  const changed = result.log.filter(([status]) => CHANGED.has(status) || status === 'keep');
  const unchangedCount = result.log.length - changed.length;
  const configChanged = ['created', 'updated'].includes(result.targets.config.status);

  if (changed.length || configChanged) {
    ui.section('Files');
    const actions = changed.map(([status, filePath]) => [ACTION_OF[status] || status, filePath, status === 'keep' ? 'tool not selected · --prune removes it' : '']);
    if (configChanged && !changed.some(([, filePath]) => filePath === '.repocanon.json')) {
      actions.push([result.targets.config.status === 'created' ? 'create' : 'update', '.repocanon.json', 'your tool choice']);
    }
    ui.actions(actions);
    if (unchangedCount) ui.row(symbol.same, c.dim(`${unchangedCount} other file(s) unchanged`));
  }

  if (result.targets.config.status === 'invalid') {
    ui.row(symbol.warn, `.repocanon.json: ${result.targets.config.error}`);
  }
  if (selection.source === 'none') {
    ui.row(symbol.warn, 'No AI tool detected, so only AGENTS.md was written', `pick some: npx repocanon init --targets=claude,cursor (${VALID_TARGETS_HINT})`);
  }

  const writtenRules = getPendingRules(applyRules(root, planRules(root)));
  const writtenSkills = getPendingSkills(applySkills(root, planSkills(root)));
  const analysis = analyzeProject(root, {});
  ui.section('Generated');
  const generated = (rows, label) => (rows.length
    ? [symbol.ok, label, `${rows.length} file(s) updated: ${rows.map(r => r.file).join(', ')}`]
    : [symbol.same, label, 'up to date']);
  ui.rows([
    [symbol.ok, 'Module map', `${analysis.modules.length} module(s) → .ai/INDEX.md`],
    generated(writtenRules, 'Scoped rules'),
    generated(writtenSkills, 'Skills')
  ]);

  const nothingChanged = !changed.length && !configChanged && !writtenRules.length && !writtenSkills.length;
  ui.verdict({ ok: isFirstRun ? 'Knowledge layer created' : nothingChanged ? 'Up to date: nothing changed' : 'Updated' });
  if (isFirstRun) {
    ui.next([
      ['npx repocanon setup', 'connect the MCP server to your tools'],
      ['npx repocanon prompt fill', 'brief for your agent to fill the docs (or ask it over MCP)'],
      ['npx repocanon doctor', 'check the result']
    ]);
  } else if (!nothingChanged) {
    ui.hint('re-run any time to add or remove tools');
  }
}

module.exports = {
  handleInit
};
