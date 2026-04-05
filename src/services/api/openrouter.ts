/**
 * OpenRouter client wrapper that mimics the Anthropic SDK interface.
 * Connects to OpenRouter's OpenAI-compatible API and translates
 * SSE streaming responses into Anthropic-style stream events.
 *
 * Activation: CLAUDE_CODE_USE_OPENROUTER=true
 * Config:     OPENROUTER_API_KEY (required)
 *             OPENROUTER_MODEL (default: anthropic/claude-sonnet-4)
 *             OPENROUTER_BASE_URL (default: https://openrouter.ai/api/v1)
 */

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string; role?: string }
    finish_reason?: string | null
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

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

export class OpenRouterClient {
  private baseUrl: string
  private apiKey: string
  private defaultModel: string

  constructor() {
    this.baseUrl = (
      process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
    ).replace(/\/$/, '')
    this.apiKey = process.env.OPENROUTER_API_KEY ?? ''
    this.defaultModel =
      process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4'
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
        request_id: `openrouter_${Math.random().toString(36).substring(7)}`,
      }))
    return apiPromise
  }

  private async executeRequest(
    params: any,
    abortController: AbortController,
  ): Promise<any> {
    const {
      model,
      messages,
      system,
      max_tokens,
      temperature,
      stream: isStream,
      tools,
    } = params
    // Prioritize OPENROUTER_MODEL environment variable over UI-selected model
    const resolvedModel =
      process.env.OPENROUTER_MODEL ?? model ?? this.defaultModel
    const systemText = extractSystemText(system)

    // Convert Anthropic messages to OpenAI format
    const openAIMessages: Array<{
      role: string
      content: string
      tool_calls?: any[]
    }> = []
    if (systemText) {
      openAIMessages.push({ role: 'system', content: systemText })
    }

    for (const msg of messages as any[]) {
      let content = ''
      const toolCalls: any[] = []

      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            content += block.text
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            })
          }
        }
      } else {
        content = String(msg.content)
      }

      if (msg.role === 'user') {
        const toolResultBlocks = Array.isArray(msg.content)
          ? msg.content.filter((b: any) => b.type === 'tool_result')
          : []

        for (const result of toolResultBlocks) {
          openAIMessages.push({
            role: 'tool',
            content:
              typeof result.content === 'string'
                ? result.content
                : JSON.stringify(result.content),
            // @ts-ignore
            tool_call_id: result.tool_use_id,
          })
        }
        if (content) {
          openAIMessages.push({ role: 'user', content })
        }
      } else if (msg.role === 'assistant') {
        openAIMessages.push({
          role: 'assistant',
          content: content || '',
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        })
      }
    }

    // Convert Anthropic tools to OpenAI tools
    const openAITools = tools?.map((tool: any) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }))

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/anthropics/claude-code',
        'X-Title': 'Claude Code',
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: openAIMessages,
        max_tokens: max_tokens ?? 16000,
        temperature: temperature ?? 1,
        stream: isStream ?? true,
        ...(openAITools?.length > 0 ? { tools: openAITools } : {}),
      }),
      signal: abortController.signal,
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`OpenRouter API Error (${response.status}): ${errText}`)
    }

    if (isStream) {
      return createFakeStream(
        this.handleStream(response, resolvedModel),
        abortController,
      )
    }
    // Non-streaming
    const data = (await response.json()) as any
    const choice = data.choices?.[0]
    const responseToolCalls = choice?.message?.tool_calls?.map((tc: any) => ({
      type: 'tool_use',
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments || '{}'),
    }))

    return {
      id: `msg_or_${Math.random().toString(36).substring(7)}`,
      type: 'message',
      role: 'assistant',
      model: resolvedModel,
      content: [
        { type: 'text', text: choice?.message?.content ?? '' },
        ...(responseToolCalls ?? []),
      ],
      stop_reason: choice?.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: data.usage?.prompt_tokens ?? 0,
        output_tokens: data.usage?.completion_tokens ?? 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    }
  }

  private async *handleStream(
    response: Response,
    model: string,
  ): AsyncGenerator<any> {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body from OpenRouter')

    const decoder = new TextDecoder()
    let inputTokens = 0
    let outputTokens = 0

    // message_start
    yield {
      type: 'message_start',
      message: {
        id: `msg_or_${Math.random().toString(36).substring(7)}`,
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

    let buffer = ''
    const toolCallDeltas: Map<
      number,
      { id?: string; name?: string; arguments: string }
    > = new Map()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') continue

          try {
            const chunk = JSON.parse(data) as any
            const choice = chunk.choices?.[0]
            const delta = choice?.delta

            if (delta?.content) {
              yield {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: delta.content },
              }
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index ?? 0
                let existing = toolCallDeltas.get(index)
                if (!existing) {
                  existing = { arguments: '' }
                  toolCallDeltas.set(index, existing)
                }
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.name = tc.function.name
                if (tc.function?.arguments)
                  existing.arguments += tc.function.arguments
              }
            }

            if (choice?.finish_reason === 'tool_calls' || (choice?.finish_reason === 'stop' && toolCallDeltas.size > 0)) {
              for (const [index, tc] of toolCallDeltas.entries()) {
                yield {
                  type: 'content_block_start',
                  index: index + 1,
                  content_block: {
                    type: 'tool_use',
                    id: tc.id || `or_tool_${Math.random().toString(36).substring(7)}`,
                    name: tc.name || '',
                    input: JSON.parse(tc.arguments || '{}'),
                  },
                }
                yield { type: 'content_block_stop', index: index + 1 }
              }
              toolCallDeltas.clear()
            }

            if (chunk.usage) {
              inputTokens = chunk.usage.prompt_tokens ?? inputTokens
              outputTokens = chunk.usage.completion_tokens ?? outputTokens
            }
          } catch (e) {
            // skip malformed SSE or JSON parse errors in tool arguments
          }
        }
      }
      // Final check for any remaining tool calls if finish_reason wasn't caught
      if (toolCallDeltas.size > 0) {
        for (const [index, tc] of toolCallDeltas.entries()) {
          yield {
            type: 'content_block_start',
            index: index + 1,
            content_block: {
              type: 'tool_use',
              id: tc.id || `or_tool_${Math.random().toString(36).substring(7)}`,
              name: tc.name || '',
              input: JSON.parse(tc.arguments || '{}'),
            },
          }
          yield { type: 'content_block_stop', index: index + 1 }
        }
      }
    } finally {
      // content_block_stop for text
      yield { type: 'content_block_stop', index: 0 }

      // message_delta
      yield {
        type: 'message_delta',
        delta: {
          stop_reason: toolCallDeltas.size > 0 ? 'tool_use' : 'end_turn',
          stop_sequence: null,
        },
        usage: { output_tokens: outputTokens },
      }

      // message_stop
      yield { type: 'message_stop' }
      reader.releaseLock()
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
