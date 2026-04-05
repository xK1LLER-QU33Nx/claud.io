// shims/bun-bundle.ts
// Shim for bun:bundle feature flags
// In real Bun builds, these are compile-time constants
export function feature(name: string): boolean {
  const flags: Record<string, boolean> = {
    WORKFLOW_SCRIPTS: false,
    AGENT_TRIGGERS: false,
    BUDDY: true,
  };
  return flags[name] ?? false;
}

// Inject MACRO globals
declare global {
  var MACRO: {
    VERSION: string;
    BUILD_TIME: string | undefined;
    ISSUES_EXPLAINER: string;
    FEEDBACK_CHANNEL: string;
    NATIVE_PACKAGE_URL: string;
    PACKAGE_URL: string;
    VERSION_CHANGELOG: string;
  };
}
(globalThis as any).MACRO = {
  VERSION: '0.0.0-leaked',
  BUILD_TIME: undefined,
  ISSUES_EXPLAINER: 'https://github.com/anthropics/claude-code/issues',
  FEEDBACK_CHANNEL: '#claude-code-feedback',
  NATIVE_PACKAGE_URL: 'https://claude.ai/download',
  PACKAGE_URL: 'https://www.npmjs.com/package/@anthropic-ai/claude-code',
  VERSION_CHANGELOG: 'https://github.com/anthropics/claude-code/releases',
};
