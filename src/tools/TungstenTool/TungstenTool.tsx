import { type Tool } from '../../Tool.js';

/**
 * Minimal stub for TungstenTool to satisfy imports.
 */
export const TungstenTool: Tool = {
  name: 'tungsten',
  description: 'Tungsten tool stub',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  isEnabled: () => false,
  isDangerous: false,
  execute: async () => ({
    result: 'Tungsten tool is not available in this build.',
  }),
};
