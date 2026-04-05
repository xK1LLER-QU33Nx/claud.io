#!/bin/bash
# scripts/generate_missing_stubs.sh — Create minimalist stubs for all 22+ missing files

set -e

SRC_DIR="src"

echo "[postinstall] Creating missing source file stubs..."

# Helper to create/touch files
create_stub() {
    local file="$1"
    local content="$2"
    mkdir -p "$(dirname "$SRC_DIR/$file")"
    if [ ! -f "$SRC_DIR/$file" ]; then
        echo "$content" > "$SRC_DIR/$file"
        echo "  Created: $file"
    fi
}

# ── Global & Shims ──────────────────────────────────────────────────────────
create_stub "global.d.ts" "declare var MACRO: any; declare function feature(name: string): boolean;"
create_stub "utils/protectedNamespace.ts" "export const PROTECTED_NAMESPACE_PREFIX = 'claude-';"
create_stub "utils/useEffectEvent.ts" "export function useEffectEvent<T extends Function>(fn: T): T { return fn; }"

# ── SDK Types ──────────────────────────────────────────────────────────────
create_stub "entrypoints/sdk/coreTypes.generated.ts" "export type BetaContentBlock = any;"
create_stub "entrypoints/sdk/runtimeTypes.ts" "export type RuntimeConfig = any;"
create_stub "entrypoints/sdk/toolTypes.ts" "export type ToolDefinition = any;"

# ── Tools ──────────────────────────────────────────────────────────────────
# REPL Tool
create_stub "tools/REPLTool/REPLTool.ts" "import { type Tool } from '../../Tool.js'; export const REPLTool: Tool = { name: 'repl', description: 'REPL stub', inputSchema: { type: 'object' }, isEnabled: () => false, isDangerous: false, execute: async () => ({ result: '' }) };"
# SuggestBackgroundPR Tool
create_stub "tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.ts" "import { type Tool } from '../../Tool.js'; export const SuggestBackgroundPRTool: Tool = { name: 'suggest_pr', description: 'PR stub', inputSchema: { type: 'object' }, isEnabled: () => false, isDangerous: false, execute: async () => ({ result: '' }) };"
# VerifyPlanExecution Tool
create_stub "tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.ts" "import { type Tool } from '../../Tool.js'; export const VerifyPlanExecutionTool: Tool = { name: 'verify_plan', description: 'Verify stub', inputSchema: { type: 'object' }, isEnabled: () => false, isDangerous: false, execute: async () => ({ result: '' }) };"
# Workflow Tool
create_stub "tools/WorkflowTool/WorkflowTool.ts" "import { type Tool } from '../../Tool.js'; export const WorkflowTool: Tool = { name: 'workflow', description: 'Workflow stub', inputSchema: { type: 'object' }, isEnabled: () => false, isDangerous: false, execute: async () => ({ result: '' }) };"
create_stub "tools/WorkflowTool/constants.ts" "export const WORKFLOW_TOOL_NAME = 'workflow';"
# Tungsten Tool
create_stub "tools/TungstenTool/TungstenLiveMonitor.tsx" "import React from 'react'; export const TungstenLiveMonitor = () => null;"

# ── Commands ───────────────────────────────────────────────────────────────
create_stub "commands/agents-platform/index.ts" "export const agentsPlatformCommands = [];"
create_stub "commands/assistant/assistant.ts" "export const assistantCommands = [];"

# ── UI Components ──────────────────────────────────────────────────────────
create_stub "components/agents/SnapshotUpdateDialog.tsx" "import React from 'react'; export const SnapshotUpdateDialog = () => null;"
create_stub "assistant/AssistantSessionChooser.tsx" "import React from 'react'; export const AssistantSessionChooser = () => null;"

# ── Services & Context ─────────────────────────────────────────────────────
create_stub "services/compact/snipCompact.ts" "export const snipCompact = (x: string) => x;"
create_stub "services/compact/cachedMicrocompact.ts" "export const cachedMicrocompact = (x: string) => x;"
create_stub "services/contextCollapse/index.ts" "export const collapseContext = (x: any) => x;"

# ── Junk/Misc ──────────────────────────────────────────────────────────────
create_stub "ink/devtools.ts" "export const initDevTools = () => {};"
create_stub "skills/bundled/verify/SKILL.md" "# Verify Skill"
create_stub "skills/bundled/verify/examples/cli.md" "example"
create_stub "skills/bundled/verify/examples/server.md" "example"
create_stub "utils/filePersistence/types.ts" "export type PersistenceFile = any;"
create_stub "utils/ultraplan/prompt.txt" "minimal prompt"

echo "[postinstall] All stubs created."
