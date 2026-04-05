import * as vscode from 'vscode';
import { WebSocketServer, WebSocket } from 'ws';

let server: WebSocketServer | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Claud.ia VS Code Bridge is now active');

    const startCommand = vscode.commands.registerCommand('claudia.startBridge', () => {
        startBridge();
    });

    const stopCommand = vscode.commands.registerCommand('claudia.stopBridge', () => {
        stopBridge();
    });

    context.subscriptions.push(startCommand, stopCommand);

    // Auto-start on activation
    startBridge();
}

function startBridge() {
    if (server) {
        vscode.window.showInformationMessage('Claud.ia Bridge is already running.');
        return;
    }

    const port = 7862;
    server = new WebSocketServer({ port });

    server.on('connection', (ws: WebSocket) => {
        console.log('[claudia-bridge] Client connected');

        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());

                switch (message.type) {
                    case 'list-models': {
                        const models = await vscode.lm.selectChatModels({});
                        ws.send(JSON.stringify({
                            type: 'models',
                            models: models.map(m => ({
                                id: m.id,
                                name: `${m.vendor} - ${m.family} (${m.id})`,
                                contextWindow: m.maxInputTokens ?? 128000,
                                supportsTools: true
                            }))
                        }));
                        break;
                    }

                    case 'chat':
                        await handleChat(ws, message.id, message.payload);
                        break;
                }
            } catch (err) {
                ws.send(JSON.stringify({ type: 'error', error: String(err) }));
            }
        });
    });

    vscode.window.showInformationMessage(`Claud.ia Model Bridge started on ws://localhost:${port}`);
}

async function handleChat(ws: WebSocket, requestId: string, payload: any) {
    const { modelId, messages, systemPrompt, tools } = payload;

    try {
        const models = await vscode.lm.selectChatModels({ id: modelId });
        const model = models[0] || (await vscode.lm.selectChatModels({}))[0];

        if (!model) {
            ws.send(JSON.stringify({ id: requestId, type: 'error', error: 'No models available in VS Code.' }));
            return;
        }

        const chatMessages: vscode.LanguageModelChatMessage[] = [];
        if (systemPrompt) {
            chatMessages.push(vscode.LanguageModelChatMessage.Assistant(systemPrompt));
        }

        for (const m of messages) {
            if (m.role === 'user') {
                chatMessages.push(vscode.LanguageModelChatMessage.User(m.content));
            } else if (m.role === 'assistant') {
                chatMessages.push(vscode.LanguageModelChatMessage.Assistant(m.content));
            } else if (m.role === 'tool') {
                // Tool results: wrap as user message with context so the model understands
                chatMessages.push(
                    vscode.LanguageModelChatMessage.User(
                        `[Tool Result (tool_call_id: ${m.tool_call_id})]: ${m.content}`
                    )
                );
            }
        }

        // Build request options with tools if provided
        const requestOptions: vscode.LanguageModelChatRequestOptions = {};

        if (tools && Array.isArray(tools) && tools.length > 0) {
            requestOptions.tools = tools.map((t: any): vscode.LanguageModelChatTool => ({
                name: t.name,
                description: t.description ?? '',
                inputSchema: t.parameters ?? {},
            }));
        }

        const tokenSource = new vscode.CancellationTokenSource();
        const response = await model.sendRequest(chatMessages, requestOptions, tokenSource.token);

        // The VS Code LM API streams via response.stream which yields text and tool call parts
        if ('stream' in response && response.stream) {
            for await (const part of response.stream as AsyncIterable<any>) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    ws.send(JSON.stringify({ id: requestId, type: 'text', text: part.value }));
                } else if (part instanceof vscode.LanguageModelToolCallPart) {
                    ws.send(JSON.stringify({
                        id: requestId,
                        type: 'tool_call',
                        toolCallId: part.callId,
                        name: part.name,
                        input: typeof part.input === 'string' ? JSON.parse(part.input) : part.input
                    }));
                }
            }
        } else {
            // Fallback: older API that only exposes response.text
            for await (const fragment of response.text) {
                ws.send(JSON.stringify({ id: requestId, type: 'text', text: fragment }));
            }
        }

        ws.send(JSON.stringify({ id: requestId, type: 'done', usage: { inputTokens: 0, outputTokens: 0 } }));

    } catch (err) {
        ws.send(JSON.stringify({ id: requestId, type: 'error', error: String(err) }));
    }
}

function stopBridge() {
    if (server) {
        server.close();
        server = undefined;
        vscode.window.showInformationMessage('Claud.ia Bridge stopped.');
    }
}

export function deactivate() {
    stopBridge();
}
