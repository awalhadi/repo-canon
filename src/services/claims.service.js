'use strict';

const path = require('path');
const { read, write } = require('../core/fs');
const { getUncommittedPaths } = require('../core/git');
const { LOCK_FILE, parseClaims, locateSymbol, hashRegion, formatRef, parseLock, renderLock } = require('../core/claims');
const { getKnowledgeDocs } = require('./status.service');

const ASSERTED_SECTIONS = /^## (?:Invariants|Gotchas|Rules|Boundaries)\b/i;

/**
 * Claims may only point inside the repo: no absolute paths, no "..".
 *
 * @param {string} rel
 * @returns {boolean}
 */
function isRepoPath(rel) {
  return Boolean(rel) && !rel.startsWith('/') && !/^[a-z]:/i.test(rel) && !rel.split(/[\\/]/).includes('..');
}

/**
 * Current hash of an anchor, or why it can't be found.
 *
 * @param {string} root
 * @param {{ path: string, name: string }} anchor
 * @returns {{ hash: string }|{ problem: string }}
 */
function resolveAnchor(root, anchor) {
  if (!isRepoPath(anchor.path)) {
    return { problem: `anchor must be a repo-relative path: ${formatRef(anchor)}` };
  }
  const source = read(path.join(root, anchor.path));
  if (source === null) return { problem: `anchor file not found: ${anchor.path}` };
  if (!anchor.name) return { hash: hashRegion(source, { start: 0, end: source.split('\n').length - 1 }) };
  const region = locateSymbol(source, anchor.name);
  return region ? { hash: hashRegion(source, region) } : { problem: `symbol ${anchor.name} not found in ${anchor.path}` };
}

/**
 * Whether a test the claim names still exists: the file, and the test's name in it.
 * Running the test is CI's job; this catches a deleted or renamed test.
 *
 * @param {string} root
 * @param {{ path: string, name: string }} test
 * @returns {string|null} the problem, or null when it is there
 */
function checkTest(root, test) {
  if (!isRepoPath(test.path)) return `test must be a repo-relative path: ${formatRef(test)}`;
  const source = read(path.join(root, test.path));
  if (source === null) return `test file not found: ${test.path}`;
  if (test.name && !source.includes(test.name)) return `test "${test.name}" not found in ${test.path}`;
  return null;
}

/**
 * Bullets in rule sections that carry no check: the asserted tier, trusted on the
 * doc's own verified_at alone.
 *
 * @param {string} text
 * @returns {number}
 */
function countAsserted(text) {
  let inRules = false;
  let count = 0;
  for (const line of String(text || '').split('\n')) {
    if (line.startsWith('## ')) inRules = ASSERTED_SECTIONS.test(line);
    else if (inRules && /^[-*] \S/.test(line) && !/<!--\s*rc:/.test(line) && !/\bTODO\b/.test(line)) count++;
  }
  return count;
}

/**
 * Every claim in the knowledge layer with its tier and state:
 *   enforced: a named test proves it (state fresh, or broken when the test is gone)
 *   anchored: tied to code by hash (fresh, stale when that code changed, unlocked
 *             when never stamped, broken when the code is gone)
 * Docs' other rule bullets are counted as asserted.
 *
 * @param {string} root - Project root directory
 * @returns {{
 *   claims: Array<{ id: string, doc: string, line: number, text: string, tier: 'enforced'|'anchored', state: 'fresh'|'stale'|'unlocked'|'broken', detail: string, anchor: string|null, test: string|null }>,
 *   asserted: number
 * }}
 */
function getClaims(root) {
  const lock = parseLock(read(path.join(root, LOCK_FILE)));
  const claims = [];
  let asserted = 0;

  for (const doc of getKnowledgeDocs(root)) {
    asserted += countAsserted(doc.text);
    const docName = path.posix.basename(doc.rel, '.md');
    for (const claim of parseClaims(doc.text, docName)) {
      const problems = [...claim.problems];
      let state = 'fresh';
      let detail = '';

      if (claim.test) {
        const problem = checkTest(root, claim.test);
        if (problem) problems.push(problem);
      }
      if (claim.anchor && !problems.length) {
        const resolved = resolveAnchor(root, claim.anchor);
        const locked = lock.get(claim.id);
        if (resolved.problem) problems.push(resolved.problem);
        else if (!locked || locked.anchor !== formatRef(claim.anchor)) {
          state = 'unlocked';
          detail = `never checked — re-read ${formatRef(claim.anchor)}, then: repocanon stamp ${docName}`;
        } else if (locked.hash !== resolved.hash) {
          state = 'stale';
          detail = `${formatRef(claim.anchor)} changed since the claim was checked — trust the code`;
        }
      }
      if (!claim.anchor && !claim.test && !problems.length) {
        problems.push('annotation has neither anchor= nor test=');
      }
      if (problems.length) {
        state = 'broken';
        detail = problems.join('; ');
      }

      claims.push({
        id: claim.id,
        doc: doc.rel,
        line: claim.line,
        text: claim.text,
        tier: claim.test ? 'enforced' : 'anchored',
        state,
        detail,
        anchor: claim.anchor ? formatRef(claim.anchor) : null,
        test: claim.test ? formatRef(claim.test) : null
      });
    }
  }

  const duplicates = claims.filter((c, i) => claims.findIndex(o => o.id === c.id) !== i);
  for (const claim of duplicates) {
    claim.state = 'broken';
    claim.detail = `duplicate claim id ${claim.id} — add id=<name> to tell them apart`;
  }
  return { claims, asserted };
}

/**
 * Records the current hash of every resolvable anchored claim in the given docs, so
 * later changes to that code mark the claim stale. Runs with `stamp`: verifying a doc
 * is what vouches for its claims. A claim whose anchor is missing, or whose anchor file
 * has uncommitted changes, is refused and keeps its old entry. Entries of claims that
 * no longer exist in those docs are dropped.
 *
 * @param {string} root - Project root directory
 * @param {string[]} docRels - e.g. ['.ai/modules/billing.md']
 * @returns {{ locked: string[], refused: Array<{ id: string, reason: string }> }}
 */
function lockClaims(root, docRels) {
  const lockPath = path.join(root, LOCK_FILE);
  const before = read(lockPath);
  const lock = parseLock(before);
  const result = { locked: [], refused: [] };
  const wanted = new Set(docRels);

  for (const doc of getKnowledgeDocs(root).filter(d => wanted.has(d.rel))) {
    const claims = parseClaims(doc.text, path.posix.basename(doc.rel, '.md'));
    const prefix = `${path.posix.basename(doc.rel, '.md')}/`;
    const live = new Set(claims.map(c => c.id));
    for (const id of [...lock.keys()]) {
      if (id.startsWith(prefix) && !live.has(id)) lock.delete(id);
    }
    for (const claim of claims.filter(c => c.anchor)) {
      const resolved = resolveAnchor(root, claim.anchor);
      if (resolved.problem) {
        result.refused.push({ id: claim.id, reason: resolved.problem });
        continue;
      }
      if (getUncommittedPaths(root, [claim.anchor.path]).length) {
        result.refused.push({ id: claim.id, reason: `${claim.anchor.path} has uncommitted changes — commit first` });
        continue;
      }
      lock.set(claim.id, { anchor: formatRef(claim.anchor), hash: resolved.hash });
      result.locked.push(claim.id);
    }
  }

  const after = lock.size ? renderLock(lock) : null;
  if (after !== null && after !== before) write(lockPath, after);
  return result;
}

/**
 * Doctor findings for claims: broken ones are errors, stale ones warnings, never-
 * checked ones info.
 *
 * @param {ReturnType<typeof getClaims>['claims']} claims
 * @returns {Array<{ level: 'error'|'warn'|'info', msg: string, file: string, line: number }>}
 */
function getClaimFindings(claims) {
  const level = { broken: 'error', stale: 'warn', unlocked: 'info' };
  return claims
    .filter(c => level[c.state])
    .map(c => ({ level: level[c.state], msg: `${c.doc}:${c.line} claim ${c.id} ${c.state}: ${c.detail}`, file: c.doc, line: c.line }));
}

/**
 * "2 enforced · 3 anchored (1 stale) · 7 asserted"
 *
 * @param {ReturnType<typeof getClaims>} report
 * @returns {string}
 */
function formatClaimSummary(report) {
  const tier = name => report.claims.filter(c => c.tier === name);
  const notes = list => {
    const bad = ['stale', 'broken', 'unlocked']
      .map(state => [state, list.filter(c => c.state === state).length])
      .filter(([, n]) => n)
      .map(([state, n]) => `${n} ${state}`);
    return bad.length ? ` (${bad.join(', ')})` : '';
  };
  const enforced = tier('enforced');
  const anchored = tier('anchored');
  return `${enforced.length} enforced${notes(enforced)} · ${anchored.length} anchored${notes(anchored)} · ${report.asserted} asserted`;
}

module.exports = {
  getClaims,
  lockClaims,
  getClaimFindings,
  formatClaimSummary
};
