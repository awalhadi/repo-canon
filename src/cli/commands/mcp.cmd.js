'use strict';

const { startMcpServer } = require('../../mcp/server');

/**
 * Handles the `repocanon mcp` CLI command.
 */
function handleMcp(context) {
  const { root } = context;
  startMcpServer(root);
}

module.exports = {
  handleMcp
};
