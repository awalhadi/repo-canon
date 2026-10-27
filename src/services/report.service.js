'use strict';

const pkg = require('../../package.json');
const { loadConfig } = require('../core/config');
const { getDriftOptions } = require('../core/drift');
const { execGit, isValidRef, getSignificantChanges } = require('../core/git');
const { getModuleMap } = require('./pack.service');
const { getFreshnessScore, formatScore } = require('./score.service');
const { planRules, getPendingRules } = require('./rules.service');
const { scanSecrets } = require('./secrets.service');
const { scanKnowledgeLayer } = require('./inferable.service');

const REPORT_MARKER = '<!-- repocanon-report -->';
const MAX_ROWS = 15;
const DEFAULT_BASES = ['origin/main', 'main', 'origin/master', 'master'];

/**
 * The commit a pull request branched from: merge-base of the base ref and HEAD.
 *
 * @param {string} root
 * @param {string} [base]
 * @returns {{ base: string, mergeBase: string } | null}
 */
function resolveBase(root, base) {
  const candidates = base ? [base] : DEFAULT_BASES;
  const ref = candidates.find(candidate => isValidRef(root, candidate));
  if (!ref) return null;
  const mergeBase = execGit(root, ['merge-base', ref, 'HEAD']);
  return mergeBase ? { base: ref, mergeBase } : null;
}

/**
 * What a pull request does to the knowledge layer: which modules' code changed,
 * whether their docs changed with it, and the layer's overall health.
 *
 * @param {string} root - Project root directory
 * @param {{ base?: string }} [options={}]
 * @returns {Record<string, any>}
 */
function buildReport(root, options = {}) {
  const resolved = resolveBase(root, options.base);
  if (!resolved) {
    return { error: `base ref not found (${options.base || DEFAULT_BASES.join(', ')}) — pass --base=<ref>; in CI check out with fetch-depth: 0` };
  }

  const changedOut = execGit(root, ['diff', '--name-only', '--no-renames', `${resolved.mergeBase}..HEAD`]);
  const changedFiles = changedOut ? changedOut.split('\n').filter(Boolean) : [];
  const changedSet = new Set(changedFiles);
  const driftOptions = getDriftOptions(loadConfig(root));

  const modules = [];
  for (const mod of getModuleMap(root)) {
    const { significant } = getSignificantChanges(root, resolved.mergeBase, mod.paths, driftOptions);
    if (!significant.length) continue;
    const doc = mod.doc || `.ai/modules/${mod.slug}.md`;
    const docState = !mod.doc ? 'missing' : changedSet.has(doc) ? 'updated' : 'not-updated';
    modules.push({ slug: mod.slug, doc, files: significant, docState });
  }

  const secretCount = scanSecrets(root).reduce((n, entry) => n + entry.findings.length, 0);
  const inferableCount = scanKnowledgeLayer(root).reduce((n, entry) => n + entry.findings.length, 0);

  return {
    base: resolved.base,
    mergeBase: resolved.mergeBase.slice(0, 7),
    changedFiles: changedFiles.length,
    modules,
    score: getFreshnessScore(root),
    pendingRules: getPendingRules(planRules(root)).length,
    secrets: secretCount,
    inferable: inferableCount
  };
}

/**
 * Pull-request comment. The hidden marker lets CI update the same comment on every push.
 *
 * @param {ReturnType<typeof buildReport>} report
 * @returns {string}
 */
function formatReportMarkdown(report) {
  if (report.error) {
    return `${REPORT_MARKER}\n### RepoCanon\n${report.error}\n`;
  }

  const behind = report.modules.filter(m => m.docState !== 'updated');
  const verdict = report.secrets
    ? `🔒 ${report.secrets} possible secret(s) in the docs`
    : behind.length
      ? `⚠️ ${behind.length} module(s) changed without their docs`
      : report.modules.length
        ? '✅ Docs keep up with this PR'
        : '✅ No documented module changed';

  const lines = [REPORT_MARKER, `### RepoCanon: ${verdict}`, ''];

  if (report.modules.length) {
    lines.push('| Module | Code changed | Doc |', '|---|---|---|');
    const docCell = m => (m.docState === 'updated'
      ? '✅ updated'
      : m.docState === 'missing'
        ? `➕ no doc yet — create \`${m.doc}\``
        : `⚠️ not updated — \`${m.doc}\``);
    for (const m of report.modules.slice(0, MAX_ROWS)) {
      lines.push(`| \`${m.slug}\` | ${m.files.length} file(s) | ${docCell(m)} |`);
    }
    if (report.modules.length > MAX_ROWS) lines.push(`| … | +${report.modules.length - MAX_ROWS} more | |`);
    lines.push('');
  }

  lines.push(`**${formatScore(report.score)}**`, '');
  if (report.secrets) lines.push(`- 🔒 ${report.secrets} possible secret(s) in AGENTS.md / .ai/ — see the doctor annotations; remove before merging.`);
  if (report.pendingRules) lines.push(`- Scoped rule files out of date: ${report.pendingRules} — run \`npx repocanon rules\`.`);
  if (report.inferable) lines.push(`- ${report.inferable} block(s) in the docs repeat what the code shows (trees, dependency lists, pasted code) — consider deleting them.`);
  const agentVerified = report.score.agentVerified || [];
  if (agentVerified.length) lines.push(`- 🤖 ${agentVerified.length} doc(s) were last verified by an agent (${agentVerified.slice(0, 3).map(d => `\`${d}\``).join(', ')}${agentVerified.length > 3 ? ', …' : ''}) — a human review is worth it.`);
  if (behind.length) lines.push('- Update the docs above if behaviour, rules or flow changed, then `npx repocanon stamp <module>` after merging.');
  lines.push('', `<sub>RepoCanon ${pkg.version} · ${report.changedFiles} file(s) changed vs \`${report.base}\` (${report.mergeBase}) · only code changes count; tests, docs and formatting are ignored</sub>`);

  return `${lines.join('\n')}\n`;
}

module.exports = {
  buildReport,
  formatReportMarkdown,
  REPORT_MARKER
};
