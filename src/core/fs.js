'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_IGNORED_DIRS } = require('./constants');
const { listGitFiles } = require('./git');

/**
 * Checks if a file or directory exists.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
function exists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Reads UTF-8 content of a file, returning null if reading fails.
 *
 * @param {string} filePath
 * @returns {string|null}
 */
function read(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Writes content to a file, recursively creating directory if needed.
 *
 * @param {string} filePath
 * @param {string} content
 */
function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Converts a string into a URL/path-friendly slug.
 *
 * @param {string} str
 * @returns {string}
 */
function toSlug(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Checks whether a relative file path matches or resides inside a path prefix.
 *
 * @param {string} file - Target file path
 * @param {string} prefix - Candidate directory or file prefix
 * @returns {boolean}
 */
function isPathInside(file, prefix) {
  if (prefix.endsWith('/')) {
    return file.startsWith(prefix);
  }
  return file === prefix || file.startsWith(`${prefix}/`);
}

/**
 * Recursively lists files in a workspace, prioritizing git index and falling back to manual traversal.
 *
 * @param {string} root - Project root directory
 * @param {Set<string>} [ignoredDirs=DEFAULT_IGNORED_DIRS]
 * @returns {string[]} Posix-normalized relative file paths
 */
function listWorkspaceFiles(root, ignoredDirs = DEFAULT_IGNORED_DIRS) {
  const gitFiles = listGitFiles(root);
  if (gitFiles !== null) {
    return gitFiles.filter(file => exists(path.join(root, file)));
  }

  const results = [];
  function walk(currentDir, depth) {
    if (depth > 8) {
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ignoredDirs.has(entry.name)) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else {
        const relativePath = path.relative(root, fullPath).split(path.sep).join('/');
        results.push(relativePath);
      }
    }
  }

  walk(root, 0);
  return results;
}

/**
 * Simple template interpolation for `{{variable}}` patterns.
 *
 * @param {string} template
 * @param {Record<string, any>} variables
 * @returns {string}
 */
function renderTemplate(template, variables) {
  if (!template) {
    return '';
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');
}

module.exports = {
  exists,
  read,
  write,
  toSlug,
  isPathInside,
  listWorkspaceFiles,
  renderTemplate
};
