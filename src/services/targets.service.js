'use strict';

const path = require('path');
const { exists } = require('../core/fs');
const { loadConfig, updateConfigFile } = require('../core/config');
const { upsertManagedBlock, readManagedBlock, removeManagedBlock } = require('../core/blocks');
const { TARGETS, getTarget, detectTargets } = require('../core/targets');

/**
 * Which targets to use when the user didn't pick: the saved choice, else the tools
 * the project already uses. Nothing is guessed beyond that.
 *
 * @param {string} root - Project root directory
 * @returns {{ ids: string[], source: 'saved'|'detected'|'none' }}
 */
function resolveDefaultTargets(root) {
  const config = loadConfig(root);
  if (config._found && Array.isArray(config.targets)) {
    return { ids: config.targets, source: 'saved' };
  }
  const detected = detectTargets(root).map(d => d.id);
  return { ids: detected, source: detected.length ? 'detected' : 'none' };
}

/**
 * Computes what selecting `selectedIds` would change, without writing anything.
 *
 * Actions: create | append (file exists, no block yet) | update | unchanged |
 * native (tool reads AGENTS.md itself) | remove (deselected, prune) | keep (deselected, no prune).
 *
 * @param {string} root - Project root directory
 * @param {string[]} selectedIds
 * @param {{ prune?: boolean }} [options={}]
 * @returns {{ targets: string[], rows: Array<{ id: string, label: string, file: string, action: string }> }}
 */
function planTargets(root, selectedIds, options = {}) {
  const { prune = false } = options;
  const rows = [];

  for (const target of TARGETS) {
    const selected = selectedIds.includes(target.id);
    const base = { id: target.id, label: target.label };

    if (target.native) {
      if (selected) {
        rows.push({ ...base, file: 'AGENTS.md', action: 'native' });
      }
      continue;
    }

    const fullPath = path.join(root, target.file);
    const currentBody = readManagedBlock(fullPath);

    if (selected) {
      let action = 'update';
      if (!exists(fullPath)) {
        action = 'create';
      } else if (currentBody === null) {
        action = 'append';
      } else if (currentBody === target.text.trim()) {
        action = 'unchanged';
      }
      rows.push({ ...base, file: target.file, action });
    } else if (currentBody !== null) {
      rows.push({ ...base, file: target.file, action: prune ? 'remove' : 'keep' });
    }
  }

  return { targets: TARGETS.map(t => t.id).filter(id => selectedIds.includes(id)), rows };
}

/**
 * Applies a plan from planTargets() and saves the selection to .repocanon.json.
 *
 * @param {string} root - Project root directory
 * @param {ReturnType<typeof planTargets>} plan
 * @returns {{ log: Array<[string, string]>, config: ReturnType<typeof updateConfigFile> }}
 */
function applyTargets(root, plan) {
  const log = [];

  for (const row of plan.rows) {
    const target = getTarget(row.id);
    const fullPath = target.file ? path.join(root, target.file) : null;

    if (row.action === 'create' || row.action === 'append' || row.action === 'update') {
      log.push([upsertManagedBlock(fullPath, target.text, target.prefix || ''), row.file]);
    } else if (row.action === 'remove') {
      log.push([removeManagedBlock(fullPath, target.prefix || ''), row.file]);
    } else {
      log.push([row.action, row.file]);
    }
  }

  return { log, config: updateConfigFile(root, { targets: plan.targets }) };
}

module.exports = {
  resolveDefaultTargets,
  planTargets,
  applyTargets
};
