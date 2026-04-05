/**
 * VS Code Bridge client wrapper that mimics the Anthropic SDK interface.
 * Connects to a VS Code extension's WebSocket model server and translates
 * between Anthropic's message format and the bridge protocol.
 *
 * Activation: CLAUDE_CODE_USE_VSCODE=true
 * Config:     VSCODE_BRIDGE_URL (default: ws://localhost:7862/models)
 *             VSCODE_BRIDGE_MODEL (default: copilot:gpt-4o)
 */

function extractSystemText(system: any): string | undefined {
  if (!system) return undefined
  if (typeof system === 'string') return system
  if (Array.isArray(system)) {
    return system
      .map((block: any) => {
        if (typeof block === 'string') return block
        if (block?.type === 'text' && block.text) return block.text
        return ''
      })
      .filter(Boolean)
      .join('\n\n')
  }
  return String(system)
}

function createFakeStream(
  iterable: AsyncIterable<any>,
  abortController: AbortController,
): any {
  return {
    controller: abortController,
    [Symbol.asyncIterator]() {
      return iterable[Symbol.asyncIterator]()
    },
  }
}

export class VSCodeBridgeClient {
  private baseUrl: string
  private defaultModel: string

  constructor() {
    this.baseUrl =
      process.env.VSCODE_BRIDGE_URL ?? 'ws://localhost:7862/models'
    this.defaultModel =
      process.env.VSCODE_BRIDGE_MODEL ?? 'copilot:gpt-4o'
  }

  private _create(params: any, options?: any): any {
    const abortController = new AbortController()

    if (options?.signal) {
      const externalSignal = options.signal as AbortSignal
      if (externalSignal.aborted) {
        abortController.abort()
      } else {
        externalSignal.addEventListener(
          'abort',
          () => abortController.abort(),
          { once: true },
        )
      }
    }

    const promise = this.executeRequest(params, abortController)
    const apiPromise = promise as any
    apiPromise.withResponse = () =>
      promise.then((data: any) => ({
        data,
        response: new Response(null, { status: 200 }),
        request_id: `vscode_${Math.random().toString(36).substring(7)}`,
      }))
    return apiPromise
  }

  private async executeRequest(
    params: any,
    abortController: AbortController,
  ): Promise<any> {
    const { model, messages, system, stream: isStream, tools } = params
    // Prioritize VSCODE_BRIDGE_MODEL environment variable over UI-selected model
    const resolvedModel = process.env.VSCODE_BRIDGE_MODEL ?? model ?? this.defaultModel
    const systemText = extractSystemText(system)

    // Serialize messages: VS Code LM API only accepts string content or specific tool formats
    const serializedMessages: Array<{ role: string; content: string; tool_calls?: any[] }> = []

    for (const m of messages as any[]) {
      let content = ''
      const toolCalls: any[] = []

      if (typeof m.content === 'string') {
        content = m.content
      } else if (Array.isArray(m.content)) {
        for (const block of m.content) {
          if (block.type === 'text') {
            content += block.text
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              name: block.name,
              input: block.input,
            })
          }
        }
      }

      if (m.role === 'user') {
        // Handle tool results
        const toolResultBlocks = Array.isArray(m.content)
          ? m.content.filter((b: any) => b.type === 'tool_result')
          : []

        for (const result of toolResultBlocks) {
          serializedMessages.push({
            role: 'tool',
            content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
            // @ts-ignore
            tool_call_id: result.tool_use_id,
          })
        }
        if (content) {
          serializedMessages.push({ role: 'user', content })
        }
      } else if (m.role === 'assistant') {
        serializedMessages.push({
          role: 'assistant',
          content,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        })
      }
    }

    // Convert Anthropic tools for the bridge
    const bridgeTools = tools?.map((tool: any) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    }))

    if (isStream) {
      return createFakeStream(
        this.handleStream(
          resolvedModel,
          serializedMessages,
          systemText,
          bridgeTools,
          abortController,
        ),
        abortController,
      )
    }

    // Non-streaming: collect all text from the stream
    let fullText = ''
    const responseToolCalls: any[] = []
    for await (const event of this.handleStreamRaw(
      resolvedModel,
      serializedMessages,
      systemText,
      bridgeTools,
      abortController,
    )) {
      if (event.type === 'text') {
        fullText += event.text
      } else if (event.type === 'tool_call') {
        responseToolCalls.push({
          type: 'tool_use',
          id: event.toolCallId || `vsc_tool_${Math.random().toString(36).substring(7)}`,
          name: event.name,
          input: event.input,
        })
      }
    }
    return {
      id: `msg_vsc_${Math.random().toString(36).substring(7)}`,
      type: 'message',
      role: 'assistant',
      model: resolvedModel,
      content: [
        { type: 'text', text: fullText },
        ...responseToolCalls,
      ],
      stop_reason: responseToolCalls.length > 0 ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    }
  }

  /**
   * Raw stream events from the WebSocket bridge.
   */
  private async *handleStreamRaw(
    model: string,
    serializedMessages: Array<{ role: string; content: string }>,
    systemText: string | undefined,
    tools: any[] | undefined,
    abortController: AbortController,
  ): AsyncGenerator<{
    type: string
    text?: string
    usage?: any
    error?: string
    toolCallId?: string
    name?: string
    input?: any
  }> {
    const requestId = Math.random().toString(36).substring(7)

    const outputQueue: Array<{
      type: string
      text?: string
      usage?: any
      error?: string
      toolCallId?: string
      name?: string
      input?: any
    }> = []
    let done = false
    let resolveNext: (() => void) | null = null

    const socket = new WebSocket(this.baseUrl)

    abortController.signal.addEventListener('abort', () => {
      socket.close()
      done = true
      if (resolveNext) resolveNext()
    })

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'chat',
          id: requestId,
          payload: {
            modelId: model,
            messages: serializedMessages,
            systemPrompt: systemText,
            tools,
          },
        }),
      )
    }

    socket.onmessage = (event: any) => {
      try {
        const data = JSON.parse(
          typeof event.data === 'string' ? event.data : event.data.toString(),
        )
        if (data.id !== requestId) return

        if (data.type === 'text') {
          outputQueue.push({
            type: 'text',
            text: data.text ?? data.payload?.text,
          })
        } else if (data.type === 'tool_call') {
          outputQueue.push({
            type: 'tool_call',
            toolCallId: data.toolCallId || data.payload?.toolCallId,
            name: data.name || data.payload?.name,
            input: data.input || data.payload?.input,
          })
        } else if (data.type === 'done') {
          outputQueue.push({
            type: 'done',
            usage: data.usage ?? data.payload?.usage ?? {
              inputTokens: 0,
              outputTokens: 0,
            },
          })
          done = true
          socket.close()
        } else if (data.type === 'error') {
          outputQueue.push({
            type: 'error',
            error: data.error ?? data.payload?.error ?? 'Unknown bridge error',
          })
          done = true
          socket.close()
        }
      } catch {
        // skip malformed
      }
      if (resolveNext) {
        resolveNext()
        resolveNext = null
      }
    }

    socket.onerror = () => {
      outputQueue.push({
        type: 'error',
        error: `Cannot connect to VS Code bridge at ${this.baseUrl}`,
      })
      done = true
      if (resolveNext) resolveNext()
    }

    while (!done || outputQueue.length > 0) {
      if (outputQueue.length > 0) {
        yield outputQueue.shift()!
      } else {
        await new Promise<void>(r => {
          resolveNext = r
        })
      }
    }
  }

  /**
   * Converts raw bridge events into Anthropic SDK-compatible stream events.
   */
  private async *handleStream(
    model: string,
    serializedMessages: Array<{ role: string; content: string }>,
    systemText: string | undefined,
    tools: any[] | undefined,
    abortController: AbortController,
  ): AsyncGenerator<any> {
    // message_start
    yield {
      type: 'message_start',
      message: {
        id: `msg_vsc_${Math.random().toString(36).substring(7)}`,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    }

    // content_block_start
    yield {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }

    let outputTokens = 0

    let hasToolCalls = false
    try {
      for await (const event of this.handleStreamRaw(
        model,
        serializedMessages,
        systemText,
        tools,
        abortController,
      )) {
        if (event.type === 'text' && event.text) {
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: event.text },
          }
        } else if (event.type === 'tool_call') {
          hasToolCalls = true
          yield {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'tool_use',
              id:
                event.toolCallId ||
                `vsc_tool_${Math.random().toString(36).substring(7)}`,
              name: event.name || '',
              input: event.input || {},
            },
          }
          yield { type: 'content_block_stop', index: 1 }
        } else if (event.type === 'done') {
          outputTokens = event.usage?.outputTokens ?? 0
        } else if (event.type === 'error') {
          throw new Error(event.error)
        }
      }
    } finally {
      yield { type: 'content_block_stop', index: 0 }

      yield {
        type: 'message_delta',
        delta: {
          stop_reason: hasToolCalls ? 'tool_use' : 'end_turn',
          stop_sequence: null,
        },
        usage: { output_tokens: outputTokens },
      }

      yield { type: 'message_stop' }
    }
  }

  get beta() {
    return {
      messages: this.messages,
    }
  }

  get messages() {
    return {
      create: (params: any, options?: any) => this._create(params, options),
      stream: (params: any, options?: any) =>
        this._create({ ...params, stream: true }, options),
    }
  }
}
