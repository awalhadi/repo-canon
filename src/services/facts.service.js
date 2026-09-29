'use strict';

const path = require('path');
const { read } = require('../core/fs');
const { execGit } = require('../core/git');

/**
 * Strips extension for display sampling.
 */
const getBaseNameWithoutExt = file =>
  path.posix.basename(file).replace(/(\.blade)?\.[a-z0-9]+$/i, '');

const createAnchor = (label, regex, mode) => ({ label, re: regex, mode });

const STACK_ANCHORS = {
  Laravel: [
    createAnchor('Routes', /^routes\/[^/]+\.php$/),
    createAnchor('Models', /^app\/Models\/[^/]+\.php$/),
    createAnchor('Enums', /^app\/Enums\/.+\.php$/),
    createAnchor('Policies', /^app\/Policies\/.+\.php$/),
    createAnchor('Middleware', /^app\/Http\/Middleware\/.+\.php$/),
    createAnchor('Form requests', /^app\/Http\/Requests\/.+\.php$/),
    createAnchor('Controllers', /^app\/Http\/Controllers\/.+\.php$/, 'count'),
    createAnchor('Services', /^app\/Services\/.+\.php$/),
    createAnchor('Actions', /^app\/Actions\/.+\.php$/),
    createAnchor('Jobs', /^app\/Jobs\/.+\.php$/),
    createAnchor('Events / Listeners', /^app\/(Events|Listeners)\/.+\.php$/),
    createAnchor('Observers', /^app\/Observers\/.+\.php$/),
    createAnchor('Notifications / Mail', /^app\/(Notifications|Mail)\/.+\.php$/),
    createAnchor('Console commands', /^app\/Console\/Commands\/.+\.php$/),
    createAnchor('Migrations (newest 5)', /^database\/migrations\/.+\.php$/, 'tail'),
    createAnchor('Seeders', /^database\/seeders?\/.+\.php$/),
    createAnchor('Config', /^config\/[^/]+\.php$/),
    createAnchor('Blade views', /^resources\/views\/.+\.blade\.php$/, 'count'),
    createAnchor('Frontend sources', /^resources\/js\/.+\.(vue|js|ts|jsx|tsx)$/, 'count')
  ],
  Vue: [
    createAnchor('Vue components', /\.vue$/, 'count'),
    createAnchor('Router', /(^|\/)router\/.+\.(js|ts)$/),
    createAnchor('Stores', /(^|\/)(store|stores)\/.+\.(js|ts)$/)
  ],
  'Next.js': [
    createAnchor('Pages / routes', /(^|\/)app\/.+\/(page|route)\.(t|j)sx?$/, 'count'),
    createAnchor('Middleware', /(^|\/)middleware\.(t|j)s$/),
    createAnchor('Prisma / schema', /(schema\.prisma|drizzle\.config\.\w+)$/)
  ],
  NestJS: [
    createAnchor('Modules', /\.module\.ts$/),
    createAnchor('Controllers', /\.controller\.ts$/),
    createAnchor('Guards', /\.guard\.ts$/),
    createAnchor('Entities', /\.entity\.ts$/),
    createAnchor('DTOs', /\.dto\.ts$/, 'count')
  ],
  Django: [
    createAnchor('Models', /(^|\/)models(\/.+)?\.py$/),
    createAnchor('URLs', /(^|\/)urls\.py$/),
    createAnchor('Views', /(^|\/)views(\/.+)?\.py$/, 'count'),
    createAnchor('Serializers', /serializers?\.py$/),
    createAnchor('Tasks', /(^|\/)tasks\.py$/)
  ],
  Rails: [
    createAnchor('Routes', /^config\/routes\.rb$/),
    createAnchor('Models', /^app\/models\/.+\.rb$/),
    createAnchor('Policies', /^app\/policies\/.+\.rb$/),
    createAnchor('Jobs', /^app\/jobs\/.+\.rb$/),
    createAnchor('Migrations (newest 5)', /^db\/migrate\/.+\.rb$/, 'tail')
  ],
  Go: [
    createAnchor('Entrypoints', /(^|\/)main\.go$/),
    createAnchor('Go tests', /_test\.go$/, 'count')
  ],
  '*': [
    createAnchor('Tests', /(^|\/)(tests?|__tests__|spec)\/.+|\.(test|spec)\.[a-z]+$|_test\.(go|py)$/i, 'count'),
    createAnchor('CI', /^\.github\/workflows\/.+|^\.gitlab-ci\.yml$/),
    createAnchor('Docker / infra', /(^|\/)(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$/),
    createAnchor('Docs', /^docs?\/.+\.md$/i, 'count'),
    createAnchor('Scripts', /^scripts?\/.+/, 'count')
  ]
};

const TOP_ROLES = {
  app: 'application code',
  bootstrap: 'framework bootstrap · generated cache',
  config: 'configuration',
  database: 'migrations · seeders · factories',
  public: 'web root + compiled assets',
  resources: 'views & frontend source',
  routes: 'route definitions',
  storage: 'runtime files',
  tests: 'test suites',
  test: 'test suites',
  src: 'source root',
  lib: 'libraries',
  docs: 'documentation',
  scripts: 'automation scripts',
  docker: 'container config',
  '.github': 'CI/CD & repo config',
  '.idea': 'IDE config',
  '.vscode': 'IDE config',
  '.cursor': 'agent rules (managed)',
  packages: 'monorepo packages',
  apps: 'monorepo apps',
  'src-tauri': 'Tauri (Rust) backend',
  internal: 'private Go packages',
  cmd: 'Go entrypoints',
  db: 'database',
  dist: 'build output',
  build: 'build output',
  vendor: 'third-party code',
  node_modules: 'third-party code'
};

const SKIP_DIRS = new Set([
  'public',
  'storage',
  'vendor',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.idea',
  '.vscode',
  'bootstrap',
  'target',
  '.venv',
  '__pycache__'
]);

const NOISE_FILE_REGEX = /(^|\/)(public|storage|vendor|node_modules|dist|build|coverage)\/|(^|\/)bootstrap\/cache\/|\.(lock|map|svg|png|jpe?g|gif|ico|woff2?)$|\.min\.(js|css)$|package-lock\.json$/;

/**
 * Extracts architectural anchor file matches and counts for the project.
 */
function extractAnchors(files, stacks) {
  const definitions = [];
  const seenLabels = new Set();

  for (const stack of [...stacks, '*']) {
    for (const anchorDef of STACK_ANCHORS[stack] || []) {
      if (!seenLabels.has(anchorDef.label)) {
        seenLabels.add(anchorDef.label);
        definitions.push(anchorDef);
      }
    }
  }

  return definitions
    .map(def => {
      const matches = files.filter(f => def.re.test(f));
      if (!matches.length) {
        return null;
      }
      const names = [...new Set(matches.map(getBaseNameWithoutExt))];
      const sample =
        def.mode === 'count'
          ? []
          : def.mode === 'tail'
          ? names.slice(-5)
          : names.slice(0, 12);

      const more =
        def.mode || names.length <= sample.length ? 0 : names.length - sample.length;

      return {
        label: def.label,
        count: matches.length,
        sample,
        more
      };
    })
    .filter(Boolean);
}

/**
 * Extracts package dependencies and script names from composer.json and package.json.
 */
function extractPackages(root) {
  const result = {};
  const filterComposerPackages = obj =>
    Object.entries(obj || {}).filter(([k]) => k !== 'php' && !k.startsWith('ext-'));

  try {
    const composerJson = JSON.parse(read(path.join(root, 'composer.json')) || '{}');
    result.composer = filterComposerPackages(composerJson.require).map(([k, v]) => `${k} ${v}`);
    result.composerDev = filterComposerPackages(composerJson['require-dev']).map(([k]) => k);
    result.composerScripts = Object.keys(composerJson.scripts || {});
  } catch {
    // Ignore parse error
  }

  try {
    const pkgJson = JSON.parse(read(path.join(root, 'package.json')) || '{}');
    result.npm = Object.keys(pkgJson.dependencies || {});
    result.npmDev = Object.keys(pkgJson.devDependencies || {});
    result.npmScripts = Object.keys(pkgJson.scripts || {});
  } catch {
    // Ignore parse error
  }

  return result;
}

/**
 * Extracts environment key prefixes (never reading or leaking secret values!).
 */
function extractEnvKeyNames(root) {
  for (const envFileName of ['.env.example', '.env.sample', '.env.dist']) {
    const content = read(path.join(root, envFileName));
    if (content === null) {
      continue;
    }
    const keys = content
      .split('\n')
      .map(line => /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line))
      .filter(Boolean)
      .map(match => match[1]);

    const prefixCounts = new Map();
    for (const key of keys) {
      const prefix = key.split('_')[0];
      prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
    }

    const topPrefixes = [...prefixCounts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([prefix, count]) => `${prefix}(${count})`);

    return {
      file: envFileName,
      total: keys.length,
      prefixes: topPrefixes
    };
  }
  return null;
}

/**
 * Extracts most churned / changed source files from recent Git history.
 */
function extractHotspots(root, fileSet) {
  const logOutput = execGit(root, [
    'log',
    '--no-merges',
    '--name-only',
    '--pretty=format:',
    '-n',
    '300'
  ]);

  if (!logOutput) {
    return [];
  }

  const counts = new Map();
  for (const file of logOutput.split('\n')) {
    if (file && fileSet.has(file) && !NOISE_FILE_REGEX.test(file)) {
      counts.set(file, (counts.get(file) || 0) + 1);
    }
  }

  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10);
}

/**
 * Extracts git repository metadata.
 */
function extractGitMetadata(root) {
  return {
    total: execGit(root, ['rev-list', '--count', 'HEAD']),
    since: (execGit(root, ['log', '--max-parents=0', '--format=%cs']) || '')
      .split('\n')
      .pop(),
    branch: execGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: (execGit(root, ['status', '--porcelain']) || '')
      .split('\n')
      .filter(Boolean).length,
    recent: (execGit(root, ['log', '-n', '8', '--no-merges', '--format=%cs  %s']) || '')
      .split('\n')
      .filter(Boolean)
      .map(s => s.slice(0, 110))
  };
}

/**
 * Reads project title/description from README.md.
 */
function extractReadmeTitle(root) {
  for (const fileName of ['README.md', 'readme.md', 'README']) {
    const text = read(path.join(root, fileName));
    if (text !== null) {
      const match = /^#\s+(.+)$/m.exec(text);
      return (match ? match[1] : text.split('\n').find(l => l.trim()) || '')
        .trim()
        .slice(0, 120);
    }
  }
  return null;
}

/**
 * Collects all deterministic project facts.
 *
 * @param {string} root - Project root
 * @param {Record<string, any>} overview - Project overview
 * @returns {Record<string, any>}
 */
function collectProjectFacts(root, overview) {
  const fileSet = new Set(overview.files);

  const topDirs = Object.entries(overview.top)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dir, count]) => ({
      path: dir,
      files: count,
      role: dir.startsWith('(') ? 'repo root files' : TOP_ROLES[dir] || '—',
      skip: SKIP_DIRS.has(dir)
    }));

  const skipList = [
    ...new Set([
      ...topDirs.filter(t => t.skip).map(t => `${t.path}/`),
      'lockfiles',
      '*.min.*',
      '*.map',
      'compiled/vendored assets'
    ])
  ];

  return {
    top: topDirs,
    skip: skipList,
    anchors: extractAnchors(overview.files, overview.d.stacks),
    packages: extractPackages(root),
    env: extractEnvKeyNames(root),
    hot: extractHotspots(root, fileSet),
    git: extractGitMetadata(root),
    readme: extractReadmeTitle(root)
  };
}

module.exports = {
  collectProjectFacts,
  facts: collectProjectFacts,
  TOP_ROLES,
  SKIP_DIRS
};
