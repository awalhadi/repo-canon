'use strict';

const path = require('path');
const { read, write } = require('./fs');
const { PRESETS } = require('./presets');
const { TARGET_IDS } = require('./targets');

const CONFIG_FILE = '.repocanon.json';

/**
 * Default configuration structure for RepoCanon.
 */
const DEFAULT_CONFIG = {
  preset: 'auto',
  moduleRoots: [],
  modules: {},
  exclude: []
};

/**
 * Optional keys: absent means "not chosen yet", which callers treat differently
 * from an empty value (e.g. `targets` absent = legacy all-pointers behaviour).
 */
const OPTIONAL_KEYS = ['targets', 'nestedAgents', 'drift', 'driftIgnore'];

/**
 * Validates a configuration object against expected schema.
 *
 * @param {Record<string, any>} config - Configuration to validate
 * @returns {string[]} List of validation error messages (empty if valid)
 */
function validateConfig(config) {
  const errors = [];
  const knownKeys = new Set([...Object.keys(DEFAULT_CONFIG), ...OPTIONAL_KEYS, '_found']);

  for (const key of Object.keys(config)) {
    if (!knownKeys.has(key)) {
      errors.push(`unknown key "${key}"`);
    }
  }

  if (config.preset !== 'auto' && !PRESETS[config.preset]) {
    const validPresets = Object.keys(PRESETS).join('|');
    errors.push(`preset "${config.preset}" unknown (use auto or ${validPresets})`);
  }

  if (!Array.isArray(config.moduleRoots)) {
    errors.push('moduleRoots must be an array');
  }

  if (!Array.isArray(config.exclude)) {
    errors.push('exclude must be an array');
  }

  if (config.drift !== undefined && !['significant', 'all'].includes(config.drift)) {
    errors.push('drift must be "significant" (default) or "all"');
  }

  if (config.driftIgnore !== undefined && (!Array.isArray(config.driftIgnore) || config.driftIgnore.some(p => typeof p !== 'string'))) {
    errors.push('driftIgnore must be an array of path patterns');
  }

  if (config.nestedAgents !== undefined && typeof config.nestedAgents !== 'boolean') {
    errors.push('nestedAgents must be true or false');
  }

  if (config.targets !== undefined) {
    if (!Array.isArray(config.targets)) {
      errors.push('targets must be an array');
    } else {
      for (const id of config.targets) {
        if (!TARGET_IDS.includes(id)) {
          errors.push(`target "${id}" unknown (use ${TARGET_IDS.join('|')})`);
        }
      }
    }
  }

  if (typeof config.modules !== 'object' || Array.isArray(config.modules) || !config.modules) {
    errors.push('modules must be an object');
  } else {
    for (const [moduleName, paths] of Object.entries(config.modules)) {
      if (!Array.isArray(paths)) {
        errors.push(`modules.${moduleName} must be an array of paths`);
      }
    }
  }

  return errors;
}

/**
 * Loads and validates .repocanon.json from a project root.
 * Sanitizes and falls back to safe defaults if file is missing or invalid.
 *
 * @param {string} root - Project root directory
 * @returns {typeof DEFAULT_CONFIG & { _found: boolean }}
 */
function loadConfig(root) {
  const configPath = path.join(root, CONFIG_FILE);
  const rawText = read(configPath);

  if (!rawText) {
    return { ...DEFAULT_CONFIG, _found: false };
  }

  const baseFileName = path.basename(configPath);
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    console.error(`repocanon: invalid ${baseFileName} (${error.message}) — using defaults`);
    return { ...DEFAULT_CONFIG, _found: false };
  }

  const config = { ...DEFAULT_CONFIG, ...parsed, _found: true };
  const validationErrors = validateConfig(config);

  if (validationErrors.length > 0) {
    // Sanitize modules map
    if (typeof config.modules === 'object' && !Array.isArray(config.modules) && config.modules) {
      config.modules = Object.fromEntries(
        Object.entries(config.modules).filter(([, v]) => Array.isArray(v))
      );
    } else {
      config.modules = {};
    }

    if (!Array.isArray(config.moduleRoots)) {
      config.moduleRoots = [];
    }

    if (!Array.isArray(config.exclude)) {
      config.exclude = [];
    }

    if (config.preset !== 'auto' && !PRESETS[config.preset]) {
      config.preset = 'auto';
    }

    if (typeof config.nestedAgents !== 'boolean') {
      delete config.nestedAgents;
    }

    if (!['significant', 'all'].includes(config.drift)) {
      delete config.drift;
    }

    if (!Array.isArray(config.driftIgnore)) {
      delete config.driftIgnore;
    } else {
      config.driftIgnore = config.driftIgnore.filter(p => typeof p === 'string');
    }

    if (config.targets !== undefined) {
      config.targets = Array.isArray(config.targets)
        ? config.targets.filter(id => TARGET_IDS.includes(id))
        : undefined;
    }
  }

  return config;
}

/**
 * Merges `patch` into .repocanon.json on disk, keeping every other key and its order.
 * Never overwrites a file it cannot parse — the user's config is not ours to discard.
 *
 * @param {string} root - Project root directory
 * @param {Record<string, any>} patch
 * @returns {{ status: 'created'|'updated'|'unchanged'|'invalid', error?: string }}
 */
function updateConfigFile(root, patch) {
  const configPath = path.join(root, CONFIG_FILE);
  const rawText = read(configPath);
  let current = {};

  if (rawText) {
    try {
      current = JSON.parse(rawText);
    } catch (error) {
      return { status: 'invalid', error: `${CONFIG_FILE} is not valid JSON (${error.message}) — left untouched` };
    }
  } else {
    current = { ...DEFAULT_CONFIG };
  }

  const next = { ...current, ...patch };
  const nextText = `${JSON.stringify(next, null, 2)}\n`;
  if (rawText && JSON.stringify(current) === JSON.stringify(next)) {
    return { status: 'unchanged' };
  }
  write(configPath, nextText);
  return { status: rawText ? 'updated' : 'created' };
}

module.exports = {
  DEFAULT_CONFIG,
  validateConfig,
  loadConfig,
  updateConfigFile
};
