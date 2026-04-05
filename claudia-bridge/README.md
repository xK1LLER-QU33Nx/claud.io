# Claud.ia Bridge — Extension de VS Code

Extension de VS Code que expone los modelos de lenguaje internos (GitHub Copilot, Azure AI, etc.) a aplicaciones externas via WebSocket. Esto permite que [Claud.io CLI](../README.md) use modelos de Copilot sin necesitar API keys adicionales.

## Como funciona

```
VS Code
  |-- GitHub Copilot, Azure AI, otros modelos
  |
Extension Claud.ia Bridge
  |-- WebSocket Server (ws://localhost:7862)
  |
Claud.io CLI (u otra app)
  |-- Se conecta como cliente WebSocket
  |-- Envia mensajes de chat, recibe respuestas en streaming
```

La extension usa la API `vscode.lm` para acceder a cualquier modelo registrado en VS Code y los expone a traves de un protocolo JSON simple.

---

## Instalacion

### Requisitos

- VS Code v1.93.0 o superior
- Una extension de modelos de lenguaje instalada en VS Code (ej: GitHub Copilot)

### Modo desarrollo (recomendado para probar)

```bash
# 1. Ir a la carpeta de la extension
cd claudia-bridge/packages/vscode-extension

# 2. Instalar dependencias
npm install

# 3. Compilar
npm run compile

# 4. Abrir en VS Code y presionar F5 para ejecutar en modo desarrollo
code .
```

Al presionar `F5`, VS Code abre una ventana de desarrollo con la extension activa. El bridge se auto-inicia.

### Instalar como extension empaquetada

```bash
# Instalar vsce si no lo tienes
npm install -g @vscode/vsce

# Empaquetar
cd claudia-bridge/packages/vscode-extension
vsce package

# Instalar el .vsix generado
code --install-extension claudia-vscode-0.1.0.vsix
```

---

## Uso

### Inicio automatico

La extension se activa automaticamente cuando VS Code termina de cargar. No necesitas hacer nada — el bridge inicia solo en `ws://localhost:7862`.

Veras un mensaje: **"Claud.ia Model Bridge started on ws://localhost:7862"**

### Comandos manuales

Desde la paleta de comandos (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Comando | Descripcion |
|---|---|
| `Claud.ia: Start Model Bridge` | Inicia el bridge (si no esta corriendo) |
| `Claud.ia: Stop Model Bridge` | Detiene el bridge |

### Conectar con Claud.io CLI

Con la extension activa en VS Code, en otra terminal:

```bash
CLAUDE_CODE_USE_VSCODE=true claudio
```

Para usar un modelo especifico:

```bash
CLAUDE_CODE_USE_VSCODE=true VSCODE_BRIDGE_MODEL=copilot:gpt-4o claudio
```

---

## Protocolo

La comunicacion es via mensajes JSON sobre WebSocket. Hay 2 tipos de request:

### 1. Descubrir modelos disponibles

**Cliente envia:**

```json
{ "type": "list-models" }
```

**Server responde:**

```json
{
  "type": "models",
  "models": [
    {
      "id": "copilot:gpt-4o",
      "name": "GitHub - GPT-4o (copilot:gpt-4o)",
      "contextWindow": 128000,
      "supportsTools": true
    }
  ]
}
```

### 2. Chat con streaming

**Cliente envia:**

```json
{
  "type": "chat",
  "id": "unique-request-id",
  "payload": {
    "modelId": "copilot:gpt-4o",
    "systemPrompt": "You are a coding assistant.",
    "messages": [
      { "role": "user", "content": "Explain React hooks" }
    ],
    "tools": [
      {
        "name": "read_file",
        "description": "Reads a file from disk",
        "parameters": { "type": "object", "properties": { "path": { "type": "string" } } }
      }
    ]
  }
}
```

El campo `tools` es opcional. Si se envia, la extension los pasa al modelo como `LanguageModelChatTool`.

**Server responde (streaming):**

```json
{ "id": "req-1", "type": "text", "text": "React hooks allow..." }
{ "id": "req-1", "type": "text", "text": " you to use state..." }
{ "id": "req-1", "type": "tool_call", "toolCallId": "call_1", "name": "read_file", "input": { "path": "src/app.tsx" } }
{ "id": "req-1", "type": "done", "usage": { "inputTokens": 0, "outputTokens": 0 } }
```

### Tipos de respuesta

| `type` | Descripcion | Campos |
|---|---|---|
| `text` | Fragmento de texto en streaming | `id`, `text` |
| `tool_call` | El modelo quiere llamar a una herramienta | `id`, `toolCallId`, `name`, `input` |
| `done` | Respuesta completa | `id`, `usage` |
| `error` | Error durante el procesamiento | `id`, `error` |

---

## Integracion con otros clientes

Cualquier aplicacion puede conectarse al bridge. Ejemplo minimo en JavaScript:

```javascript
const ws = new WebSocket('ws://localhost:7862');

ws.onopen = () => {
  // Descubrir modelos
  ws.send(JSON.stringify({ type: 'list-models' }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'models') {
    // Enviar un chat request
    ws.send(JSON.stringify({
      type: 'chat',
      id: 'req-1',
      payload: {
        modelId: msg.models[0].id,
        messages: [{ role: 'user', content: 'Hello!' }]
      }
    }));
  }

  if (msg.type === 'text') {
    process.stdout.write(msg.text);
  }

  if (msg.type === 'done') {
    console.log('\n[Done]');
    ws.close();
  }
};
```

---

## Limitaciones

- **Token usage**: La API de VS Code no expone conteo de tokens, por lo que `inputTokens` y `outputTokens` siempre son `0`.
- **Un servidor a la vez**: Solo puede haber un bridge corriendo en el puerto 7862. Si intentas iniciar otro, la extension te avisa que ya esta activo.
- **Depende de VS Code**: El bridge solo funciona mientras VS Code esta abierto y la extension activa. Si cierras VS Code, el bridge se detiene.
- **Tool support**: El soporte de tools depende del modelo. Algunos modelos de VS Code no soportan tool calling; en ese caso las tools se ignoran silenciosamente.

---

## Estructura del proyecto

```
claudia-bridge/
  packages/
    vscode-extension/
      src/
        extension.ts       # Codigo fuente principal
      out/
        extension.js       # Compilado (generado por tsc)
      package.json         # Metadata de la extension
      tsconfig.json        # Configuracion de TypeScript
  HANDOVER_CONTEXT.md      # Documentacion tecnica del protocolo
  README.md                # Este archivo
```

---

## Desarrollo

```bash
cd claudia-bridge/packages/vscode-extension

# Compilar una vez
npm run compile

# Compilar en modo watch (recompila al guardar)
npm run watch
```

Para depurar, abre la carpeta en VS Code y presiona `F5`. Esto abre una ventana de Extension Host donde puedes probar los cambios en tiempo real.
