# Claude Code CLI

Herramienta que integra la potencia de Claude directamente en tu flujo de trabajo local, permitiendote editar codigo, ejecutar tests y gestionar proyectos mediante lenguaje natural. Soporta multiples proveedores de IA.

---

## Indice

1. [Instalacion](#instalacion)
2. [Inicio Rapido](#inicio-rapido)
3. [Proveedores Soportados](#proveedores-soportados)
4. [Comandos (Slash Commands)](#comandos-slash-commands)
5. [Memoria y Contexto](#memoria-y-contexto)
6. [Extensibilidad con MCP](#extensibilidad-con-mcp)
7. [Modos de Trabajo y Buddy](#modos-de-trabajo-y-buddy)
8. [Tips Avanzados](#tips-avanzados)
9. [Compilación de Binarios (Portabilidad)](#compilacion-de-binarios-portabilidad)
10. [Problemas Conocidos](#problemas-conocidos)

---

## Instalacion

Para usar `claudio` desde cualquier carpeta en tu terminal necesitas registrarlo como comando global. El comando se llama `claudio` para no confundirse con la version oficial `claude` de Anthropic.

### macOS / Linux

**Opcion A: npm link (Recomendado)**

```bash
# 1. Ir al directorio del proyecto
cd /ruta/a/claudecode-clean

# 2. Instalar dependencias
npm install

# 3. Registrar el comando "claudio" globalmente
sudo npm link

# 4. Verificar
claudio --help
```

> Si te sale error `EACCES: permission denied`, es porque npm necesita permisos para escribir en `/usr/local/lib/node_modules/`. Usa `sudo npm link`. Si prefieres no usar sudo, usa la Opcion B (alias).

**Opcion B: Alias en ~/.zshrc o ~/.bashrc**

Si npm link da problemas, agrega un alias manualmente:

```bash
# Para zsh (macOS por defecto)
echo 'alias claudio="bun run /ruta/a/claudecode-clean/src/index.ts"' >> ~/.zshrc
source ~/.zshrc

# Para bash (Linux por defecto)
echo 'alias claudio="bun run /ruta/a/claudecode-clean/src/index.ts"' >> ~/.bashrc
source ~/.bashrc
```

**Opcion C: Ejecucion directa (sin instalar nada global)**

```bash
cd /ruta/a/tu/proyecto
bun run /ruta/a/claudecode-clean/src/index.ts
```

### Windows

**Opcion A: npm link**

```powershell
# En PowerShell o CMD
cd C:\ruta\a\claudecode-clean
npm install
npm link

# Verificar
claudio --help
```

**Opcion B: Alias en PowerShell**

Agrega esto a tu perfil de PowerShell (`$PROFILE`):

```powershell
# Abrir el perfil para editar
notepad $PROFILE

# Agregar esta linea al archivo:
function claudio { bun run C:\ruta\a\claudecode-clean\src\index.ts $args }
```

Reinicia PowerShell y verifica con `claudio --help`.

**Opcion C: Archivo .bat en el PATH**

Crea un archivo `claudio.bat` en una carpeta que este en tu PATH (ej: `C:\ruta\en\tu\PATH\`):

```bat
@echo off
bun run C:\ruta\a\claudecode-clean\src\index.ts %*
```

### Verificar la instalacion

Desde cualquier carpeta:

```bash
claudio --help
```

Si ves la ayuda del CLI, la instalacion fue exitosa.

### Instalacion de Claud.ia (Solo si vas a usar VS Code Bridge)

Si vas a usar el provider de VS Code Bridge, tambien necesitas `claudia` como comando global. Claud.ia usa [Bun](https://bun.sh) como runtime.

**macOS / Linux:**

```bash
# Instalar Bun (si no lo tienes)
curl -fsSL https://bun.sh/install | bash

# Instalar Claud.ia
cd /ruta/a/claudia
bun install
bun link

# Verificar
claudia --help
```

Si `bun link` no funciona, usa un alias:

```bash
# zsh (macOS)
echo 'alias claudia="bun run /ruta/a/claudia/src/main.ts"' >> ~/.zshrc
source ~/.zshrc

# bash (Linux)
echo 'alias claudia="bun run /ruta/a/claudia/src/main.ts"' >> ~/.bashrc
source ~/.bashrc
```

**Windows (PowerShell):**

```powershell
# Instalar Bun
powershell -c "irm bun.sh/install.ps1 | iex"

# Instalar Claud.ia
cd C:\ruta\a\claudia
bun install
bun link

# Verificar
claudia --help
```

Si `bun link` no funciona, agrega al perfil de PowerShell (`notepad $PROFILE`):

```powershell
function claudia { bun run C:\ruta\a\claudia\src\main.ts $args }
```

---

## Compilación de Binarios (Portabilidad)

Puedes generar un archivo binario único (Standalone) desde tu Mac/Linux de desarrollo.

### Generar Binarios
Desde la carpeta del proyecto en tu máquina de desarrollo, ejecuta:

```bash
# Para Windows (genera dist/claudio.exe)
npm run build:win

# Para Linux (genera dist/claudio-linux)
npm run build:linux

# Para macOS (genera dist/claudio-mac)
npm run build:mac
```

### Ejecución en el ambiente destino
Una vez que copies el archivo generado a la otra máquina:

**Windows (Bash/PowerShell):**
```bash
./claudio.exe  # En Bash
.\claudio.exe  # En PowerShell
```

**Linux / macOS:**
```bash
chmod +x ./claudio-linux
./claudio-linux
```

---

## Ejecución con Diferentes Proveedores

El binario es único, pero puedes cambiar el "cerebro" (provider) configurando variables de entorno justo antes de lanzarlo. Aquí tienes ejemplos para los casos más comunes:

### 1. OpenRouter (Recomendado para variedad)
```bash
export OPENROUTER_API_KEY="tu_clave_aqui"
export OPENROUTER_MODEL="anthropic/claude-3.5-sonnet" # Opcional
CLAUDE_CODE_USE_OPENROUTER=true ./claudio.exe
```

### 2. Ollama (Modelos locales, sin internet)
```bash
export OLLAMA_MODEL="llama3.2" # O el que tengas descargado
CLAUDE_CODE_USE_OLLAMA=true ./claudio.exe
```

### 3. Anthropic (Oficial)
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
./claudio.exe
```

### 4. Google Vertex AI
```bash
export CLAUDE_CODE_USE_VERTEX=true
export ANTHROPIC_VERTEX_PROJECT_ID="mi-proyecto-123"
./claudio.exe
```

> **Tip:** En Windows Bash, puedes poner las variables en la misma línea:
> `OPENROUTER_API_KEY=xxx CLAUDE_CODE_USE_OPENROUTER=true ./claudio.exe`


## Inicio Rapido

```bash
claudio
```

### Banderas de Linea de Comandos

| Bandera | Uso | Ejemplo |
|---|---|---|
| `-p, --print` | Modo no interactivo. Responde y sale. | `claudio -p "Resume el archivo index.js"` |
| `--model` | Fuerza el uso de un modelo especifico. | `claudio --model claude-3-5-haiku` |
| `--settings` | Pasa una configuracion en JSON o ruta de archivo. | `claudio --settings '{"autoCommit": true}'` |
| `--bare` | Inicia rapido omitiendo procesos de fondo. | `claudio --bare` |

---

## Proveedores Soportados

Claude Code soporta multiples proveedores de IA. Configuralos mediante variables de entorno antes de ejecutar `claudio`.

### Prioridad de Proveedores

Cuando multiples variables de entorno estan activas, el primer match gana:

1. `CLAUDE_CODE_USE_BEDROCK` - AWS Bedrock
2. `CLAUDE_CODE_USE_VERTEX` - Google Vertex AI
3. `CLAUDE_CODE_USE_FOUNDRY` - Azure Foundry
4. `CLAUDE_CODE_USE_OLLAMA` - Ollama (local)
5. `CLAUDE_CODE_USE_OPENROUTER` - OpenRouter
6. `CLAUDE_CODE_USE_VSCODE` - VS Code Bridge
7. *(default)* - Anthropic First Party API

---

### Anthropic (Por defecto)

Acceso directo a los modelos de Claude via la API de Anthropic. No requiere configuracion extra si ya tienes tu API key.

```bash
ANTHROPIC_API_KEY=sk-ant-... claudio
```

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
| `ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION` | Region override para el modelo rapido (Haiku) | - |
| `AWS_BEARER_TOKEN_BEDROCK` | Bearer token para auth con API key | - |

---

### Google Vertex AI

Acceso a Claude y Gemini a traves de Google Cloud.

```bash
CLAUDE_CODE_USE_VERTEX=true ANTHROPIC_VERTEX_PROJECT_ID=tu-proyecto-gcp claudio
```

| Variable | Descripcion | Default |
|---|---|---|
| `ANTHROPIC_VERTEX_PROJECT_ID` | **Requerido.** Tu proyecto de GCP | - |
| `CLOUD_ML_REGION` | Region default para todos los modelos | - |
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
| `ANTHROPIC_FOUNDRY_BASE_URL` | Alternativa: URL base completa | - |
| `ANTHROPIC_FOUNDRY_API_KEY` | API key (o usar Azure AD auth) | - |

---

### Ollama (Modelos Locales)

Ejecuta modelos locales a traves de [Ollama](https://ollama.ai). No requiere API key ni conexion a la nube.

```bash
CLAUDE_CODE_USE_OLLAMA=true claudio
```

| Variable | Descripcion | Default |
|---|---|---|
| `OLLAMA_HOST` | URL del servidor Ollama | `http://localhost:11434` |
| `OLLAMA_MODEL` | Modelo a usar | `llama3.2` |

**Setup:**

```bash
# 1. Instalar Ollama (macOS)
brew install ollama

# O en Linux
curl -fsSL https://ollama.ai/install.sh | sh

# 2. Iniciar el servidor de Ollama (dejarlo corriendo en una terminal)
ollama serve

# 3. Descargar un modelo (en otra terminal)
ollama pull llama3.2
```

**Comandos utiles de Ollama:**

```bash
# Ver modelos descargados
ollama list

# Descargar otros modelos
ollama pull codellama          # Especializado en codigo
ollama pull mistral            # Ligero y rapido
ollama pull llama3.1:70b       # Mas grande y capaz
ollama pull deepseek-coder-v2  # Bueno para programacion
ollama pull qwen2.5-coder      # Alternativa para codigo

# Borrar un modelo
ollama rm nombre-del-modelo

# Ver info de un modelo
ollama show llama3.2
```

**Iniciar claudio con Ollama:**

```bash
# Con el modelo por defecto (llama3.2)
CLAUDE_CODE_USE_OLLAMA=true claudio

# Con un modelo especifico
CLAUDE_CODE_USE_OLLAMA=true OLLAMA_MODEL=codellama claudio

# Con Ollama en otra maquina/puerto
CLAUDE_CODE_USE_OLLAMA=true OLLAMA_HOST=http://192.168.1.100:11434 claudio
```

> **Nota:** Ollama debe estar corriendo (`ollama serve`) antes de iniciar claudio. Los slash commands funcionan normalmente. Sin embargo, las funcionalidades que dependen de tool_use nativo se envian como texto plano, por lo que el rendimiento depende de la capacidad del modelo local para seguir instrucciones de herramientas.

---

### OpenRouter

Acceso a 200+ modelos de multiples proveedores a traves de [OpenRouter](https://openrouter.ai).

```bash
CLAUDE_CODE_USE_OPENROUTER=true OPENROUTER_API_KEY=sk-or-... claudio
```

| Variable | Descripcion | Default |
|---|---|---|
| `OPENROUTER_API_KEY` | **Requerido.** Tu API key de OpenRouter | - |
| `OPENROUTER_MODEL` | Modelo a usar | `anthropic/claude-sonnet-4` |
| `OPENROUTER_BASE_URL` | URL base de la API | `https://openrouter.ai/api/v1` |

**Ejemplos con diferentes modelos:**

```bash
# Claude via OpenRouter
CLAUDE_CODE_USE_OPENROUTER=true \
  OPENROUTER_API_KEY=sk-or-... \
  OPENROUTER_MODEL=anthropic/claude-sonnet-4 \
  claudio

# GPT-4o via OpenRouter
CLAUDE_CODE_USE_OPENROUTER=true \
  OPENROUTER_API_KEY=sk-or-... \
  OPENROUTER_MODEL=openai/gpt-4o \
  claudio

# Llama via OpenRouter
CLAUDE_CODE_USE_OPENROUTER=true \
  OPENROUTER_API_KEY=sk-or-... \
  OPENROUTER_MODEL=meta-llama/llama-3.1-405b-instruct \
  claudio
```

> **Nota:** Al igual que con Ollama, los tool_use se serializan como texto. Modelos que soporten function calling nativo via OpenRouter pueden tener mejor rendimiento con herramientas.

---

### VS Code Bridge

Conecta con modelos disponibles en extensiones de VS Code (Copilot, Azure AI, etc.) a traves de un bridge WebSocket.

```bash
CLAUDE_CODE_USE_VSCODE=true claudio
```

| Variable | Descripcion | Default |
|---|---|---|
| `VSCODE_BRIDGE_URL` | URL WebSocket del bridge server | `ws://localhost:7862/models` |
| `VSCODE_BRIDGE_MODEL` | Modelo a usar | `copilot:gpt-4o` |

**Setup:**

El bridge requiere tener `claudia` instalado como comando global. Ver seccion [Instalacion de Claud.ia](#instalacion-de-claudia-necesario-para-vs-code-bridge).

**1. Abrir VS Code con la extension de Claud.ia**

Si quieres usar modelos de Copilot u otros modelos de VS Code, **necesitas tener VS Code abierto** con la extension de Claud.ia instalada y activa. La extension es la que registra y expone los modelos disponibles al bridge.

> Si solo vas a usar el bridge con modelos de Claud.ia (Anthropic, Ollama, etc.) y no modelos de VS Code/Copilot, este paso no es necesario.

**3. Iniciar el bridge server**

```bash
# Puerto 7862 por defecto
claudia bridge

# O en un puerto personalizado
claudia bridge --port 8080
```

**4. Conectar Claude Code (en otra terminal)**

```bash
CLAUDE_CODE_USE_VSCODE=true claudio

# O con puerto/modelo personalizados
CLAUDE_CODE_USE_VSCODE=true \
  VSCODE_BRIDGE_URL=ws://localhost:8080/models \
  VSCODE_BRIDGE_MODEL=copilot:gpt-4o \
  claudio
```

**Verificar que el bridge esta corriendo:**

```bash
curl http://localhost:7862/health
```

Deberia responder con JSON indicando el provider y modelo activos.

**Como funciona:**

1. La extension de Claud.ia en VS Code registra los modelos de lenguaje disponibles (Copilot, Azure AI, etc.)
2. `claudia bridge` inicia un servidor WebSocket que expone esos modelos
3. Claude Code se conecta al bridge y envia/recibe mensajes a traves de el
4. Esto permite usar cualquier modelo disponible en tu entorno de VS Code

**Problemas conocidos:**

- Si `bun link` no registra el comando `claudia`, usa la opcion del alias en `~/.zshrc`
- El bridge debe estar corriendo **antes** de iniciar Claude Code, si no la conexion WebSocket fallara
- Si cambias de puerto, recuerda actualizar `VSCODE_BRIDGE_URL` tambien

---

## Comandos (Slash Commands)

Dentro de la terminal, usa `/` para ejecutar comandos. Todos los comandos funcionan con cualquier provider.

### `/model [nombre]`

Cambia el modelo de IA para la sesion actual.

- `/model opus` - maxima potencia
- `/model haiku` - maxima velocidad

> Con providers como Ollama u OpenRouter, el modelo que selecciones debe estar disponible en el provider activo.

### `/config`

Gestiona la configuracion persistente.

- `/config set autoCommit true` - commits automaticos tras cada cambio
- `/config list` - muestra toda la configuracion actual

### `/review [archivos...]`

Pide a Claude una revision de codigo.

- Sin argumentos: revisa el contexto actual
- `/review src/main.ts` - revisa un archivo especifico

### `/plan [tarea]`

Prepara una estrategia antes de ejecutar cambios complejos.

- `/plan "Migra el estado a Redux Toolkit"`

### `/context`

Muestra una visualizacion detallada de lo que el modelo "ve" en su ventana de contexto (tokens, archivos, historial).

### `/copy [N]`

Copia el contenido de los mensajes de la IA al portapapeles.

- `/copy` o `/copy 1` - copia la respuesta mas reciente
- Si hay bloques de codigo, se abre un selector

### `/diff`

Visor interactivo para revisar los cambios de codigo realizados en la sesion actual.

### `/compact`

Resume los mensajes antiguos para liberar espacio en la ventana de contexto sin perder el hilo.

### `/cost`

Muestra el costo estimado de la sesion (tokens de entrada/salida) y duracion de las llamadas a la API.

### `/doctor`

Diagnostico del estado de Claude Code: configuracion, red, permisos.

### `/effort`

Ver o cambiar el nivel de esfuerzo del modelo para tareas complejas.

### `/hooks`

Navegador interactivo de los Hooks (automatizaciones) configurados en `settings.json`.

### `/export`

Exporta la conversacion actual a markdown o JSON.

### `/summary`

Genera un resumen de la sesion actual.

### `/mobile`

Genera un codigo QR para descargar la app movil de Claude. Alterna entre iOS y Android con `Tab`.

### `/mcp`

Panel visual para ver el estado de servidores MCP, conectarlos o desconectarlos.

### `/ide`

Conecta el CLI con tu editor de codigo (VS Code, JetBrains, Cursor, etc.).

### `/help`

Muestra la ayuda interactiva con la lista completa de comandos y atajos de teclado.

---

## Memoria y Contexto

Claude Code tiene un sistema de memoria dual:

### Memoria de Proyecto (`CLAUDE.md`)

Archivo en la raiz del proyecto con instrucciones globales: comandos de build, guias de testing, estandares de codigo.

- Usa `/memory` para editarlo desde la terminal
- Claude lo lee al inicio de cada sesion

### Memoria de Aprendizaje (Automatica)

Claude guarda automaticamente datos que aprende sobre ti y tus preferencias.

- Se guarda en `~/.claude/projects/.../memory/`
- Es dinamica: Claude la actualiza conforme interactuas con el

---

## Extensibilidad con MCP

El **Model Context Protocol** permite que Claude use herramientas externas (bases de datos, APIs, etc.).

### Configuracion por Proyecto (`.mcp.json`)

Crea `.mcp.json` en la raiz de tu proyecto:

```json
{
  "mcpServers": {
    "nombre-de-tu-servidor": {
      "command": "uvx",
      "args": ["nombre-del-paquete-mcp", "--opcion", "valor"]
    }
  }
}
```

### Agregar servidores MCP

```bash
# SQLite
/mcp add sqlite npx -y @modelcontextprotocol/server-sqlite --db ./dev.db

# Con variables de entorno
/mcp add -e API_KEY=123 mi-servicio -- npx server-comando
```

### Otros subcomandos MCP

- `/mcp remove <nombre>` - elimina una conexion
- `/mcp list` - muestra servidores conectados y sus herramientas

---

## Modos de Trabajo y Buddy

### El Buddy

Tu companero visual animado. Reacciona a commits exitosos o errores.

- `/buddy pet` - manda una caricia para ver su animacion
- `/config set companionMuted true` - silenciarlo

---

---

## Tips Avanzados

- **Navegacion**: Usa las flechas `Arriba` y `Abajo` para navegar por el historial de comandos.
- **Ahorro de Tokens**: Si la sesion es muy larga, usa `/compact` para resumir mensajes antiguos y liberar espacio en la ventana de contexto.
- **Permisos**: Claude siempre pide permiso antes de ejecutar comandos destructivos (como `rm -rf`). Se puede cambiar con `/config set permissionMode auto` (no recomendado para principiantes).

---

## Problemas Conocidos

### `/add-dir` dice que el directorio ya es accesible

Al intentar anadir un directorio con `/add-dir`, el sistema indica que ya es accesible. Esto pasa porque Claude Code diferencia entre el directorio de trabajo (CWD) y directorios adicionales. Si inicias Claude en una carpeta, esa carpeta ya es su "mundo". `/add-dir` sirve para dar acceso a carpetas **fuera** de ese directorio. Si quieres cambiar de proyecto, cierra la sesion y abre Claude en la nueva carpeta.

### Personalizar el nombre del comando

Por defecto el binario se llama `claudio` (configurado en `"bin"` de `package.json`). Si quieres cambiarlo:

1. Edita `package.json` y cambia la seccion `"bin"`:
   ```json
   "bin": {
     "mi-nombre": "src/index.ts"
   }
   ```
2. Ejecuta `npm link` de nuevo para registrar el nuevo nombre.

O simplemente agrega un alias en `~/.zshrc`:
```bash
alias mi-nombre='bun run /ruta/a/claudecode-clean/src/index.ts'
```

### Selector de modelos muestra modelos de otros proveedores

Al usar `/model`, es posible ver modelos de Anthropic (Sonnet, Opus, Haiku) junto a los de Gemini, incluso si estas usando Vertex AI. El selector actualmente **anade** opciones en lugar de filtrarlas por el proveedor activo. Si seleccionas un modelo incompatible con tu provider, veras errores de autenticacion. Asegurate de seleccionar modelos compatibles con tu provider activo.

### VS Code Bridge no conecta

- Verifica que `claudia bridge` esta corriendo: `curl http://localhost:7862/health`
- Si usas modelos de Copilot, VS Code **debe estar abierto** con la extension de Claud.ia activa
- Si cambiaste el puerto del bridge, actualiza `VSCODE_BRIDGE_URL` en Claude Code
