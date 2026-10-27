'use strict';

const path = require('path');
const { toSlug, isPathInside } = require('./fs');
const { PRESETS, GENERIC_MODULE_ROOTS, FALLBACK_MODULE_ROOTS } = require('./presets');
const { NOISE_MODULE_DIRS } = require('./constants');

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

  for (const [, preset] of activePresets) {
    if (preset.roots) {
      roots.push(...preset.roots);
    }
    if (preset.marker) {
      markers.push(preset.marker);
    }
  }

  if (!activePresets.length && !roots.length) {
    roots.push(...GENERIC_MODULE_ROOTS);
  }

  // 1. Process root folders
  for (const root of roots) {
    const normalizedRoot = root.replace(/\/$/, '');
    for (const childDir of getDirectChildren(normalizedRoot)) {
      addModulePath(path.basename(childDir), `${childDir}/`);
    }
  }

  // 2. Process regex markers (e.g. *.module.ts, apps.py)
  for (const markerRegex of markers) {
    for (const file of filteredFiles) {
      if (markerRegex.test(file)) {
        const dir = path.posix.dirname(file);
        if (dir === '.' || dir === 'src' || /(^|\/)migrations$/.test(dir)) {
          continue;
        }
        addModulePath(path.basename(dir), `${dir}/`);
      }
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
  detectProjectModules
};
