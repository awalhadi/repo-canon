'use strict';

const { startMcpServer } = require('../../mcp/server');

/**
 * Handles the `contextforge mcp` CLI command.
 */
function handleMcp(context) {
  const { root } = context;
  startMcpServer(root);
}

module.exports = {
  handleMcp
};
