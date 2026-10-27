'use strict';

const path = require('path');
const { read } = require('../core/fs');
const { getStagedFiles, readStagedFile } = require('../core/git');
const { getKnowledgeDocs } = require('./status.service');

const ALLOW_MARKER = 'repocanon:allow-secret';
const MIN_ASSIGNMENT_ENTROPY = 3.5;

/**
 * Provider formats with a fixed shape (high precision). `group` is the capture
 * group holding the secret value; 0 = the whole match.
 */
const PATTERNS = [
  { kind: 'private key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----/, group: 0 },
  { kind: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, group: 0 },
  { kind: 'AWS secret key', re: /aws_secret_access_key\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})/i, group: 1 },
  { kind: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/, group: 0 },
  { kind: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/, group: 0 },
  { kind: 'OpenAI API key', re: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}/, group: 0 },
  { kind: 'Stripe live key', re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/, group: 0 },
  { kind: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/, group: 0 },
  { kind: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, group: 0 },
  { kind: 'npm token', re: /\bnpm_[A-Za-z0-9]{36}\b/, group: 0 },
  { kind: 'JWT', re: /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/, group: 0 },
  { kind: 'URL with password', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s@/]{3,})@/i, group: 1 }
];

/**
 * `password = …`-style assignments. The value must also look random (entropy) and
 * not be a placeholder — env *names* alone never match.
 */
const ASSIGNMENT = /\b(?:password|passwd|pwd|secret|api[_-]?key|token|access[_-]?key|client[_-]?secret|private[_-]?key)\b["']?\s*[:=]\s*["'`]?([^\s"'`,;]{12,})/i;

const PLACEHOLDER = /^(?:<.*>|\$\{.*\}|\{\{.*\}\}|\$[A-Z_][A-Z0-9_]*|%[A-Z_]+%)$|\*{3,}|x{3,}|changeme|change_me|example|your[_-]|dummy|placeholder|redacted|todo|sample|fake|^(?:password|pass|secret|pwd)$/i;

/**
 * Shannon entropy in bits per character.
 *
 * @param {string} value
 * @returns {number}
 */
function getEntropy(value) {
  const counts = new Map();
  for (const ch of value) counts.set(ch, (counts.get(ch) || 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isPlaceholder(value) {
  return PLACEHOLDER.test(value) || new Set(value).size <= 2;
}

/**
 * Masked preview: never more than the first 4 characters of the secret.
 *
 * @param {string} value
 * @returns {string}
 */
function maskSecret(value) {
  return `${value.slice(0, 4)}…`;
}

/**
 * Finds likely secrets in a document. Lines containing `repocanon:allow-secret` are skipped.
 *
 * @param {string} text
 * @returns {Array<{ line: number, kind: string, preview: string }>}
 */
function findSecrets(text) {
  const findings = [];
  const lines = String(text || '').split('\n');

  lines.forEach((line, index) => {
    if (line.includes(ALLOW_MARKER)) {
      return;
    }
    let matched = false;
    for (const { kind, re, group } of PATTERNS) {
      const match = line.match(re);
      if (match && !isPlaceholder(match[group])) {
        findings.push({ line: index + 1, kind, preview: maskSecret(match[group]) });
        matched = true;
      }
    }
    if (!matched) {
      const match = line.match(ASSIGNMENT);
      const value = match && match[1];
      if (value && !isPlaceholder(value) && /\d/.test(value) && getEntropy(value) >= MIN_ASSIGNMENT_ENTROPY) {
        findings.push({ line: index + 1, kind: 'secret value', preview: maskSecret(value) });
      }
    }
  });

  return findings;
}

/**
 * Docs where agents and people write project knowledge: AGENTS.md and .ai/**.md.
 *
 * @param {string} rel
 * @returns {boolean}
 */
function isKnowledgeFile(rel) {
  return rel === 'AGENTS.md' || (rel.startsWith('.ai/') && rel.endsWith('.md'));
}

/**
 * Scans AGENTS.md and every .ai/ doc in the working tree.
 *
 * @param {string} root - Project root directory
 * @returns {Array<{ doc: string, findings: ReturnType<typeof findSecrets> }>} docs with findings only
 */
function scanSecrets(root) {
  const docs = [];
  const agentsText = read(path.join(root, 'AGENTS.md'));
  if (agentsText !== null) {
    docs.push({ rel: 'AGENTS.md', text: agentsText });
  }
  docs.push(...getKnowledgeDocs(root));

  return docs
    .map(doc => ({ doc: doc.rel, findings: findSecrets(doc.text) }))
    .filter(entry => entry.findings.length);
}

/**
 * Scans the staged (index) versions of AGENTS.md and .ai/ docs — what the next commit would publish.
 *
 * @param {string} root - Project root directory
 * @returns {Array<{ doc: string, findings: ReturnType<typeof findSecrets> }>}
 */
function scanStagedSecrets(root) {
  return getStagedFiles(root)
    .filter(isKnowledgeFile)
    .map(rel => ({ doc: rel, findings: findSecrets(readStagedFile(root, rel) || '') }))
    .filter(entry => entry.findings.length);
}

/**
 * One-line, masked description of a finding, shared by doctor and the `secrets` command.
 *
 * @param {string} doc
 * @param {{ line: number, kind: string, preview: string }} finding
 * @returns {string}
 */
function formatSecretFinding(doc, finding) {
  return `${doc}:${finding.line} possible ${finding.kind} (${finding.preview}) — remove it; docs are committed and shared. ` +
    `False positive? add <!-- ${ALLOW_MARKER} --> on that line`;
}

module.exports = {
  findSecrets,
  scanSecrets,
  scanStagedSecrets,
  formatSecretFinding,
  getEntropy
};
