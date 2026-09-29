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
 * Detects and aggregates modules across repository files using presets, folder conventions,
 * and user-defined configuration overrides.
 *
 * @param {string[]} files - List of posix-normalized relative file paths
 * @param {Record<string, any>} config - Resolved project configuration
 * @param {string[]} stacks - Detected project technology stacks
 * @returns {DetectedModule[]} Sorted list of detected modules
 */
function detectModules(files, config = {}, stacks = []) {
  const excludePatterns = config.exclude || [];
  const filteredFiles = files.filter(file => !excludePatterns.some(pattern => isPathInside(file, pattern)));

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
  if (!modulePathMap.size) {
    for (const fallbackRoot of FALLBACK_MODULE_ROOTS) {
      for (const childDir of getDirectChildren(fallbackRoot)) {
        addModulePath(path.basename(childDir), `${childDir}/`);
      }
    }
  }

  // 4. Fallback to top-level directories
  if (!modulePathMap.size) {
    for (const dir of directories) {
      if (!dir.includes('/')) {
        addModulePath(dir, `${dir}/`);
      }
    }
  }

  // 5. Explicit user configuration in .contextforge.json always overrides
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
  detectModules
};
