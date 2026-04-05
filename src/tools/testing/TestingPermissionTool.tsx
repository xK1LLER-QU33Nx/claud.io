import { type Tool } from '../../Tool.js';

/**
 * Minimal stub for TestingPermissionTool to satisfy imports.
 */
export const TestingPermissionTool: Tool = {
  name: 'testing_permission',
  description: 'Testing permission tool stub',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  isEnabled: () => false,
  isDangerous: false,
  execute: async () => ({
    result: 'Testing tool is not available in this build.',
  }),
};