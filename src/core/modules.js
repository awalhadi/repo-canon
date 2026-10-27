'use strict';

const path = require('path');
const { toSlug, isPathInside } = require('./fs');
const { PRESETS, LAYER_DIRS, GENERIC_MODULE_ROOTS, FALLBACK_MODULE_ROOTS } = require('./presets');
const { NOISE_MODULE_DIRS } = require('./constants');
const { classifyPath } = require('./drift');

/** File names that are plumbing in every layer, never a domain. */
const GENERIC_STEMS = new Set([
  'index', 'init', 'base', 'main', 'dep', 'deps', 'dependency', 'api', 'config', 'setting', 'util', 'helper',
  'common', 'core', 'app', 'controller', 'model', 'schema', 'router', 'route', 'service', 'session', 'database', 'db'
]);
const ROLE_SUFFIX = /(Controller|Request|Resource|Collection|Policy|Observer|Service|Repository|Repo|Handler|Job|Listener|Action|Router|Routes|Schema|Schemas|Crud|Endpoints?|_service|_repository|_repo|_handler|_router|_routes|_schemas?|_models?|_crud|_store|_endpoints?)$/;
const VERB_PREFIX = /^(Store|Update|Create|Delete|Destroy|Index|Show|Edit|List|Get)(?=[A-Z])/;

/**
 * The domain a layer file is about: InvoiceController.php, StoreInvoiceRequest.php and
 * Invoice.php are all `invoice`; users.py and user_service.go are `user`. Null for plumbing.
 *
 * @param {string} file
 * @returns {string|null}
 */
function getFileStem(file) {
  const base = path.posix.basename(file).replace(/\..*$/, '');
  const stripped = base.replace(VERB_PREFIX, '').replace(ROLE_SUFFIX, '');
  let slug = toSlug(stripped.replace(/([a-z0-9])([A-Z])/g, '$1-$2'));
  if (slug.endsWith('ies')) slug = `${slug.slice(0, -3)}y`;
  else if (slug.endsWith('s') && !slug.endsWith('ss') && slug.length > 3) slug = slug.slice(0, -1);
  return slug && !GENERIC_STEMS.has(slug) ? slug : null;
}

/**
 * @param {string} pattern - a folder, where `*` matches one path segment
 * @returns {RegExp}
 */
const toLayerRegex = pattern =>
  new RegExp(`^${pattern.split('/').map(part => (part === '*' ? '[^/]+' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))).join('/')}$`);

/**
 * @typedef {Object} DetectedModule
 * @property {string} slug - Module identifier
 * @property {string[]} paths - Directory paths associated with this module
 * @property {number} files - Count of matching files in repository
 */

/**
 * Modules of one project (a single-package repo, or one app inside a monorepo).
 *
 * @param {string[]} filteredFiles - posix relative paths, already filtered by `exclude`
 * @param {Record<string, any>} config
 * @param {string[]} stacks
 * @param {{ fallback?: boolean }} [options={}] - fallback: false keeps only what presets,
 *   module roots and markers find (no src/* or top-level guesses)
 * @returns {Map<string, Set<string>>} slug → paths
 */
function detectProjectModules(filteredFiles, config = {}, stacks = [], options = {}) {
  const directories = new Set();
  for (const file of filteredFiles) {
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i++) {
      directories.add(parts.slice(0, i).join('/'));
    }
  }

  const getDirectChildren = basePath => {
    const baseWithSlash = `${basePath}/`;
    const expectedDepth = basePath.split('/').length + 1;
    return [...directories].filter(
      dir => dir.startsWith(baseWithSlash) && dir.split('/').length === expectedDepth
    );
  };

  const modulePathMap = new Map();

  const addModulePath = (rawName, modulePath) => {
    const cleanedName = String(rawName).replace(/^\((.*)\)$/, '$1');
    const moduleSlug = toSlug(cleanedName);

    if (!moduleSlug || NOISE_MODULE_DIRS.has(moduleSlug)) {
      return;
    }

    if (!modulePathMap.has(moduleSlug)) {
      modulePathMap.set(moduleSlug, new Set());
    }
    modulePathMap.get(moduleSlug).add(modulePath);
  };

  // Determine active preset(s)
  const activePresets = Object.entries(PRESETS).filter(([key, preset]) =>
    config.preset === 'auto' ? preset.match(stacks) : key === config.preset
  );

  const roots = [...(config.moduleRoots || [])];
  const markers = [];
  const layers = [];
  let walkLayerDirs = false;
  let appRouter = false;

  for (const [, preset] of activePresets) {
    if (preset.roots) {
      roots.push(...preset.roots);
    }
    if (preset.marker) {
      markers.push(preset.marker);
    }
    if (preset.layers) {
      layers.push(...preset.layers.map(toLayerRegex));
    }
    walkLayerDirs = walkLayerDirs || Boolean(preset.layerDirs);
    appRouter = appRouter || Boolean(preset.appRouter);
  }

  if (!activePresets.length && !roots.length) {
    roots.push(...GENERIC_MODULE_ROOTS);
  }

  // 1. Process root folders (walking through layer folders such as internal/service/)
  for (const root of roots) {
    const normalizedRoot = root.replace(/\/$/, '');
    for (const childDir of getDirectChildren(normalizedRoot)) {
      if (walkLayerDirs && LAYER_DIRS.has(path.basename(childDir))) {
        for (const nested of getDirectChildren(childDir)) {
          addModulePath(path.basename(nested), `${nested}/`);
        }
        continue;
      }
      addModulePath(path.basename(childDir), `${childDir}/`);
    }
  }

  // 1b. Next.js App Router: route segments are modules; (groups) are walked through,
  // _private, [dynamic], @slots and (.)intercepts are not domains, api/<x> joins route <x>
  if (appRouter) {
    const walkRoutes = (base, isApi) => {
      for (const childDir of getDirectChildren(base)) {
        const name = path.basename(childDir);
        if (/^\([^.].*\)$/.test(name)) {
          walkRoutes(childDir, isApi);
        } else if (name === 'api' && !isApi) {
          walkRoutes(childDir, true);
        } else if (!/^[_[@(]/.test(name)) {
          addModulePath(name, `${childDir}/`);
        }
      }
    };
    for (const appDir of ['app', 'src/app']) {
      const isAppRouter = filteredFiles.some(f => f.startsWith(`${appDir}/`) && /^(layout|page)\.[jt]sx?$/.test(f.slice(appDir.length + 1)));
      if (isAppRouter) walkRoutes(appDir, false);
    }
  }

  // 2. Process regex markers (e.g. *.module.ts, apps.py)
  for (const markerRegex of markers) {
    for (const file of filteredFiles) {
      if (markerRegex.test(file)) {
        const dir = path.posix.dirname(file);
        // app.module.ts is the application shell (src/, or src/app/ in Nx), not a domain
        if (dir === '.' || dir === 'src' || /(^|\/)migrations$/.test(dir) || /(^|\/)app\.module\.ts$/.test(file)) {
          continue;
        }
        addModulePath(path.basename(dir), `${dir}/`);
      }
    }
  }

  // 2b. Layered apps: a name found in two or more layers is a domain
  if (layers.length) {
    const stems = new Map();
    for (const file of filteredFiles) {
      const layerIndex = layers.findIndex(re => re.test(path.posix.dirname(file)));
      if (layerIndex < 0 || classifyPath(file) === 'tests') continue;
      const stem = getFileStem(file);
      if (!stem) continue;
      if (!stems.has(stem)) stems.set(stem, { layers: new Set(), files: [] });
      stems.get(stem).layers.add(layerIndex);
      stems.get(stem).files.push(file);
    }
    for (const [stem, { layers: found, files }] of stems) {
      if (found.size < 2) continue;
      for (const file of files) addModulePath(stem, file);
    }
  }

  // 3. Fallback roots if nothing detected
  if (!modulePathMap.size && options.fallback !== false) {
    for (const fallbackRoot of FALLBACK_MODULE_ROOTS) {
      for (const childDir of getDirectChildren(fallbackRoot)) {
        addModulePath(path.basename(childDir), `${childDir}/`);
      }
    }
  }

  // 4. Fallback to top-level directories
  if (!modulePathMap.size && options.fallback !== false) {
    for (const dir of directories) {
      if (!dir.includes('/')) {
        addModulePath(dir, `${dir}/`);
      }
    }
  }

  return modulePathMap;
}

/**
 * Modules of a monorepo: each library package is one module; an app with two or more
 * features is split into `<app>-<feature>` modules, otherwise it is one module.
 * Files outside the packages (root tooling) belong to no module.
 *
 * @param {string[]} filteredFiles
 * @param {{ packages: Array<{ slug: string, dir: string, kind: string, stacks: string[] }> }} workspaces
 * @returns {Map<string, Set<string>>}
 */
function detectWorkspaceModules(filteredFiles, workspaces) {
  const modulePathMap = new Map();
  for (const pkg of workspaces.packages) {
    const prefix = `${pkg.dir}/`;
    if (pkg.kind === 'app') {
      const appFiles = filteredFiles.filter(f => f.startsWith(prefix)).map(f => f.slice(prefix.length));
      const features = detectProjectModules(appFiles, { preset: 'auto' }, pkg.stacks, { fallback: false });
      if (features.size >= 2) {
        for (const [feature, paths] of features) {
          modulePathMap.set(`${pkg.slug}-${feature}`, new Set([...paths].map(p => `${prefix}${p}`)));
        }
        continue;
      }
    }
    modulePathMap.set(pkg.slug, new Set([prefix]));
  }
  return modulePathMap;
}

/**
 * Detects and aggregates modules across repository files using presets, folder conventions,
 * monorepo packages and user-defined configuration overrides.
 *
 * @param {string[]} files - List of posix-normalized relative file paths
 * @param {Record<string, any>} config - Resolved project configuration
 * @param {string[]} stacks - Detected project technology stacks
 * @param {ReturnType<typeof import('./workspaces').detectWorkspaces>} [workspaces=null]
 * @returns {DetectedModule[]} Sorted list of detected modules
 */
function detectModules(files, config = {}, stacks = [], workspaces = null) {
  const excludePatterns = config.exclude || [];
  const filteredFiles = files.filter(file => !excludePatterns.some(pattern => isPathInside(file, pattern)));

  // A chosen preset or explicit module roots mean the user has said how to split the repo
  const useWorkspaces = workspaces && (config.preset || 'auto') === 'auto' && !(config.moduleRoots || []).length;
  const modulePathMap = useWorkspaces
    ? detectWorkspaceModules(filteredFiles, workspaces)
    : detectProjectModules(filteredFiles, config, stacks);

  // Explicit user configuration in .repocanon.json always overrides
  for (const [name, paths] of Object.entries(config.modules || {})) {
    modulePathMap.set(toSlug(name), new Set(paths));
  }

  // Aggregate results and count associated files
  return [...modulePathMap]
    .map(([slug, pathSet]) => {
      const paths = [...pathSet].sort();
      const fileCount = filteredFiles.filter(f => paths.some(p => isPathInside(f, p))).length;
      return {
        slug,
        paths,
        files: fileCount
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

module.exports = {
  detectModules,
  detectProjectModules,
  getFileStem
};
