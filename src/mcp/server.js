'use strict';

const readline = require('readline');
const pkg = require('../../package.json');
const { MCP_TOOLS, executeTool } = require('./tools');

/**
 * Starts the MCP stdio JSON-RPC 2.0 server.
 *
 * @param {string} root - Project root directory
 */
function startMcpServer(root) {
  const sendMessage = payload => {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...payload })}\n`);
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', line => {
    if (!line.trim()) {
      return;
    }

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      sendMessage({
        id: null,
        error: { code: -32700, message: 'parse error' }
      });
      return;
    }

    const { id, method, params } = message;

    // Notifications require no response
    if (id === undefined) {
      return;
    }

    try {
      if (method === 'initialize') {
        sendMessage({
          id,
          result: {
            protocolVersion: (params && params.protocolVersion) || '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'repocanon', version: pkg.version }
          }
        });
        return;
      }

      if (method === 'ping') {
        sendMessage({ id, result: {} });
        return;
      }

      if (method === 'tools/list') {
        sendMessage({
          id,
          result: { tools: MCP_TOOLS }
        });
        return;
      }

      if (method === 'tools/call') {
        try {
          const toolResult = executeTool(root, params.name, params.arguments);
          sendMessage({
            id,
            result: {
              content: [{ type: 'text', text: toolResult }]
            }
          });
        } catch (toolError) {
          sendMessage({
            id,
            result: {
              isError: true,
              content: [{ type: 'text', text: String(toolError.message) }]
            }
          });
        }
        return;
      }

      sendMessage({
        id,
        error: { code: -32601, message: `method not found: ${method}` }
      });
    } catch (unexpectedError) {
      sendMessage({
        id,
        error: { code: -32603, message: String(unexpectedError.message) }
      });
    }
  });
}

module.exports = {
  startMcpServer,
  start: startMcpServer
};
