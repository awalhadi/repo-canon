'use strict';

/**
 * Directories and paths ignored during file system scanning.
 */
const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'vendor',
  'dist',
  'build',
  '.next',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  'coverage',
  '.ai',
  'storage',
  '.turbo',
  '.cache',
  '.idea',
  '.vscode'
]);

/**
 * Standard line caps for documentation linting in `doctor`.
 */
const DOC_LINE_CAPS = [
  ['AGENTS.md', 80],
  ['.ai/PROJECT.md', 150],
  ['.ai/INDEX.md', 400],
  ['.ai/DOMAIN.md', 300],
  ['.ai/CONVENTIONS.md', 120],
  ['.ai/DECISIONS.md', 300],
  ['.ai/STATE.md', 80]
];

/**
 * Line cap for individual module documentation files.
 */
const MODULE_DOC_LINE_CAP = 100;

/**
 * Known IDE pointer files checked and created by ContextForge.
 */
const IDE_POINTERS = [
  'CLAUDE.md',
  'GEMINI.md',
  '.windsurfrules',
  '.clinerules',
  '.github/copilot-instructions.md'
];

/**
 * Cursor custom rule path and its frontmatter.
 */
const CURSOR_RULE_PATH = '.cursor/rules/project.mdc';
const CURSOR_RULE_FRONTMATTER = '---\nalwaysApply: true\n---\n';

/**
 * Default text inserted into IDE pointer files.
 */
const IDE_POINTER_TEXT = 'Read AGENTS.md first — it is the single source of truth for working in this repo. The knowledge layer lives in .ai/ (start at .ai/PROJECT.md, then .ai/INDEX.md).';

/**
 * Core documents initialized inside `.ai/`.
 */
const CORE_DOCS = [
  'INDEX',
  'PROJECT',
  'DOMAIN',
  'CONVENTIONS',
  'DECISIONS',
  'STATE'
];

/**
 * CLI status icons.
 */
const STATUS_ICONS = {
  broken: '✗',
  fresh: '✓',
  stale: '⚠',
  unverified: '○',
  unknown: '?',
  'n/a': '-',
  error: '✗',
  warn: '⚠',
  info: 'ℹ'
};

/**
 * Binary, compiled, or media files excluded from token counting.
 */
const TOKEN_SKIP_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|eot|otf|mp[34]|mov|svg|map|lock)$|\.min\.(js|css)$|(package-lock\.json|composer\.lock|yarn\.lock|pnpm-lock\.yaml)$/i;

/**
 * Non-business directory names filtered out from module auto-detection.
 */
const NOISE_MODULE_DIRS = new Set([
  'vendor',
  'node-modules',
  'layouts',
  'layout',
  'partials',
  'errors',
  'emails',
  'includes',
  'stubs',
  'lang',
  'shared',
  'common',
  'components',
  'assets',
  'public',
  'storage',
  'cache'
]);

module.exports = {
  DEFAULT_IGNORED_DIRS,
  DOC_LINE_CAPS,
  MODULE_DOC_LINE_CAP,
  IDE_POINTERS,
  CURSOR_RULE_PATH,
  CURSOR_RULE_FRONTMATTER,
  IDE_POINTER_TEXT,
  CORE_DOCS,
  STATUS_ICONS,
  TOKEN_SKIP_EXTENSIONS,
  NOISE_MODULE_DIRS
};
