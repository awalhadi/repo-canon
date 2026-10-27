'use strict';

const path = require('path');
const { exists, isPathInside } = require('../core/fs');
const { getUncommittedPaths } = require('../core/git');
const { getDocStatus } = require('./status.service');
const { getModuleMap } = require('./pack.service');
const { planRules, getPendingRules } = require('./rules.service');

const MAX_NAMED = 3;

/**
 * @param {string[]} items
 * @returns {string}
 */
function listSome(items) {
  const shown = items.slice(0, MAX_NAMED).join(', ');
  return items.length > MAX_NAMED ? `${shown} +${items.length - MAX_NAMED} more` : shown;
}

/**
 * `git status --porcelain` reports renames as "old -> new"; keep the new path.
 *
 * @param {string} entry
 * @returns {string}
 */
function toCurrentPath(entry) {
  const arrow = entry.indexOf(' -> ');
  return arrow === -1 ? entry : entry.slice(arrow + 4);
}

/**
 * Short context for the start of an agent session: the layer exists, how to use it,
 * and which docs not to trust. Empty when the project has no .ai/ folder.
 *
 * @param {string} root - Project root directory
 * @returns {string}
 */
function getSessionContext(root) {
  if (!exists(path.join(root, '.ai'))) {
    return '';
  }

  const lines = [
    'This project has a RepoCanon knowledge layer: AGENTS.md plus .ai/ (rules, decisions, module docs).',
    'Before exploring the code for a task, call the rc_context MCP tool with the task, or read AGENTS.md → .ai/PROJECT.md → .ai/INDEX.md → the one relevant module doc.'
  ];

  const rows = getDocStatus(root);
  const name = row => row.doc.replace(/^\.ai\//, '');
  const stale = rows.filter(row => row.state === 'stale').map(name);
  const broken = rows.filter(row => row.state === 'broken').map(name);
  if (stale.length) {
    lines.push(`Stale docs (code changed since they were verified): ${listSome(stale)} — where they disagree with the code, trust the code.`);
  }
  if (broken.length) {
    lines.push(`Broken docs (their code paths are gone): ${listSome(broken)}.`);
  }
  lines.push('After changing behaviour or rules, update the matching .ai/ doc and add a line to .ai/STATE.md.');
  return lines.join('\n');
}

/**
 * End-of-turn check: if the agent changed a module's code but not that module's doc,
 * ask it once to update the doc or say none is needed. Returns null to let it stop.
 * `stop_hook_active` is set by the agent host when it already continued because of a
 * Stop hook, so the nudge can never loop.
 *
 * @param {string} root - Project root directory
 * @param {{ stop_hook_active?: boolean }} [input={}] - hook input JSON
 * @returns {{ decision: 'block', reason: string } | null}
 */
function getStopNudge(root, input = {}) {
  if (input.stop_hook_active || !exists(path.join(root, '.ai'))) {
    return null;
  }

  const changedCode = getUncommittedPaths(root, ['.', ':(exclude).ai']).map(toCurrentPath);
  if (!changedCode.length) {
    return null;
  }
  const changedDocs = new Set(getUncommittedPaths(root, ['.ai']).map(toCurrentPath));

  const pending = [];
  for (const mod of getModuleMap(root)) {
    const files = changedCode.filter(file => mod.paths.some(p => isPathInside(file, p)));
    const doc = mod.doc || `.ai/modules/${mod.slug}.md`;
    if (files.length && !changedDocs.has(doc)) {
      pending.push({ slug: mod.slug, doc, files });
    }
  }
  if (!pending.length) {
    // Docs were updated; make sure the per-module rule files carry the new text
    const staleRules = getPendingRules(planRules(root));
    return staleRules.length
      ? { decision: 'block', reason: `RepoCanon: module docs changed, but ${staleRules.length} scoped rule file(s) still hold the old text. Run: npx repocanon rules` }
      : null;
  }

  const described = pending
    .slice(0, MAX_NAMED)
    .map(p => `${listSome(p.files)} (module ${p.slug}) without updating ${p.doc}`)
    .join('; ');
  const more = pending.length > MAX_NAMED ? ` (+${pending.length - MAX_NAMED} more modules)` : '';
  return {
    decision: 'block',
    reason:
      `RepoCanon: you changed ${described}${more}. ` +
      'If behaviour, rules or the flow changed, update that doc (no code copies, no file lists) and record it with rc_checkpoint_state (or a line in .ai/STATE.md); after committing, rc_stamp the docs you re-checked and run rc_verify. ' +
      'If nothing a future agent needs has changed, say so briefly and finish.'
  };
}

module.exports = {
  getSessionContext,
  getStopNudge
};
