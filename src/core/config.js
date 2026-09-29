'use strict';

const path = require('path');
const { read } = require('./fs');
const { PRESETS } = require('./presets');

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
 * Validates a configuration object against expected schema.
 *
 * @param {Record<string, any>} config - Configuration to validate
 * @returns {string[]} List of validation error messages (empty if valid)
 */
function validateConfig(config) {
  const errors = [];
  const knownKeys = new Set([...Object.keys(DEFAULT_CONFIG), '_found']);

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
 * Loads and validates .repocanon.json (or legacy .contextforge.json) from a project root.
 * Sanitizes and falls back to safe defaults if file is missing or invalid.
 *
 * @param {string} root - Project root directory
 * @returns {typeof DEFAULT_CONFIG & { _found: boolean }}
 */
function loadConfig(root) {
  let configPath = path.join(root, '.repocanon.json');
  let rawText = read(configPath);

  if (!rawText) {
    const legacyPath = path.join(root, '.contextforge.json');
    const legacyText = read(legacyPath);
    if (legacyText) {
      configPath = legacyPath;
      rawText = legacyText;
    }
  }

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
  }

  return config;
}

module.exports = {
  DEFAULT_CONFIG,
  validateConfig,
  loadConfig
};
