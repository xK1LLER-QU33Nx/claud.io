# EDUCATIONAL PURPOSES ONLY

The whole purpose of this repository is to learn how Claude Code works and try to connect it to other providers.

---

# Claud.io CLI

Herramienta de terminal que integra IA directamente en tu flujo de trabajo de desarrollo. Edita codigo, ejecuta tests y gestiona proyectos con lenguaje natural. Compatible con multiples proveedores de IA.

## Requisitos

- [Bun](https://bun.sh) v1.0+
- [Node.js](https://nodejs.org) v18+ (para `npm link`)
- Git

---

## Tabla de Contenidos

- [Instalacion](#instalacion)
- [Inicio Rapido](#inicio-rapido)
- [Proveedores de IA](#proveedores-de-ia)
  - [Anthropic (por defecto)](#anthropic-por-defecto)
  - [Ollama (modelos locales)](#ollama-modelos-locales)
  - [OpenRouter](#openrouter)
  - [VS Code Bridge](#vs-code-bridge)
  - [AWS Bedrock](#aws-bedrock)
  - [Google Vertex AI](#google-vertex-ai)
  - [Azure Foundry](#azure-foundry)
- [Banderas de Linea de Comandos](#banderas-de-linea-de-comandos)
- [Comandos (Slash Commands)](#comandos-slash-commands)
- [Memoria y Contexto](#memoria-y-contexto)
- [Extensibilidad con MCP](#extensibilidad-con-mcp)
- [Compilacion de Binarios](#compilacion-de-binarios)
- [Problemas Frecuentes](#problemas-frecuentes)

---

## Instalacion

El CLI se instala como comando global `claudio` (para diferenciarlo de la version oficial `claude` de Anthropic).

### macOS / Linux

```bash
# 1. Clonar e instalar dependencias
git clone <url-del-repo>
cd claud.io
npm install

# 2. Registrar como comando global
sudo npm link

# 3. Verificar
claudio --help
```

**Alternativa sin sudo — alias en shell:**

```bash
# zsh (macOS por defecto)
echo 'alias claudio="bun run /ruta/a/claud.io/src/index.ts"' >> ~/.zshrc
source ~/.zshrc

# bash (Linux por defecto)
echo 'alias claudio="bun run /ruta/a/claud.io/src/index.ts"' >> ~/.bashrc
source ~/.bashrc
```

### Windows

```powershell
cd C:\ruta\a\claud.io
npm install
npm link
claudio --help
```

**Alternativa — funcion en PowerShell:**

Agrega esto a tu perfil (`notepad $PROFILE`):

```powershell
function claudio { bun run C:\ruta\a\claud.io\src\index.ts $args }
```

---

## Inicio Rapido

```bash
# Modo interactivo (REPL)
claudio

# Modo no interactivo — responde y sale
claudio -p "Resume el archivo index.js"
```

---

## Proveedores de IA

Claud.io soporta 7 proveedores. Se activan con variables de entorno. Si multiples estan activas, el primer match en este orden gana:

| Prioridad | Variable de Entorno | Provider |
|:-:|---|---|
| 1 | `CLAUDE_CODE_USE_OLLAMA=true` | Ollama (local) |
| 2 | `CLAUDE_CODE_USE_OPENROUTER=true` | OpenRouter |
| 3 | `CLAUDE_CODE_USE_VSCODE=true` | VS Code Bridge |
| 4 | `CLAUDE_CODE_USE_BEDROCK=true` | AWS Bedrock |
| 5 | `CLAUDE_CODE_USE_VERTEX=true` | Google Vertex AI |
| 6 | `CLAUDE_CODE_USE_FOUNDRY=true` | Azure Foundry |
| 7 | *(ninguna)* | Anthropic API (por defecto) |

---

### Anthropic (por defecto)

Acceso directo a los modelos de Claude via la API de Anthropic. No necesitas ninguna variable extra si ya tienes tu API key.

```bash
ANTHROPIC_API_KEY=sk-ant-... claudio
```

---

### Ollama (modelos locales)

Ejecuta modelos en tu maquina sin conexion a internet. Requiere [Ollama](https://ollama.ai) instalado.

**Setup:**

```bash
# Instalar Ollama
brew install ollama          # macOS
# curl -fsSL https://ollama.ai/install.sh | sh   # Linux

# Iniciar servidor (dejarlo corriendo)
ollama serve

# Descargar un modelo
ollama pull llama3.2
```

**Usar con Claud.io:**

```bash
# Modelo por defecto (llama3.2)
CLAUDE_CODE_USE_OLLAMA=true claudio

# Modelo especifico
CLAUDE_CODE_USE_OLLAMA=true OLLAMA_MODEL=codellama claudio

# Servidor remoto
CLAUDE_CODE_USE_OLLAMA=true OLLAMA_HOST=http://192.168.1.100:11434 claudio
```

| Variable | Descripcion | Default |
|---|---|---|
| `OLLAMA_HOST` | URL del servidor Ollama | `http://localhost:11434` |
| `OLLAMA_MODEL` | Modelo a usar | `llama3.2` |

**Modelos recomendados:**

```bash
ollama pull llama3.2          # General, bueno y rapido
ollama pull codellama          # Especializado en codigo
ollama pull deepseek-coder-v2  # Bueno para programacion
ollama pull qwen2.5-coder      # Alternativa para codigo
```

> **Nota:** Los tool_use se envian como texto plano. El rendimiento depende de la capacidad del modelo local para seguir instrucciones de herramientas.

---

### OpenRouter

Acceso a 200+ modelos de multiples proveedores via [OpenRouter](https://openrouter.ai). Necesitas una API key gratuita.

```bash
CLAUDE_CODE_USE_OPENROUTER=true OPENROUTER_API_KEY=sk-or-... claudio
```

| Variable | Descripcion | Default |
|---|---|---|
| `OPENROUTER_API_KEY` | **Requerido.** Tu API key | - |
| `OPENROUTER_MODEL` | Modelo a usar | `anthropic/claude-sonnet-4` |
| `OPENROUTER_BASE_URL` | URL base de la API | `https://openrouter.ai/api/v1` |

**Ejemplos con diferentes modelos:**

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

Usa los modelos disponibles dentro de VS Code (GitHub Copilot, Azure AI, etc.) sin necesitar API keys adicionales. Funciona mediante una extension de VS Code que expone los modelos por WebSocket.

**Como funciona:**

```
VS Code (con Copilot/modelos)
    |
    v
Extension Claud.ia Bridge (WebSocket server en puerto 7862)
    |
    v
Claud.io CLI (se conecta como cliente WebSocket)
```

**Setup paso a paso:**

1. **Instalar la extension** en VS Code:
   - Abre la carpeta `claudia-bridge/packages/vscode-extension/` en VS Code
   - Presiona `F5` para ejecutar en modo desarrollo, o empaqueta e instala la extension
   - La extension se auto-inicia y levanta el server en `ws://localhost:7862`

2. **Verificar que el bridge esta activo:**
   - En VS Code, abre la paleta de comandos (`Cmd+Shift+P` / `Ctrl+Shift+P`)
   - Busca "Claud.ia: Start Model Bridge" (se auto-inicia, pero puedes reiniciarlo manualmente)

3. **Conectar Claud.io:**

```bash
CLAUDE_CODE_USE_VSCODE=true claudio
```

| Variable | Descripcion | Default |
|---|---|---|
| `VSCODE_BRIDGE_URL` | URL WebSocket del bridge | `ws://localhost:7862/models` |
| `VSCODE_BRIDGE_MODEL` | Modelo a usar | `copilot:gpt-4o` |

**Usar un modelo diferente:**

```bash
CLAUDE_CODE_USE_VSCODE=true VSCODE_BRIDGE_MODEL=copilot:claude-3.5-sonnet claudio
```

> **Importante:** VS Code debe estar abierto con la extension activa antes de ejecutar `claudio`. Si la extension no esta corriendo, la conexion WebSocket fallara.

Para mas detalles sobre la extension, ver el [README de Claud.ia Bridge](claudia-bridge/README.md).

---

### AWS Bedrock

Acceso a Claude a traves de Amazon Web Services.

```bash
CLAUDE_CODE_USE_BEDROCK=true claudio
```

| Variable | Descripcion | Default |
|---|---|---|
| `AWS_REGION` / `AWS_DEFAULT_REGION` | Region de AWS | `us-east-1` |
| `AWS_PROFILE` | Perfil de AWS para autenticacion | - |
| `AWS_ACCESS_KEY_ID` | Llave de acceso directa | - |

---

### Google Vertex AI

Acceso a Claude y Gemini a traves de Google Cloud.

```bash
CLAUDE_CODE_USE_VERTEX=true ANTHROPIC_VERTEX_PROJECT_ID=tu-proyecto-gcp claudio
```

| Variable | Descripcion | Default |
|---|---|---|
| `ANTHROPIC_VERTEX_PROJECT_ID` | **Requerido.** Tu proyecto de GCP | - |
| `CLOUD_ML_REGION` | Region default | - |
| `ANTHROPIC_VERTEX_REGION` | Override de region | `us-central1` |

---

### Azure Foundry

Acceso a Claude a traves de Microsoft Azure AI Foundry.

```bash
CLAUDE_CODE_USE_FOUNDRY=true claudio
```

| Variable | Descripcion | Default |
|---|---|---|
| `ANTHROPIC_FOUNDRY_RESOURCE` | Nombre de tu recurso en Azure | - |
| `ANTHROPIC_FOUNDRY_BASE_URL` | URL base completa (alternativa) | - |
| `ANTHROPIC_FOUNDRY_API_KEY` | API key (o usar Azure AD auth) | - |

---

## Banderas de Linea de Comandos

| Bandera | Descripcion | Ejemplo |
|---|---|---|
| `-p, --print` | Modo no interactivo. Responde y sale. | `claudio -p "Resume index.js"` |
| `--model` | Fuerza un modelo especifico. | `claudio --model claude-3-5-haiku` |
| `--settings` | Configuracion JSON o ruta de archivo. | `claudio --settings '{"autoCommit": true}'` |
| `--bare` | Inicio rapido sin procesos de fondo. | `claudio --bare` |

---

## Comandos (Slash Commands)

Dentro de la terminal, escribe `/` seguido del comando.

### Esenciales

| Comando | Descripcion |
|---|---|
| `/help` | Ayuda interactiva con lista de comandos y atajos |
| `/model [nombre]` | Cambia el modelo de IA (`/model opus`, `/model haiku`) |
| `/compact` | Resume mensajes antiguos para liberar contexto |
| `/cost` | Muestra costo estimado de la sesion (tokens y duracion) |
| `/doctor` | Diagnostico del sistema: config, red, permisos |

### Codigo

| Comando | Descripcion |
|---|---|
| `/review [archivos...]` | Pide revision de codigo |
| `/plan [tarea]` | Estrategia antes de hacer cambios complejos |
| `/diff` | Visor interactivo de cambios en la sesion |
| `/copy [N]` | Copia respuestas al portapapeles |

### Configuracion

| Comando | Descripcion |
|---|---|
| `/config` | Gestiona config persistente (`/config set autoCommit true`) |
| `/context` | Muestra lo que el modelo "ve" (tokens, archivos, historial) |
| `/effort` | Ver/cambiar nivel de esfuerzo del modelo |
| `/hooks` | Navegador de automatizaciones en `settings.json` |

### Otros

| Comando | Descripcion |
|---|---|
| `/export` | Exporta conversacion a markdown o JSON |
| `/summary` | Genera resumen de la sesion |
| `/mcp` | Panel de servidores MCP (conectar/desconectar) |
| `/ide` | Conecta con tu editor (VS Code, JetBrains, Cursor) |

---

## Memoria y Contexto

### Memoria de Proyecto (`CLAUDE.md`)

Archivo en la raiz del proyecto con instrucciones globales: comandos de build, guias de testing, estandares de codigo. Claude lo lee al inicio de cada sesion.

### Memoria Automatica

Claude guarda datos que aprende sobre ti y tus preferencias en `~/.claude/projects/.../memory/`. Se actualiza automaticamente conforme interactuas.

---

## Extensibilidad con MCP

El [Model Context Protocol](https://modelcontextprotocol.io) permite conectar herramientas externas (bases de datos, APIs, servicios).

### Configuracion por proyecto

Crea `.mcp.json` en la raiz de tu proyecto:

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

### Comandos MCP

```bash
/mcp add sqlite npx -y @modelcontextprotocol/server-sqlite --db ./dev.db
/mcp remove <nombre>
/mcp list
```

---

## Compilacion de Binarios

Genera binarios standalone que no requieren Bun instalado en la maquina destino.

```bash
npm run build:win    # dist/claudio.exe
npm run build:linux  # dist/claudio-linux
npm run build:mac    # dist/claudio-mac
```

### Ejecutar en la maquina destino

```bash
# Windows
./claudio.exe

# Linux / macOS
chmod +x ./claudio-linux
./claudio-linux
```

Los binarios soportan las mismas variables de entorno para cambiar de provider:

```bash
CLAUDE_CODE_USE_OPENROUTER=true OPENROUTER_API_KEY=sk-or-... ./claudio-linux
```

---

## Problemas Frecuentes

### "Permission denied" al hacer `npm link`

Usa `sudo npm link` o configura un alias en tu shell (ver seccion de instalacion).

### VS Code Bridge no conecta

1. Verifica que VS Code esta abierto con la extension Claud.ia activa
2. La extension debe mostrar "Claud.ia Model Bridge started on ws://localhost:7862" al activarse
3. Si cambiaste el puerto, actualiza `VSCODE_BRIDGE_URL`

### El selector `/model` muestra modelos incompatibles

El selector muestra todos los modelos conocidos, no solo los del provider activo. Si seleccionas un modelo que no es compatible con tu provider, veras errores de autenticacion. Selecciona solo modelos compatibles.

### `/add-dir` dice que el directorio ya es accesible

Claude Code ya tiene acceso al directorio donde lo ejecutaste. `/add-dir` sirve para dar acceso a carpetas **fuera** de ese directorio. Para cambiar de proyecto, cierra la sesion y abre Claude en la nueva carpeta.

### Personalizar el nombre del comando

Edita la seccion `"bin"` en `package.json` y ejecuta `npm link` de nuevo:

```json
"bin": {
  "mi-nombre": "src/index.ts"
}
```
