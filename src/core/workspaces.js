'use strict';

const path = require('path');
const { read, toSlug } = require('./fs');
const { detectProject } = require('./detector');

/** Files that make a folder a package. */
const MANIFESTS = ['package.json', 'project.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'composer.json'];

/** Stacks that make a package an application (split by feature) rather than a library. */
const APP_STACKS = new Set([
  'Next.js', 'Nuxt', 'SvelteKit', 'Astro', 'Expo', 'NestJS', 'Express', 'Fastify', 'Hono',
  'Laravel', 'Symfony', 'Django', 'FastAPI', 'Flask', 'Rails', 'Tauri', 'Electron'
]);

/**
 * Converts a workspace glob to a test: `*` is one path segment, `**` any depth.
 *
 * @param {string} pattern
 * @returns {(dir: string) => boolean}
 */
function toDirMatcher(pattern) {
  const clean = pattern.trim().replace(/^\.\//, '').replace(/\/+$/, '');
  const source = clean
    .split('/')
    .map(part => (part === '**' ? '.*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+')))
    .join('/')
    .replace(/\/\.\*$/, '(/.*)?');
  const re = new RegExp(`^${source}$`);
  return dir => re.test(dir);
}

/**
 * List items of a simple YAML/TOML key: `key:` followed by `- item` lines, or `key = [ … ]`.
 *
 * @param {string} text
 * @param {RegExp} yamlKey - e.g. /^packages:\s*$/
 * @returns {string[]}
 */
function readYamlList(text, yamlKey) {
  const items = [];
  let inList = false;
  for (const line of String(text || '').split('\n')) {
    if (yamlKey.test(line)) {
      inList = true;
      continue;
    }
    if (!inList) continue;
    const item = line.match(/^\s+-\s+(.+?)\s*$/);
    if (item) items.push(item[1].replace(/^(['"])(.*)\1$/, '$2'));
    else if (/^\S/.test(line)) inList = false;
  }
  return items;
}

/**
 * `members = [ … ]` inside a TOML table, single- or multi-line.
 *
 * @param {string} text
 * @param {string} table - e.g. 'workspace' or 'tool.uv.workspace'
 * @returns {string[]}
 */
function readTomlMembers(text, table) {
  const start = String(text || '').search(new RegExp(`^\\[${table.replace(/\./g, '\\.')}\\]\\s*$`, 'm'));
  if (start < 0) return [];
  const section = text.slice(start).split(/\n\[/)[0];
  const match = section.match(/\bmembers\s*=\s*\[([\s\S]*?)\]/);
  return match ? [...match[1].matchAll(/["']([^"']+)["']/g)].map(m => m[1]) : [];
}

/**
 * Package name from its manifest, without an npm scope or a composer vendor.
 *
 * @param {string} root
 * @param {string} dir
 * @returns {string}
 */
function readPackageName(root, dir) {
  const file = name => read(path.join(root, dir, name));
  const fromJson = name => {
    try {
      return JSON.parse(file(name) || '{}').name || '';
    } catch {
      return '';
    }
  };
  const fromToml = name => ((file(name) || '').match(/^name\s*=\s*["']([^"']+)["']/m) || [])[1] || '';
  const goModule = ((file('go.mod') || '').match(/^module\s+(\S+)/m) || [])[1] || '';
  const name = fromJson('package.json') || fromJson('project.json') || fromToml('Cargo.toml') ||
    goModule.split('/').pop() || fromToml('pyproject.toml') || fromJson('composer.json');
  return (name || path.posix.basename(dir)).replace(/^@[^/]+\//, '').replace(/^[^/]+\//, '');
}

/**
 * The packages of a monorepo, from whichever workspace tools it uses. Null for a
 * single-package repo, so callers keep their single-project behaviour.
 *
 * @param {string} root - Project root directory
 * @param {string[]} files - repo-relative file list
 * @returns {{ tools: string[], packages: Array<{ name: string, slug: string, dir: string, kind: 'app'|'package', stacks: string[] }> } | null}
 */
function detectWorkspaces(root, files) {
  const fileSet = new Set(files);
  const manifestDirs = [...new Set(files
    .filter(f => f.includes('/') && MANIFESTS.includes(path.posix.basename(f)))
    .map(f => path.posix.dirname(f)))];
  const has = file => fileSet.has(file) || read(path.join(root, file)) !== null;
  const tools = [];
  const patterns = [];
  const literalDirs = [];

  if (has('pnpm-workspace.yaml')) {
    tools.push('pnpm');
    patterns.push(...readYamlList(read(path.join(root, 'pnpm-workspace.yaml')), /^packages:\s*$/));
  }
  try {
    const pkg = JSON.parse(read(path.join(root, 'package.json')) || '{}');
    const workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces && pkg.workspaces.packages) || [];
    if (workspaces.length) {
      tools.push(has('yarn.lock') ? 'yarn' : has('bun.lockb') || has('bun.lock') ? 'bun' : 'npm');
      patterns.push(...workspaces);
    }
  } catch {
    // Malformed package.json: no npm workspaces
  }
  try {
    const lerna = JSON.parse(read(path.join(root, 'lerna.json')) || '{}');
    if (Array.isArray(lerna.packages)) {
      tools.push('lerna');
      patterns.push(...lerna.packages);
    }
  } catch {
    // Malformed lerna.json
  }
  if (has('nx.json')) {
    tools.push('nx');
    literalDirs.push(...manifestDirs.filter(dir => fileSet.has(`${dir}/project.json`)));
  }
  if (has('turbo.json')) tools.push('turbo');

  const goWork = read(path.join(root, 'go.work'));
  if (goWork !== null) {
    tools.push('go.work');
    const block = goWork.match(/^use\s*\(([\s\S]*?)\)/m);
    const uses = block ? block[1].split('\n') : [...goWork.matchAll(/^use\s+(\S+)/gm)].map(m => m[1]);
    literalDirs.push(...uses.map(u => u.trim().replace(/^\.\//, '')).filter(u => u && u !== '.' && !u.startsWith('//')));
  }
  const cargoMembers = readTomlMembers(read(path.join(root, 'Cargo.toml')), 'workspace');
  if (cargoMembers.length) {
    tools.push('cargo');
    patterns.push(...cargoMembers);
  }
  const uvMembers = readTomlMembers(read(path.join(root, 'pyproject.toml')), 'tool.uv.workspace');
  if (uvMembers.length) {
    tools.push('uv');
    patterns.push(...uvMembers);
  }

  const include = patterns.filter(p => !p.startsWith('!')).map(toDirMatcher);
  const exclude = patterns.filter(p => p.startsWith('!')).map(p => toDirMatcher(p.slice(1)));
  const dirs = new Set([
    ...manifestDirs.filter(dir => include.some(m => m(dir)) && !exclude.some(m => m(dir))),
    ...literalDirs.filter(dir => manifestDirs.includes(dir))
  ]);
  if (dirs.size < 2) return null;

  const packages = [...dirs].sort().map(dir => {
    const name = readPackageName(root, dir);
    const stacks = detectProject(path.join(root, dir)).stacks;
    const kind = dir.startsWith('apps/') || stacks.some(s => APP_STACKS.has(s)) ? 'app' : 'package';
    return { name, slug: toSlug(name), dir, kind, stacks };
  });

  // Same name in two places (apps/web, packages/web): name both by their folder path instead
  const counts = packages.reduce((map, pkg) => map.set(pkg.slug, (map.get(pkg.slug) || 0) + 1), new Map());
  for (const pkg of packages.filter(p => counts.get(p.slug) > 1)) {
    pkg.slug = toSlug(pkg.dir);
  }

  return { tools: [...new Set(tools)], packages };
}

module.exports = {
  detectWorkspaces,
  toDirMatcher,
  APP_STACKS
};
