# EDUCATIONAL PURPOSES ONLY

The whole purpose of this repository is to learn how AI-powered coding assistants work and to experiment with connecting them to alternative providers. See [DISCLAIMER.md](DISCLAIMER.md) for details.

**[Leer en Espanol](README.md)**

---

# Claud.io CLI

Terminal tool that integrates AI directly into your development workflow. Edit code, run tests, and manage projects using natural language. Compatible with multiple AI providers.

## Requirements

- [Bun](https://bun.sh) v1.0+
- [Node.js](https://nodejs.org) v18+ (for `npm link`)
- Git

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [AI Providers](#ai-providers)
  - [Anthropic (default)](#anthropic-default)
  - [Ollama (local models)](#ollama-local-models)
  - [OpenRouter](#openrouter)
  - [VS Code Bridge](#vs-code-bridge)
  - [AWS Bedrock](#aws-bedrock)
  - [Google Vertex AI](#google-vertex-ai)
  - [Azure Foundry](#azure-foundry)
- [CLI Flags](#cli-flags)
- [Slash Commands](#slash-commands)
- [Memory & Context](#memory--context)
- [MCP Extensibility](#mcp-extensibility)
- [Building Binaries](#building-binaries)
- [Troubleshooting](#troubleshooting)

---

## Installation

The CLI installs as a global command called `claudio` (to distinguish it from the official `claude` by Anthropic).

### macOS / Linux

```bash
# 1. Clone and install dependencies
git clone <repo-url>
cd claud.io
npm install

# 2. Register as global command
sudo npm link

# 3. Verify
claudio --help
```

**Alternative without sudo — shell alias:**

```bash
# zsh (macOS default)
echo 'alias claudio="bun run /path/to/claud.io/src/index.ts"' >> ~/.zshrc
source ~/.zshrc

# bash (Linux default)
echo 'alias claudio="bun run /path/to/claud.io/src/index.ts"' >> ~/.bashrc
source ~/.bashrc
```

### Windows

```powershell
cd C:\path\to\claud.io
npm install
npm link
claudio --help
```

**Alternative — PowerShell function:**

Add this to your profile (`notepad $PROFILE`):

```powershell
function claudio { bun run C:\path\to\claud.io\src\index.ts $args }
```

---

## Quick Start

```bash
# Interactive mode (REPL)
claudio

# Non-interactive mode — responds and exits
claudio -p "Summarize the index.js file"
```

---

## AI Providers

Claud.io supports 7 providers. They are activated via environment variables. When multiple are active, the first match in this order wins:

| Priority | Environment Variable | Provider |
|:-:|---|---|
| 1 | `CLAUDE_CODE_USE_OLLAMA=true` | Ollama (local) |
| 2 | `CLAUDE_CODE_USE_OPENROUTER=true` | OpenRouter |
| 3 | `CLAUDE_CODE_USE_VSCODE=true` | VS Code Bridge |
| 4 | `CLAUDE_CODE_USE_BEDROCK=true` | AWS Bedrock |
| 5 | `CLAUDE_CODE_USE_VERTEX=true` | Google Vertex AI |
| 6 | `CLAUDE_CODE_USE_FOUNDRY=true` | Azure Foundry |
| 7 | *(none)* | Anthropic API (default) |

---

### Anthropic (default)

Direct access to Claude models via the Anthropic API. No extra configuration needed if you already have your API key.

```bash
ANTHROPIC_API_KEY=sk-ant-... claudio
```

---

### Ollama (local models)

Run models on your machine with no internet connection. Requires [Ollama](https://ollama.ai) installed.

**Setup:**

```bash
# Install Ollama
brew install ollama          # macOS
# curl -fsSL https://ollama.ai/install.sh | sh   # Linux

# Start server (keep it running)
ollama serve

# Download a model
ollama pull llama3.2
```

**Use with Claud.io:**

```bash
# Default model (llama3.2)
CLAUDE_CODE_USE_OLLAMA=true claudio

# Specific model
CLAUDE_CODE_USE_OLLAMA=true OLLAMA_MODEL=codellama claudio

# Remote server
CLAUDE_CODE_USE_OLLAMA=true OLLAMA_HOST=http://192.168.1.100:11434 claudio
```

| Variable | Description | Default |
|---|---|---|
| `OLLAMA_HOST` | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Model to use | `llama3.2` |

**Recommended models:**

```bash
ollama pull llama3.2          # General purpose, good and fast
ollama pull codellama          # Code-specialized
ollama pull deepseek-coder-v2  # Good for programming
ollama pull qwen2.5-coder      # Code alternative
```

> **Note:** Tool use is sent as plain text. Performance depends on the local model's ability to follow tool instructions.

---

### OpenRouter

Access to 200+ models from multiple providers via [OpenRouter](https://openrouter.ai). You need a free API key.

```bash
CLAUDE_CODE_USE_OPENROUTER=true OPENROUTER_API_KEY=sk-or-... claudio
```

| Variable | Description | Default |
|---|---|---|
| `OPENROUTER_API_KEY` | **Required.** Your API key | - |
| `OPENROUTER_MODEL` | Model to use | `anthropic/claude-sonnet-4` |
| `OPENROUTER_BASE_URL` | API base URL | `https://openrouter.ai/api/v1` |

**Examples with different models:**

```bash
# Claude
CLAUDE_CODE_USE_OPENROUTER=true OPENROUTER_API_KEY=sk-or-... \
  OPENROUTER_MODEL=anthropic/claude-sonnet-4 claudio

# GPT-4o
CLAUDE_CODE_USE_OPENROUTER=true OPENROUTER_API_KEY=sk-or-... \
  OPENROUTER_MODEL=openai/gpt-4o claudio

# Llama 3.1 405B
CLAUDE_CODE_USE_OPENROUTER=true OPENROUTER_API_KEY=sk-or-... \
  OPENROUTER_MODEL=meta-llama/llama-3.1-405b-instruct claudio
```

---

### VS Code Bridge

Use models available inside VS Code (GitHub Copilot, Azure AI, etc.) without needing additional API keys. Works through a VS Code extension that exposes models via WebSocket.

**How it works:**

```
VS Code (with Copilot/models)
    |
    v
Claud.ia Bridge Extension (WebSocket server on port 7862)
    |
    v
Claud.io CLI (connects as WebSocket client)
```

**Step-by-step setup:**

1. **Install the extension** in VS Code:
   - Open the `claudia-bridge/packages/vscode-extension/` folder in VS Code
   - Press `F5` to run in development mode, or package and install the extension
   - The extension auto-starts and launches the server at `ws://localhost:7862`

2. **Verify the bridge is active:**
   - In VS Code, open the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
   - Search for "Claud.ia: Start Model Bridge" (it auto-starts, but you can restart it manually)

3. **Connect Claud.io:**

```bash
CLAUDE_CODE_USE_VSCODE=true claudio
```

| Variable | Description | Default |
|---|---|---|
| `VSCODE_BRIDGE_URL` | Bridge WebSocket URL | `ws://localhost:7862/models` |
| `VSCODE_BRIDGE_MODEL` | Model to use | `copilot:gpt-4o` |

**Use a different model:**

```bash
CLAUDE_CODE_USE_VSCODE=true VSCODE_BRIDGE_MODEL=copilot:claude-3.5-sonnet claudio
```

> **Important:** VS Code must be open with the extension active before running `claudio`. If the extension isn't running, the WebSocket connection will fail.

For more details about the extension, see the [Claud.ia Bridge README](claudia-bridge/README.md).

---

### AWS Bedrock

Access Claude through Amazon Web Services. Supports multiple authentication methods.

```bash
CLAUDE_CODE_USE_BEDROCK=true claudio
```

#### Environment variables

| Variable | Description | Default |
|---|---|---|
| `AWS_REGION` / `AWS_DEFAULT_REGION` | AWS region where Bedrock is enabled | `us-east-1` |
| `AWS_PROFILE` | AWS profile (from `~/.aws/credentials` or `~/.aws/config`) | - |
| `AWS_ACCESS_KEY_ID` | IAM or temporary credentials access key | - |
| `AWS_SECRET_ACCESS_KEY` | Secret key corresponding to the access key | - |
| `AWS_SESSION_TOKEN` | Session token for temporary credentials (STS, ADFS, SSO) | - |
| `AWS_BEARER_TOKEN_BEDROCK` | Bearer token for API key auth (skips SigV4) | - |
| `CLAUDE_CODE_SKIP_BEDROCK_AUTH` | Skip AWS authentication entirely (for proxies) | `false` |

#### Authentication methods

**1. Direct credentials (IAM user):**

```bash
AWS_ACCESS_KEY_ID=AKIA... \
AWS_SECRET_ACCESS_KEY=wJal... \
CLAUDE_CODE_USE_BEDROCK=true claudio
```

**2. Temporary credentials (STS, ADFS, SSO):**

If your organization uses ADFS, AWS SSO, or `sts:AssumeRole`, the flow typically generates temporary credentials with a session token. After authenticating through your normal process:

```bash
AWS_ACCESS_KEY_ID=ASIA... \
AWS_SECRET_ACCESS_KEY=wJal... \
AWS_SESSION_TOKEN=FwoG... \
AWS_REGION=us-east-1 \
CLAUDE_CODE_USE_BEDROCK=true claudio
```

If your flow writes credentials to `~/.aws/credentials` automatically (like `aws sso login` or ADFS tools), you only need:

```bash
CLAUDE_CODE_USE_BEDROCK=true AWS_PROFILE=my-profile claudio
```

**3. AWS profile:**

```bash
CLAUDE_CODE_USE_BEDROCK=true AWS_PROFILE=my-profile claudio
```

The SDK looks for the profile in `~/.aws/credentials` and `~/.aws/config`. Works with profiles configured via SSO, ADFS, or static credentials.

**4. Bearer token (API key):**

Skips AWS SigV4 signing and uses a bearer token directly. Useful for endpoints that accept API keys instead of IAM credentials.

```bash
AWS_BEARER_TOKEN_BEDROCK=your-token \
CLAUDE_CODE_USE_BEDROCK=true claudio
```

**5. Automatic credential refresh:**

You can configure two commands in `~/.claude.json` to automate credential renewal:

```json
{
  "awsAuthRefresh": "aws sso login --profile my-profile",
  "awsCredentialExport": "aws sts assume-role --role-arn arn:aws:iam::123456:role/MyRole --role-session-name claudio --query Credentials"
}
```

- `awsAuthRefresh` — runs first to renew the session (e.g., `aws sso login`, your ADFS script, etc.)
- `awsCredentialExport` — runs after to retrieve credentials in STS JSON format. Must return a JSON with `AccessKeyId`, `SecretAccessKey`, and `SessionToken`

Credentials are automatically cached for 1 hour.

**6. No authentication (proxy):**

If you use a proxy that handles auth for you:

```bash
CLAUDE_CODE_SKIP_BEDROCK_AUTH=true \
CLAUDE_CODE_USE_BEDROCK=true claudio
```

---

### Google Vertex AI

Access Claude and Gemini through Google Cloud.

```bash
CLAUDE_CODE_USE_VERTEX=true ANTHROPIC_VERTEX_PROJECT_ID=your-gcp-project claudio
```

| Variable | Description | Default |
|---|---|---|
| `ANTHROPIC_VERTEX_PROJECT_ID` | **Required.** Your GCP project | - |
| `CLOUD_ML_REGION` | Default region | - |
| `ANTHROPIC_VERTEX_REGION` | Region override | `us-central1` |

---

### Azure Foundry

Access Claude through Microsoft Azure AI Foundry.

```bash
CLAUDE_CODE_USE_FOUNDRY=true claudio
```

| Variable | Description | Default |
|---|---|---|
| `ANTHROPIC_FOUNDRY_RESOURCE` | Your Azure resource name | - |
| `ANTHROPIC_FOUNDRY_BASE_URL` | Full base URL (alternative) | - |
| `ANTHROPIC_FOUNDRY_API_KEY` | API key (or use Azure AD auth) | - |

---

## CLI Flags

### General usage

| Flag | Description | Example |
|---|---|---|
| `-p, --print` | Non-interactive mode. Responds and exits. | `claudio -p "Summarize index.js"` |
| `--model` | Force a specific model. | `claudio --model claude-3-5-haiku` |
| `--settings` | JSON config or file path. | `claudio --settings '{"autoCommit": true}'` |
| `--bare` | Quick start without background processes. | `claudio --bare` |

### Sessions

| Flag | Description | Example |
|---|---|---|
| `-c, --continue` | Continue the last conversation. | `claudio -c` |
| `-r, --resume` | Resume a session by ID or open a picker. | `claudio -r` |
| `-n, --name` | Assign a name to the session. | `claudio -n "refactor auth"` |

### Model and behavior

| Flag | Description | Example |
|---|---|---|
| `--effort` | Effort level: `low`, `medium`, `high`, `max`. | `claudio --effort max` |
| `--thinking` | Reasoning mode: `enabled`, `adaptive`, `disabled`. | `claudio --thinking enabled` |
| `--system-prompt` | Override the system prompt. | `claudio --system-prompt "Only respond in JSON"` |
| `--max-turns` | Turn limit in non-interactive mode. | `claudio -p "fix tests" --max-turns 5` |
| `--output-format` | Output format: `text`, `json`, `stream-json`. | `claudio -p "list files" --output-format json` |
| `--permission-mode` | Permission mode (see table below). | `claudio --permission-mode plan` |

---

## Permission Modes

Control how autonomous the agent is when executing actions. Set with `--permission-mode` or from `/permissions`.

| Mode | Behavior |
|---|---|
| `default` | Asks for confirmation on every sensitive action (recommended for beginners). |
| `plan` | Pauses before executing so you can review the proposed plan. |
| `acceptEdits` | Auto-accepts file edits, but asks permission for shell commands. |
| `bypassPermissions` | Skips all confirmations. **Dangerous** — only for disposable environments. |
| `dontAsk` | Automatically rejects anything not in the whitelist. Useful for CI/scripting. |

---

## Slash Commands

Inside the terminal, type `/` followed by the command. The most commonly used are listed here. For the full list, run `/help` inside the terminal.

### Essentials

| Command | Description |
|---|---|
| `/help` | Interactive help with command list and shortcuts |
| `/model [name]` | Switch AI model (`/model opus`, `/model haiku`) |
| `/compact` | Summarize old messages to free up context |
| `/cost` | Show estimated session cost (tokens and duration) |
| `/doctor` | System diagnostics: config, network, permissions |
| `/version` | Show current version |

### Code

| Command | Description |
|---|---|
| `/review [files...]` | Request code review |
| `/plan [task]` | Strategy before making complex changes |
| `/diff` | Interactive viewer for session changes |
| `/copy [N]` | Copy responses to clipboard |

### Sessions

| Command | Description |
|---|---|
| `/resume` | Resume a previous session |
| `/memory` | Edit the project's `CLAUDE.md` file |
| `/permissions` | Manage the active permission mode |
| `/login` / `/logout` | Authentication |

### Configuration

| Command | Description |
|---|---|
| `/config` | Manage persistent config (`/config set autoCommit true`) |
| `/context` | Show what the model "sees" (tokens, files, history) |
| `/effort` | View/change model effort level |
| `/hooks` | Browser for automations in `settings.json` |
| `/vim` | Toggle vim mode in the editor |
| `/theme` | Change terminal theme |
| `/fast` | Toggle fast mode |

### Other

| Command | Description |
|---|---|
| `/export` | Export conversation to markdown or JSON |
| `/summary` | Generate session summary |
| `/mcp` | MCP server panel (connect/disconnect) |
| `/ide` | Connect with your editor (VS Code, JetBrains, Cursor) |

> For full documentation on slash commands, keybindings, hooks, plugins, agents, and other advanced features, see the [official Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code). This fork maintains the same base functionality.

---

## Memory & Context

### Project Memory (`CLAUDE.md`)

File at the project root with global instructions: build commands, testing guides, code standards. Claude reads it at the start of every session.

### Automatic Memory

Claude saves data it learns about you and your preferences in `~/.claude/projects/.../memory/`. It updates automatically as you interact.

---

## MCP Extensibility

The [Model Context Protocol](https://modelcontextprotocol.io) allows connecting external tools (databases, APIs, services).

### Per-project configuration

Create `.mcp.json` at your project root:

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db", "./dev.db"]
    }
  }
}
```

### MCP Commands

```bash
/mcp add sqlite npx -y @modelcontextprotocol/server-sqlite --db ./dev.db
/mcp remove <name>
/mcp list
```

---

## Building Binaries

Generate standalone binaries that don't require Bun installed on the target machine.

```bash
npm run build:win    # dist/claudio.exe
npm run build:linux  # dist/claudio-linux
npm run build:mac    # dist/claudio-mac
```

### Running on the target machine

```bash
# Windows
./claudio.exe

# Linux / macOS
chmod +x ./claudio-linux
./claudio-linux
```

Binaries support the same environment variables to switch providers:

```bash
CLAUDE_CODE_USE_OPENROUTER=true OPENROUTER_API_KEY=sk-or-... ./claudio-linux
```

---

## Troubleshooting

### "Permission denied" when running `npm link`

Use `sudo npm link` or set up a shell alias (see installation section).

### VS Code Bridge won't connect

1. Make sure VS Code is open with the Claud.ia extension active
2. The extension should show "Claud.ia Model Bridge started on ws://localhost:7862" on activation
3. If you changed the port, update `VSCODE_BRIDGE_URL`

### `/model` selector shows incompatible models

The selector shows all known models, not just those for the active provider. If you select a model that's not compatible with your provider, you'll see authentication errors. Only select compatible models.

### `/add-dir` says the directory is already accessible

Claude Code already has access to the directory where you launched it. `/add-dir` is for granting access to folders **outside** that directory. To switch projects, close the session and open Claude in the new folder.

### Customizing the command name

Edit the `"bin"` section in `package.json` and run `npm link` again:

```json
"bin": {
  "my-name": "src/index.ts"
}
```
