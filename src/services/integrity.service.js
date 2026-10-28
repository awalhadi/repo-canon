'use strict';

const path = require('path');
const { read } = require('../core/fs');
const { getUntrackedFiles } = require('../core/git');
const { TARGETS } = require('../core/targets');
const { getScannedDocs } = require('./secrets.service');

const ALLOW_MARKER = 'repocanon:allow-instruction';
const INSTRUCTION_FILES = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.cursorrules', '.windsurfrules', '.clinerules']);
const MAX_PREVIEW = 60;

/**
 * Characters that render as nothing but change what an agent reads ("Rules File
 * Backdoor"): bidi overrides, zero-width marks, and Unicode tag characters that can
 * smuggle a hidden ASCII message. The zero-width joiner is left out: emoji use it.
 */
const HIDDEN = /[‪-‮⁦-⁩​‌⁠᠎﻿]|[\u{E0000}-\u{E007F}]/u;

/**
 * Wording that addresses the agent instead of describing the project. Kept narrow on
 * purpose: "never show the user a stack trace" is a real rule, "don't tell the user" is not.
 */
const PATTERNS = [
  {
    kind: 'override',
    re: /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier|preceding|system|user'?s?)\s+(?:instructions?|rules|prompts?|messages?|guidelines)\b/i
  },
  { kind: 'concealment', re: /\b(?:do not|don't|never)\s+(?:tell|inform|notify|mention\s+(?:this|it)\s+to)\s+the\s+user\b|\bwithout\s+(?:telling|informing|asking|notifying)\s+the\s+user\b/i },
  { kind: 'role spoofing', re: /<\/?system>|\[\/?INST\]|\bnew system prompt\b/i },
  { kind: 'remote code', re: /\b(?:curl|wget)\b[^|\n]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b|\bbase64\s+(?:-d|--decode)\b[^|\n]*\|\s*(?:ba|z)?sh\b|\b(?:iwr|Invoke-WebRequest)\b[^|\n]*\|\s*iex\b/i }
];

const LABELS = {
  hidden: 'hidden character',
  override: 'instruction override',
  concealment: 'tells the agent to hide something from the user',
  'role spoofing': 'fake system or role marker',
  'remote code': 'downloads and runs code',
  untracked: 'instruction file was never committed'
};

const HINTS = {
  hidden: 'it does not render in editors or diffs, so reviewers cannot see what the agent reads; delete it',
  override: 'project docs describe the project; they never need to cancel other instructions',
  concealment: 'a rule that hides work from the user is how injected instructions stay unnoticed',
  'role spoofing': 'agents may treat it as a higher-priority prompt',
  'remote code': 'an agent following this runs whatever that URL serves today',
  untracked: 'if you did not write it, a build step or dependency may have; review it before an agent reads it, then commit or delete it'
};

/**
 * @param {string} char
 * @returns {string} e.g. "U+202E"
 */
function toCodePoint(char) {
  return `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Finds text in a doc that tries to steer the agent rather than inform it. Lines
 * containing `repocanon:allow-instruction` are skipped.
 *
 * @param {string} text
 * @returns {Array<{ line: number, kind: string, preview: string }>}
 */
function findInjections(text) {
  const findings = [];
  String(text || '').split('\n').forEach((line, index) => {
    if (line.includes(ALLOW_MARKER)) return;
    // A byte-order mark at the very start of a file is an encoding artifact, not a payload
    const scanned = index === 0 ? line.replace(/^﻿/, '') : line;
    const hidden = scanned.match(HIDDEN);
    if (hidden) {
      findings.push({ line: index + 1, kind: 'hidden', preview: toCodePoint(hidden[0]) });
    }
    for (const { kind, re } of PATTERNS) {
      const match = scanned.match(re);
      if (match) {
        findings.push({ line: index + 1, kind, preview: match[0].slice(0, MAX_PREVIEW) });
      }
    }
  });
  return findings;
}

/**
 * Scans every file agents are told to trust: AGENTS.md, .ai/ docs and skills, and the
 * pointer files of every supported tool.
 *
 * @param {string} root - Project root directory
 * @returns {Array<{ doc: string, findings: ReturnType<typeof findInjections> }>} docs with findings only
 */
function scanInjections(root) {
  const docs = getScannedDocs(root);
  const seen = new Set(docs.map(doc => doc.rel));
  for (const target of TARGETS.filter(t => t.file && !seen.has(t.file))) {
    const text = read(path.join(root, target.file));
    if (text !== null) docs.push({ rel: target.file, text });
  }
  return docs
    .map(doc => ({ doc: doc.rel, findings: findInjections(doc.text) }))
    .filter(entry => entry.findings.length);
}

/**
 * Agent instruction files on disk that git does not track. A compromised dependency can
 * write one during a build, and agents load it like any other.
 *
 * @param {string} root - Project root directory
 * @returns {string[]} repo-relative paths
 */
function findUntrackedInstructionFiles(root) {
  return getUntrackedFiles(root).filter(rel => INSTRUCTION_FILES.has(path.posix.basename(rel)));
}

/**
 * One-line description of a finding, shared by doctor and MCP write validation.
 *
 * @param {string} doc
 * @param {{ line?: number, kind: string, preview?: string }} finding
 * @returns {string}
 */
function formatIntegrityFinding(doc, finding) {
  const where = finding.line ? `${doc}:${finding.line}` : doc;
  const preview = finding.preview ? ` (${finding.preview})` : '';
  const allow = finding.kind === 'untracked' ? '' : `. Intended? add <!-- ${ALLOW_MARKER} --> on that line`;
  return `${where} ${LABELS[finding.kind]}${preview} — ${HINTS[finding.kind]}${allow}`;
}

module.exports = {
  findInjections,
  scanInjections,
  findUntrackedInstructionFiles,
  formatIntegrityFinding
};
