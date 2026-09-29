'use strict';

const fs = require('fs');
const path = require('path');
const { exists, read, isPathInside, listWorkspaceFiles } = require('../core/fs');
const { parseFrontmatter } = require('../core/frontmatter');
const {
  isInsideGitRepo,
  isValidRef,
  getHeadShort,
  getChangedFilesSince
} = require('../core/git');
const { loadConfig } = require('../core/config');
const { detectProject } = require('../core/detector');
const { detectModules } = require('../core/modules');

const SIGNALS = [
  ['data model / schema', /(^|\/)(migrations?|alembic)\/|schema\.prisma|\.sql$|(^|\/)schema\./, 'DOMAIN.md (states, invariants) + owning module doc'],
  ['routes / API surface', /(^|\/)routes?\/|routes\.(php|ts|js|py|rb)$|urls\.py$|\.controller\.|(^|\/)controllers?\//i, "module doc 'Code map' / 'Flow'"],
  ['dependencies / stack', /(^|\/)(package\.json|composer\.json|requirements\.txt|pyproject\.toml|go\.mod|Cargo\.toml|Gemfile|pubspec\.yaml)$/, 'PROJECT.md (stack, commands)'],
  ['config / env / infra', /(^|\/)(\.env\.example|Dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$|(^|\/)config\/|\.github\/workflows\//, 'PROJECT.md (environments, external services)'],
  ['tests', /(^|\/)tests?\/|\.(test|spec)\.[a-z]+$/i, 'informational: tests often reveal rules for DOMAIN.md']
];

/**
 * Discovers code changes since last verification and flags docs needing updates.
 *
 * @param {string} root - Project root directory
 * @param {{ since?: string }} [options={}] - Optional reference to compare against
 * @returns {Record<string, any>} Sync report model
 */
function syncProject(root, options = {}) {
  if (!isInsideGitRepo(root)) {
    return { error: 'sync needs a git repository' };
  }

  const files = listWorkspaceFiles(root);
  const config = loadConfig(root);
  const project = detectProject(root);
  const detected = detectModules(files, config, project.stacks);

  const slugs = new Set(detected.map(m => m.slug));
  const modDir = path.join(root, '.ai', 'modules');
  if (fs.existsSync(modDir)) {
    try {
      const moduleFiles = fs.readdirSync(modDir);
      for (const f of moduleFiles) {
        if (f.endsWith('.md') && !f.startsWith('_')) {
          slugs.add(f.slice(0, -3));
        }
      }
    } catch {
      // Ignore read error
    }
  }

  const rows = [];
  const mappedFiles = new Set();

  for (const slug of [...slugs].sort()) {
    const docRel = `.ai/modules/${slug}.md`;
    const text = read(path.join(root, docRel));
    const fm = text ? parseFrontmatter(text) : {};
    const det = detected.find(m => m.slug === slug);
    const paths = Array.isArray(fm.code_paths) && fm.code_paths.length ? fm.code_paths : (det ? det.paths : []);
    const missing = paths.filter(p => !exists(path.join(root, p)));
    const base = options.since || fm.verified_at;

    let state;
    let changed = [];

    if (!text) {
      state = 'undocumented';
      if (options.since && isValidRef(root, options.since)) {
        changed = getChangedFilesSince(root, options.since).filter(f =>
          paths.some(p => isPathInside(f, p))
        );
      }
    } else if (missing.length && missing.length === paths.length) {
      state = 'broken';
    } else if (!base) {
      state = 'unverified';
    } else if (!isValidRef(root, base)) {
      state = 'unknown-ref';
    } else {
      changed = getChangedFilesSince(root, base).filter(f =>
        paths.some(p => isPathInside(f, p))
      );
      state = changed.length ? 'needs-update' : 'ok';
    }

    if (state === 'undocumented' && changed.length) {
      state = 'undocumented-changed';
    }

    for (const p of paths) {
      for (const f of files) {
        if (isPathInside(f, p)) {
          mappedFiles.add(f);
        }
      }
    }

    rows.push({
      slug,
      doc: text ? docRel : null,
      state,
      base: base || null,
      changed,
      missing,
      paths
    });
  }

  const stateDoc = parseFrontmatter(read(path.join(root, '.ai/STATE.md')) || '');
  const projectDoc = parseFrontmatter(read(path.join(root, '.ai/PROJECT.md')) || '');
  const globalBase = [options.since, stateDoc.verified_at, projectDoc.verified_at].find(r =>
    isValidRef(root, r)
  );

  const allChanged = globalBase ? getChangedFilesSince(root, globalBase) : [];
  const unmapped = allChanged.filter(f => !mappedFiles.has(f) && !/\.(md|lock)$/.test(f));
  const signals = SIGNALS.map(([name, regex, target]) => ({
    name,
    target,
    files: allChanged.filter(f => regex.test(f))
  })).filter(x => x.files.length > 0);

  return {
    head: getHeadShort(root),
    globalBase: globalBase || null,
    modules: rows,
    unmapped,
    signals
  };
}

/**
 * Formats a sync report object into Markdown text.
 *
 * @param {Record<string, any>} report
 * @returns {string} Formatted markdown report
 */
function formatSyncReport(report) {
  if (report.error) {
    return report.error;
  }

  const lines = [
    '# RepoCanon sync report',
    `HEAD: ${report.head} | global base: ${report.globalBase || 'none (run: repocanon stamp)'}`,
    ''
  ];

  const needUpdate = report.modules.filter(
    m => m.state === 'needs-update' || m.state === 'undocumented-changed'
  );

  lines.push(`## Docs to update (${needUpdate.length})`);
  if (!needUpdate.length) {
    lines.push('- none');
  }

  for (const mod of needUpdate) {
    lines.push(
      `- **${mod.slug}** — ${mod.changed.length} file(s) changed since ${mod.base || '--since'}${mod.doc ? '' : ' (NO DOC: create from _TEMPLATE.md)'}`
    );
    mod.changed.slice(0, 8).forEach(f => lines.push(`    - ${f}`));
    if (mod.changed.length > 8) {
      lines.push(`    - … +${mod.changed.length - 8} more`);
    }
    lines.push(`    - inspect: git diff ${mod.base || '<ref>'} -- ${mod.paths.join(' ')}`);
  }

  const otherStates = {
    broken: 'Broken (code_paths no longer exist — renamed/removed?)',
    unverified: 'Unverified (no verified_at)',
    'unknown-ref': 'verified_at not in git history'
  };

  for (const [stateKey, title] of Object.entries(otherStates)) {
    const matchingMods = report.modules.filter(m => m.state === stateKey);
    if (matchingMods.length) {
      lines.push('', `## ${title}`);
      matchingMods.forEach(m =>
        lines.push(`- ${m.slug}${stateKey === 'broken' ? ': ' + m.missing.join(', ') : ''}`)
      );
    }
  }

  if (report.signals.length) {
    lines.push('', '## Signals (update these docs too)');
    report.signals.forEach(s =>
      lines.push(`- ${s.name}: ${s.files.length} file(s) → ${s.target}`)
    );
  }

  if (report.unmapped.length) {
    lines.push('', `## Changed files not in any module (${report.unmapped.length})`);
    report.unmapped.slice(0, 15).forEach(f => lines.push(`- ${f}`));
    if (report.unmapped.length > 15) {
      lines.push(`- … +${report.unmapped.length - 15} more`);
    }
  }

  const okCount = report.modules.filter(m => m.state === 'ok').length;
  const undocumentedCount = report.modules.filter(m => m.state === 'undocumented').length;

  lines.push(
    '',
    `Up to date: ${okCount} | Undocumented (no changes): ${undocumentedCount}`,
    '',
    'After updating docs: `repocanon stamp <module>`; add a line to STATE.md.'
  );

  return lines.join('\n');
}

module.exports = {
  syncProject,
  sync: syncProject,
  formatSyncReport,
  format: formatSyncReport,
  SIGNALS
};
