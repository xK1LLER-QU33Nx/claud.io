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

Access Claude through Amazon Web Services.

```bash
CLAUDE_CODE_USE_BEDROCK=true claudio
```

| Variable | Description | Default |
|---|---|---|
| `AWS_REGION` / `AWS_DEFAULT_REGION` | AWS region | `us-east-1` |
| `AWS_PROFILE` | AWS profile for authentication | - |
| `AWS_ACCESS_KEY_ID` | Direct access key | - |

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

| Flag | Description | Example |
|---|---|---|
| `-p, --print` | Non-interactive mode. Responds and exits. | `claudio -p "Summarize index.js"` |
| `--model` | Force a specific model. | `claudio --model claude-3-5-haiku` |
| `--settings` | JSON config or file path. | `claudio --settings '{"autoCommit": true}'` |
| `--bare` | Quick start without background processes. | `claudio --bare` |

---

## Slash Commands

Inside the terminal, type `/` followed by the command.

### Essentials

| Command | Description |
|---|---|
| `/help` | Interactive help with command list and shortcuts |
| `/model [name]` | Switch AI model (`/model opus`, `/model haiku`) |
| `/compact` | Summarize old messages to free up context |
| `/cost` | Show estimated session cost (tokens and duration) |
| `/doctor` | System diagnostics: config, network, permissions |

### Code

| Command | Description |
|---|---|
| `/review [files...]` | Request code review |
| `/plan [task]` | Strategy before making complex changes |
| `/diff` | Interactive viewer for session changes |
| `/copy [N]` | Copy responses to clipboard |

### Configuration

| Command | Description |
|---|---|
| `/config` | Manage persistent config (`/config set autoCommit true`) |
| `/context` | Show what the model "sees" (tokens, files, history) |
| `/effort` | View/change model effort level |
| `/hooks` | Browser for automations in `settings.json` |

### Other

| Command | Description |
|---|---|
| `/export` | Export conversation to markdown or JSON |
| `/summary` | Generate session summary |
| `/mcp` | MCP server panel (connect/disconnect) |
| `/ide` | Connect with your editor (VS Code, JetBrains, Cursor) |

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
