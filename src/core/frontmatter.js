'use strict';

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Parses simple YAML-style frontmatter headers from markdown text.
 *
 * @param {string} text - Markdown file text
 * @returns {Record<string, any>} Parsed key-value pairs
 */
function parseFrontmatter(text) {
  const result = {};
  const match = FRONTMATTER_REGEX.exec(text || '');
  if (!match) {
    return result;
  }

  const rawLines = match[1].split(/\r?\n/);
  for (const line of rawLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex < 0) {
      continue;
    }
    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Check for inline array syntax: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Strips the frontmatter block from markdown text.
 *
 * @param {string} text
 * @returns {string} Text without leading frontmatter
 */
function stripFrontmatter(text) {
  return (text || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

/**
 * Updates or inserts a key-value pair in a document's frontmatter.
 *
 * @param {string} text - Document content
 * @param {string} key - Frontmatter key to update or insert
 * @param {string|number} value - New value
 * @returns {string} Updated document content
 */
function setFrontmatterValue(text, key, value) {
  const match = FRONTMATTER_REGEX.exec(text || '');
  if (!match) {
    return `---\n${key}: ${value}\n---\n${text || ''}`;
  }

  const fmBody = match[1];
  const keyRegex = new RegExp(`^${key}:.*$`, 'm');
  const updatedBody = keyRegex.test(fmBody)
    ? fmBody.replace(keyRegex, `${key}: ${value}`)
    : `${fmBody}\n${key}: ${value}`;

  return text.replace(match[0], () => `---\n${updatedBody}\n---`);
}

module.exports = {
  parseFrontmatter,
  stripFrontmatter,
  setFrontmatterValue
};
