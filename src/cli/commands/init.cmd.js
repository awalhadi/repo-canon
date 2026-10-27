'use strict';

const path = require('path');
const { initProject } = require('../../services/init.service');
const { analyzeProject } = require('../../services/analyze.service');
const { resolveDefaultTargets, planTargets } = require('../../services/targets.service');
const { TARGETS, TARGET_IDS, resolveTargetIds, detectTargets } = require('../../core/targets');
const { readManagedBlock } = require('../../core/blocks');
const { CommandError } = require('../../core/errors');
const { isInteractive, multiSelect, confirm } = require('../prompt');

const STATUS_MAP = {
  created: '+',
  appended: '~',
  updated: '~',
  removed: '-',
  deleted: '-',
  keep: '!',
  kept: '=',
  unchanged: '=',
  native: '='
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
  const { root, flags } = context;
  const selection = await chooseTargets(root, context);

  if (!selection) {
    console.log('Cancelled — nothing changed.');
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

  console.log(`Detected: ${result.detected.stacks.join(', ') || 'unknown stack'}`);

  const changed = result.log.filter(([status]) => CHANGED.has(status) || status === 'keep');
  const unchangedCount = result.log.length - changed.length;
  const toolLabels = TARGETS.filter(t => selection.ids.includes(t.id)).map(t => t.label);
  const configChanged = ['created', 'updated'].includes(result.targets.config.status);

  if (!changed.length && !configChanged) {
    console.log(`Up to date — ${toolLabels.length} tool(s): ${toolLabels.join(', ') || 'none (AGENTS.md only)'}. Nothing changed.`);
  } else {
    for (const [status, filePath] of changed) {
      const label = status === 'keep' ? 'not selected — kept; use --prune to remove' : status;
      console.log(`  ${STATUS_MAP[status] || '*'} ${filePath} (${label})`);
    }
    if (unchangedCount) {
      console.log(`  = ${unchangedCount} other file(s) unchanged`);
    }
    console.log(`Tools: ${toolLabels.join(', ') || 'none (AGENTS.md only)'} → saved in .repocanon.json (re-run \`npx repocanon init\` to change)`);
  }

  if (result.targets.config.status === 'invalid') {
    console.warn(`warning: ${result.targets.config.error}`);
  }
  if (selection.source === 'none') {
    console.log(`No AI tool detected, so only AGENTS.md was written. Pick tools: npx repocanon init --targets=claude,cursor (choose from: ${VALID_TARGETS_HINT})`);
  }

  const analysis = analyzeProject(root, {});
  console.log(`\nIndexed ${analysis.modules.length} module candidates → .ai/INDEX.md`);

  if (result.log.some(([status, filePath]) => status === 'created' && filePath === '.ai/PROJECT.md')) {
    console.log('\nNext: npx repocanon prompt fill   (paste into your AI agent, or ask it to "fill the RepoCanon docs" over MCP)\n      npx repocanon doctor        (check the result)');
  }
}

module.exports = {
  handleInit
};
