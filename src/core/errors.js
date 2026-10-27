'use strict';

/**
 * Base error class for all RepoCanon errors.
 */
class RepoCanonError extends Error {
  /**
   * @param {string} message
   * @param {string} [code='ERR_REPOCANON']
   */
  constructor(message, code = 'ERR_REPOCANON') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when configuration is invalid or missing.
 */
class ConfigurationError extends RepoCanonError {
  /**
   * @param {string} message
   * @param {string[]} [details=[]]
   */
  constructor(message, details = []) {
    super(message, 'ERR_CONFIGURATION');
    this.details = details;
  }
}

/**
 * Error thrown when git operations fail or an invalid git ref is provided.
 */
class GitError extends RepoCanonError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message, 'ERR_GIT');
  }
}

/**
 * Error thrown when CLI command argument parsing or execution fails.
 */
class CommandError extends RepoCanonError {
  /**
   * @param {string} message
   * @param {number} [exitCode=2]
   * @param {string} [hint] - what to do about it, shown under the message
   */
  constructor(message, exitCode = 2, hint) {
    super(message, 'ERR_COMMAND');
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

module.exports = {
  RepoCanonError,
  ConfigurationError,
  GitError,
  CommandError
};
