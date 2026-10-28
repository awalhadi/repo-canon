'use strict';

const path = require('path');
const { scanSecrets, scanStagedSecrets } = require('../../services/secrets.service');
const { scanInjections, scanStagedInjections, INTEGRITY_LABELS } = require('../../services/integrity.service');
const { printJson } = require('../formatters');

/**
 * Secret and unsafe-instruction findings merged per doc. Both have the same
 * `{ line, kind, preview }` shape, so `--json` keeps the format it had.
 *
 * @param {Array<{ doc: string, findings: any[] }>} secrets
 * @param {Array<{ doc: string, findings: any[] }>} injections
 * @returns {Array<{ doc: string, findings: Array<{ line: number, kind: string, preview: string, type: 'secret'|'instruction' }> }>}
 */
function mergeFindings(secrets, injections) {
  const byDoc = new Map();
  const add = (entries, type) => {
    for (const { doc, findings } of entries) {
      if (!byDoc.has(doc)) byDoc.set(doc, []);
      byDoc.get(doc).push(...findings.map(item => ({ ...item, type })));
    }
  };
  add(secrets, 'secret');
  add(injections, 'instruction');
  return [...byDoc].map(([doc, findings]) => ({ doc, findings: findings.sort((a, b) => a.line - b.line) }));
}

/**
 * Handles the `repocanon secrets` CLI command: secrets plus text that steers agents
 * (hidden characters, instruction overrides, pipe-to-shell). Exits 1 when anything
 * is found, so the pre-commit hook and CI can stop on it.
 */
function handleSecrets(context) {
  const { root, flags, isJson, ui } = context;
  const staged = flags.has('--staged');
  const results = staged
    ? mergeFindings(scanStagedSecrets(root), scanStagedInjections(root))
    : mergeFindings(scanSecrets(root), scanInjections(root));
  const count = type => results.reduce((n, entry) => n + entry.findings.filter(f => f.type === type).length, 0);
  const secretCount = count('secret');
  const instructionCount = count('instruction');

  if (isJson) {
    printJson(results);
  } else if (!flags.has('--quiet') || results.length) {
    const { symbol } = ui;
    ui.header(`secrets${staged ? ' --staged' : ''}`, path.basename(root));
    for (const { doc, findings } of results) {
      ui.section(doc, findings.length);
      ui.rows(findings.map(item => [
        symbol.error,
        `line ${item.line}`,
        item.type === 'secret' ? `possible ${item.kind} (${item.preview})` : `${INTEGRITY_LABELS[item.kind]} (${item.preview})`
      ]));
    }
    if (!results.length) ui.row(symbol.ok, `No secrets or unsafe instructions in ${staged ? 'the staged ' : ''}agent docs`);
    const parts = [
      ...(secretCount ? [`${secretCount} possible secret(s)`] : []),
      ...(instructionCount ? [`${instructionCount} unsafe instruction(s)`] : [])
    ];
    ui.verdict({ errors: secretCount + instructionCount, errorText: `${parts.join(', ')}: remove them before committing`, ok: 'Clean' });
    if (secretCount) ui.hint('a false positive? add <!-- repocanon:allow-secret --> on that line');
    if (instructionCount) ui.hint('intended text? add <!-- repocanon:allow-instruction --> on that line');
  }

  if (results.length) {
    process.exitCode = 1;
  }
}

module.exports = {
  handleSecrets
};
