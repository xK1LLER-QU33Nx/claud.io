/**
 * Ollama client wrapper that mimics the Anthropic SDK interface.
 * Connects to a local Ollama instance and translates between
 * Anthropic's message format and Ollama's /api/chat endpoint.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

function logToFile(data: any, type: string) {
  const timestamp = new Date().toISOString()
  const logMessage = ` [${timestamp}] ${type}: ${JSON.stringify(data, null, 2)}\n`
  try {
    fs.appendFileSync(path.join(process.cwd(), 'ollama_debug.log'), logMessage)
  } catch (err) {
    // Ignore logging errors
  }
}

function stripSystemReminders(text: string): string {
  // Remove all <system-reminder>...</system-reminder> blocks - Ollama models don't need them
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
}

function extractSystemText(system: any): string | undefined {
  if (!system) return undefined
  if (typeof system === 'string') return stripSystemReminders(system)
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

function extractMessageText(content: any): string {
  if (!content) return ''
  if (typeof content === 'string') return stripSystemReminders(content)
  if (Array.isArray(content)) {
    return content
      .map((block: any) => {
        if (typeof block === 'string') return stripSystemReminders(block)
        if (block?.type === 'text' && block.text) return stripSystemReminders(block.text)
        // Handle tool use/results if they contain text
        if (block?.type === 'tool_use') return `[Tool Use: ${block.name}]`
        if (block?.type === 'tool_result') return `[Tool Result: ${block.content}]`
        return ''
      })
      .filter(Boolean)
      .join('\n\n')
  }
  return String(content)
}

// Ultra-short tool descriptions for local models - the name + params are usually enough
const OLLAMA_TOOL_DESCRIPTIONS: Record<string, string> = {
  Read: 'Read a file. Requires file_path (absolute path).',
  Edit: 'Edit a file by replacing old_string with new_string. Requires file_path, old_string, new_string.',
  Write: 'Write/create a file. Requires file_path and content.',
  Glob: 'Find files by glob pattern (e.g. "**/*.ts"). Requires pattern.',
  Grep: 'Search file contents with regex. Requires pattern. Optional: path, glob, output_mode.',
  Bash: 'Run a shell command. Requires command string.',
  Agent: 'Launch a sub-agent for complex tasks. Requires description and prompt.',
  Skill: 'Execute a skill/slash-command. Requires skill name.',
  ToolSearch: 'Search for available tools by name. Requires query.',
}

function transformToOllamaTool(tool: any): any {
  // Use ultra-short descriptions for Ollama; full descriptions waste context on 14B models
  const description = OLLAMA_TOOL_DESCRIPTIONS[tool.name] || (tool.description || '').split('\n')[0].substring(0, 150)

  // Simplify parameter schemas - remove verbose descriptions, keep just type info
  const rawParams = tool.parameters || tool.input_schema || { type: 'object', properties: {} }
  const simplifiedParams = simplifyParamSchema(rawParams)

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: description,
      parameters: simplifiedParams,
    },
  }
}

function simplifyParamSchema(schema: any): any {
  if (!schema || !schema.properties) return schema
  const simplified: any = {
    type: 'object',
    properties: {} as Record<string, any>,
  }
  if (schema.required) simplified.required = schema.required

  for (const [key, prop] of Object.entries<any>(schema.properties)) {
    // Keep only type, enum, and a short description
    const simple: any = { type: prop.type }
    if (prop.enum) simple.enum = prop.enum
    if (prop.description) {
      // First sentence only, max 80 chars
      const firstSentence = prop.description.split(/\.\s/)[0]
      simple.description = firstSentence.substring(0, 80)
    }
    simplified.properties[key] = simple
  }
  return simplified
}

function optimizeSystemPrompt(
  _systemText: string,
  _userMessage: string,
  _historyLength: number,
): string {
  if (process.env.OLLAMA_COMPRESS_PROMPT === 'false') return _systemText

  // Always use the compact system prompt for local models.
  // The original Claude Code system prompt is 4000+ words — way too much for a 14B model with 8K context.
  // CRITICAL: The prompt must explicitly allow text-only responses.
  // Without this, local models feel "forced" to call a tool on every turn,
  // causing hallucinated empty tool calls and infinite retry loops.
  return `You are Claude Code, an AI coding assistant running locally.

You can respond with plain text OR use tools. Use tools ONLY when the user's request specifically requires reading, writing, searching, or running commands. For greetings, questions, explanations, or conversation, just respond with text — no tools needed.

AVAILABLE TOOLS (use only when needed):
- Read: Read a file (requires absolute file_path)
- Edit: Modify a file (requires file_path, old_string, new_string)
- Write: Create a new file (requires file_path, content)
- Glob: Find files by pattern (e.g. "**/*.ts")
- Grep: Search file contents by regex
- Bash: Run shell commands (npm, git, etc)

RULES:
- Be concise. Answer directly.
- ALWAYS read a file before editing it.
- Do NOT call tools unless the task requires it.
- After a tool returns its result, process the result and respond to the user. Do NOT call the same tool again.
- Working directory: ${process.cwd()}`
}

function filterToolsByContext(tools: any[], messages: any[]): any[] {
  if (process.env.OLLAMA_FILTER_TOOLS === 'false') return tools

  const lastUserMessage = messages.findLast(
    m => m.role === 'user' || m.role === 'user',
  )?.content
  if (!lastUserMessage) return tools

  const userText = Array.isArray(lastUserMessage)
    ? lastUserMessage.map((c: any) => c.text || '').join(' ')
    : lastUserMessage
  const lowerText = stripSystemReminders(userText).toLowerCase().trim()

  // If the message is a simple greeting or conversational, don't send ANY tools.
  // This prevents local models from hallucinating tool calls for "hola", "hi", etc.
  const conversationalPatterns = [
    'hola', 'hi', 'hey', 'hello', 'buenos dias', 'buenas tardes', 'buenas noches',
    'que tal', 'como estas', 'gracias', 'thanks', 'thank you', 'ok', 'okay',
    'si', 'no', 'yes', 'cool', 'nice', 'got it', 'understood', 'entendido',
  ]
  const isConversational = lowerText.length < 30 && conversationalPatterns.some(p => lowerText.startsWith(p) || lowerText === p)
  if (isConversational) return []

  // Core Tools: Always include these as they are essential for exploration
  const baseTools = ['Read', 'Glob', 'Grep', 'Bash']

  const keywords: Record<string, string[]> = {
    Edit: [
      'edit',
      'change',
      'fix',
      'update',
      'replace',
      'refactor',
      'correct',
      'arregla',
      'modifica',
      'cambia',
      'sustituye',
      'edita',
    ],
    Write: [
      'write',
      'create',
      'new',
      'add',
      'save',
      'escribe',
      'crea',
      'nuevo',
      'agrega',
    ],
    WebFetch: [
      'web',
      'url',
      'link',
      'internet',
      'google',
      'fetch',
      'site',
      'página',
      'enlace',
    ],
    WebSearch: [
      'web',
      'url',
      'link',
      'internet',
      'google',
      'fetch',
      'site',
      'página',
      'enlace',
      'busca',
    ],
    TaskCreate: ['plan', 'todo', 'task', 'tarea', 'divide'],
    TaskUpdate: ['plan', 'todo', 'task', 'tarea', 'divide'],
    Agent: ['agent', 'investigate', 'research', 'investiga', 'analiza'],
    NotebookEdit: ['notebook', 'ipynb', 'jupyter'],
    Skill: ['skill', 'slash', 'command', 'habilidad'],
    ToolSearch: ['skill', 'slash', 'command', 'habilidad', 'herramienta'],
  }

  // If a tool was used in history, keep it to maintain context
  const previouslyUsedTools = new Set<string>()
  for (const m of messages) {
    if (m.role === 'assistant' && m.content) {
      if (Array.isArray(m.content)) {
        for (const c of m.content) {
          if (c.type === 'tool_use') previouslyUsedTools.add(c.name)
        }
      } else if (m.content.includes('{') && m.content.includes('"name":')) {
        const parsed = tryParseJsonToolCall(m.content)
        if (parsed) previouslyUsedTools.add(parsed.name)
      }
    }
  }

  return tools.filter(tool => {
    if (baseTools.includes(tool.name) || previouslyUsedTools.has(tool.name))
      return true
    return keywords[tool.name]?.some(kw => lowerText.includes(kw)) || false
  })
}

function tryParseJsonToolCall(content: string): any | null {
  const results = tryParseAllJsonToolCalls(content)
  return results.length > 0 ? results[0] : null
}

function tryParseAllJsonToolCalls(content: string): any[] {
  const results: any[] = []
  const seen = new Set<string>()

  // Extract all JSON blocks from markdown code fences and bare JSON
  const candidates: string[] = []

  // Match all ```json ... ``` blocks
  const jsonFenceRegex = /```json\s*([\s\S]*?)\s*```/g
  let match
  while ((match = jsonFenceRegex.exec(content)) !== null) {
    candidates.push(match[1].trim())
  }

  // Match all ``` ... ``` blocks (non-json)
  if (candidates.length === 0) {
    const fenceRegex = /```\s*([\s\S]*?)\s*```/g
    while ((match = fenceRegex.exec(content)) !== null) {
      candidates.push(match[1].trim())
    }
  }

  // Also try the entire content as bare JSON
  const trimmed = content.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    candidates.push(trimmed)
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed.name && (parsed.arguments || parsed.input)) {
        const name = parsed.name
        if (seen.has(name)) continue
        const input = parsed.arguments || parsed.input
        // Validate that input has actual content (not empty)
        if (typeof input === 'object' && Object.keys(input).length > 0) {
          results.push({
            type: 'tool_use',
            id: `toolu_ol_${name}_${Math.random().toString(36).substring(7)}`,
            name,
            input,
          })
          seen.add(name)
        }
      }
    } catch {
      // Not valid JSON, skip
    }
  }
  return results
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

export class OllamaClient {
  private baseUrl: string
  private defaultModel: string

  constructor() {
    this.baseUrl = (
      process.env.OLLAMA_HOST ?? 'http://localhost:11434'
    ).replace(/\/$/, '')
    this.defaultModel = process.env.OLLAMA_MODEL ?? 'llama3.2'
  }

  private countConsecutiveToolErrors(messages: any[]): number {
    // Count how many of the most recent messages are tool_result errors
    let count = 0
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      const content = Array.isArray(msg.content) ? msg.content : []
      const hasToolError = content.some(
        (b: any) => b.type === 'tool_result' && b.is_error,
      )
      if (hasToolError) {
        count++
      } else {
        break
      }
    }
    return count
  }

  /**
   * Detect if the model is looping: calling the same tool with the same arguments
   * repeatedly, even when calls succeed. This happens when Qwen re-reads the same
   * file instead of summarizing the result. Returns the set of tool+args keys that
   * have already been executed so we can block duplicates.
   */
  private getExecutedToolCalls(messages: any[]): Set<string> {
    const executed = new Set<string>()
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      const content = Array.isArray(msg.content) ? msg.content : []
      for (const block of content) {
        if (block.type === 'tool_use' && block.input && Object.keys(block.input).length > 0) {
          // Create a stable key: tool name + sorted JSON of args
          const key = `${block.name}::${JSON.stringify(block.input, Object.keys(block.input).sort())}`
          executed.add(key)
        }
      }
    }
    return executed
  }

  /**
   * Count how many tool calls the assistant has made in the current turn
   * (consecutive assistant messages with tool_use, followed by tool results).
   */
  private countToolCallsInCurrentTurn(messages: any[]): number {
    let count = 0
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant') {
        const content = Array.isArray(msg.content) ? msg.content : []
        const toolUses = content.filter((b: any) => b.type === 'tool_use')
        count += toolUses.length
      } else if (msg.role === 'user') {
        const content = Array.isArray(msg.content) ? msg.content : []
        const hasToolResult = content.some((b: any) => b.type === 'tool_result')
        if (!hasToolResult) break // Reached a real user message, stop counting
      }
    }
    return count
  }

  private _create(params: any, options?: any): any {
    const abortController = new AbortController()

    if (options?.signal) {
      const externalSignal = options.signal as AbortSignal
      if (externalSignal.aborted) {
        abortController.abort()
      } else {
        externalSignal.addEventListener('abort', () => abortController.abort(), {
          once: true,
        })
      }
    }

    const promise = this.executeRequest(params, abortController)
    const apiPromise = promise as any
    apiPromise.withResponse = () =>
      promise.then((data: any) => ({
        data,
        response: new Response(null, { status: 200 }),
        request_id: `ollama_${Math.random().toString(36).substring(7)}`,
      }))
    return apiPromise
  }

  private async executeRequest(
    params: any,
    abortController: AbortController,
  ): Promise<any> {
    logToFile(params, 'PARAMS')
    const {
      model,
      messages,
      system,
      max_tokens,
      temperature,
      stream: isStream,
      tools,
    } = params

    const resolvedModel = process.env.OLLAMA_MODEL ?? model ?? this.defaultModel
    const systemText = extractSystemText(system)

    const ollamaMessages: any[] = []
    if (systemText) {
      ollamaMessages.push({ role: 'system', content: systemText })
    }

    for (const msg of messages) {
      if (msg.role === 'assistant') {
        const content = Array.isArray(msg.content) ? msg.content : []
        const textBlocks = content.filter((b: any) => b.type === 'text')
        // Only include tool_use blocks that have actual input (non-empty)
        const toolUseBlocks = content.filter(
          (b: any) => b.type === 'tool_use' && b.input && Object.keys(b.input).length > 0,
        )

        // Clean text: remove JSON tool call blocks that were parsed as fallbacks
        // so Ollama doesn't see them as text AND as tool_calls
        let textContent = textBlocks.map((b: any) => b.text).join('\n\n') ||
          (typeof msg.content === 'string' ? msg.content : '')
        if (toolUseBlocks.length > 0) {
          // Strip JSON blocks from text that match tool calls we're already sending
          textContent = textContent
            .replace(/```json\s*\{[\s\S]*?\}\s*```/g, '')
            .replace(/\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/g, '')
            .trim()
        }

        const ollamaMsg: any = {
          role: 'assistant',
          content: textContent,
        }

        if (toolUseBlocks.length > 0) {
          ollamaMsg.tool_calls = toolUseBlocks.map((b: any) => ({
            type: 'function',
            function: {
              name: b.name,
              arguments: b.input,
            },
          }))
        }
        ollamaMessages.push(ollamaMsg)
      } else {
        // Handle user/system roles
        const content = Array.isArray(msg.content) ? msg.content : []
        const toolResultBlocks = content.filter(
          (b: any) => b.type === 'tool_result',
        )
        const otherBlocks = content.filter((b: any) => b.type !== 'tool_result')

        if (otherBlocks.length > 0 || typeof msg.content === 'string') {
          ollamaMessages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: extractMessageText(msg.content),
          })
        }

        for (const block of toolResultBlocks) {
          let toolName = 'unknown'
          if (block.tool_use_id) {
            // Extract tool name from stable ID format toolu_ol_{name}_{random}
            const parts = block.tool_use_id.split('_')
            if (parts.length >= 3 && parts[1] === 'ol') {
              toolName = parts[2]
            } else {
              toolName = block.tool_use_id.split('-')[0]
            }
          }

          let toolContent = typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content)

          // Truncate large tool results to prevent blowing out Ollama's context window.
          // A 14B model with 8K context can't process a 2000-line file anyway.
          const maxToolResultChars = 3000
          if (toolContent.length > maxToolResultChars) {
            toolContent = toolContent.substring(0, maxToolResultChars) +
              '\n\n[... truncated - file too large for context. Summarize what you can see above.]'
          }

          ollamaMessages.push({
            role: 'tool',
            tool_name: toolName,
            content: toolContent,
          })
        }
      }
    }

    const systemMsg = ollamaMessages.find(m => m.role === 'system')
    if (systemMsg) {
      const userMsg = messages[messages.length - 1]?.content?.[0] as any
      const userText = userMsg?.text || ''
      systemMsg.content = optimizeSystemPrompt(
        systemMsg.content,
        userText,
        messages.length - 1,
      )
    }

    // Lazy load tools based on context to save tokens and improve focus
    const filteredTools = filterToolsByContext(tools || [], messages)
    const ollamaTools = filteredTools.map((tool: any) =>
      transformToOllamaTool(tool),
    )

    // Loop breaker 1: if the last N messages are all tool errors for the same tool, stop sending tools
    const recentErrors = this.countConsecutiveToolErrors(messages)
    // Loop breaker 2: if the model has already made 3+ tool calls this turn, force text response
    const toolCallsThisTurn = this.countToolCallsInCurrentTurn(messages)
    // Track already-executed tool+args pairs to block duplicates
    const executedToolCalls = this.getExecutedToolCalls(messages)
    const skipTools = recentErrors >= 2 || toolCallsThisTurn >= 3

    logToFile({
      recentErrors,
      toolCallsThisTurn,
      executedToolCallCount: executedToolCalls.size,
      skipTools,
    }, 'LOOP_CHECK')

    const contextSize = Number.parseInt(
      process.env.OLLAMA_CONTEXT_SIZE ?? '8192',
      10,
    )

    const requestBody: any = {
      model: resolvedModel,
      messages: ollamaMessages,
      stream: isStream ?? true,
      options: {
        num_predict: max_tokens,
        temperature: (tools?.length > 0 && !skipTools) ? 0 : (temperature ?? 0.7),
        num_ctx: contextSize,
      },
    }

    if (ollamaTools && ollamaTools.length > 0 && !skipTools) {
      requestBody.tools = ollamaTools
    }

    // When we're forcing a text-only response (tools stripped due to looping),
    // append a hint to the last message so the model knows to summarize
    if (skipTools && toolCallsThisTurn >= 3) {
      const lastMsg = requestBody.messages[requestBody.messages.length - 1]
      if (lastMsg?.role === 'tool') {
        // Add a user message after the tool result telling the model to respond with text
        requestBody.messages.push({
          role: 'user',
          content: 'Now summarize the results above and respond to my original question. Do not call any more tools.',
        })
      }
    }

    logToFile(requestBody, 'REQUEST')

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: abortController.signal,
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Ollama API Error (${response.status}): ${errText}`)
    }

    if (isStream) {
      return createFakeStream(
        this.handleStream(response, resolvedModel, executedToolCalls),
        abortController,
      )
    }

    const data = await response.json()
    logToFile(data, 'RESPONSE')

    const toolCalls = data.message?.tool_calls
    const content: any[] = []

    if (data.message?.content) {
      // Fallback: check if the content itself is a JSON tool call
      const fallbackToolCall = tryParseJsonToolCall(data.message.content)
      if (fallbackToolCall) {
        content.push(fallbackToolCall)
      } else {
        content.push({ type: 'text', text: data.message.content })
      }
    }

    if (toolCalls && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const toolName = tc.function.name

        // Check if we already have a fallback for this tool name that has arguments
        const fallback = content.find(
          c => c.type === 'tool_use' && c.name === toolName,
        )
        const nativeHasInput =
          Object.keys(tc.function.arguments || {}).length > 0

        // If fallback has input but native doesn't, skip native to avoid InputValidationError
        if (fallback && !nativeHasInput) {
          continue
        }

        content.push({
          type: 'tool_use',
          id: `toolu_ol_${toolName}_${Math.random().toString(36).substring(7)}`,
          name: toolName,
          input: tc.function.arguments,
        })
      }
    }

    return {
      id: `msg_ol_${Math.random().toString(36).substring(7)}`,
      type: 'message',
      role: 'assistant',
      model: resolvedModel,
      content,
      stop_reason:
        content.some((b: any) => b.type === 'tool_use') || toolCalls?.length > 0
          ? 'tool_use'
          : 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: data.prompt_eval_count ?? 0,
        output_tokens: data.eval_count ?? 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    }
  }

  private async *handleStream(
    response: Response,
    model: string,
    executedToolCalls: Set<string> = new Set(),
  ): AsyncGenerator<any> {
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    if (!reader) return

    let accumulatedContent = ''
    let hasToolCalls = false
    let contentBlockIndex = 1
    let outputTokens = 0
    const yieldedToolNames = new Set<string>()
    const emptyNativeTools = new Set<string>()
    const pendingNativeTools = new Map<string, any>()

    yield {
      type: 'message_start',
      message: {
        id: `msg_ol_${Math.random().toString(36).substring(7)}`,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    }

    // Start primary text block
    yield {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }

    try {
      let buffer = ''

      // IMPORTANT: We accumulate EVERYTHING first, then emit at the end.
      // We cannot stream text in real-time because Ollama models write tool call
      // JSON in the text content. If we stream that JSON as text, Claude Code sees
      // it as both text AND a tool_use (from our repair pass), causing double execution.
      // The tradeoff is slightly delayed output, but correct behavior.

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          let chunk: any
          try {
            chunk = JSON.parse(line)
          } catch {
            continue
          }

          if (chunk.message?.content) {
            accumulatedContent += chunk.message.content
          }

          if (chunk.message?.tool_calls) {
            for (const tc of chunk.message.tool_calls) {
              const toolName = tc.function?.name
              if (!toolName) continue
              const args = tc.function.arguments || {}
              if (Object.keys(args).length > 0) {
                pendingNativeTools.set(toolName, args)
              } else {
                emptyNativeTools.add(toolName)
              }
            }
          }

          if (chunk.done) {
            outputTokens = chunk.eval_count ?? 0
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer.trim())
          if (chunk.message?.content) accumulatedContent += chunk.message.content
          if (chunk.message?.tool_calls) {
            for (const tc of chunk.message.tool_calls) {
              const toolName = tc.function?.name
              if (!toolName) continue
              const args = tc.function.arguments || {}
              if (Object.keys(args).length > 0) {
                pendingNativeTools.set(toolName, args)
              } else {
                emptyNativeTools.add(toolName)
              }
            }
          }
          if (chunk.done) outputTokens = chunk.eval_count ?? 0
        } catch { /* ignore */ }
      }

      // Now decide what to emit: tool calls from JSON in text, native tool calls, or plain text.
      logToFile({
        accumulatedContent: accumulatedContent.substring(0, 500),
        emptyNativeTools: [...emptyNativeTools],
        pendingNativeTools: Object.fromEntries(pendingNativeTools),
      }, 'REPAIR_PASS')

      const textParsed = tryParseAllJsonToolCalls(accumulatedContent)
      logToFile({ textParsed, yieldedToolNames: [...yieldedToolNames] }, 'REPAIR_RESULT')

      // Filter out duplicate tool calls (same tool + same args already executed)
      const filterDuplicates = (toolCalls: any[]): any[] => {
        return toolCalls.filter(tc => {
          const key = `${tc.name}::${JSON.stringify(tc.input, Object.keys(tc.input).sort())}`
          if (executedToolCalls.has(key)) {
            logToFile({ blocked: key }, 'DEDUP_BLOCKED')
            return false
          }
          return true
        })
      }

      if (textParsed.length > 0) {
        const newToolCalls = filterDuplicates(textParsed)

        // Text contained tool call JSON — emit as tool_use, strip JSON from text
        let cleanText = accumulatedContent
        // Remove JSON blocks from text
        cleanText = cleanText.replace(/```json\s*\{[\s\S]*?\}\s*```/g, '').trim()
        cleanText = cleanText.replace(/\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/g, '').trim()

        if (newToolCalls.length === 0) {
          // All tool calls were duplicates — force a text response
          // Add a hint so the model's output makes sense to the user
          const fallbackText = cleanText || 'I already read that file. Let me summarize what I found.'
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: fallbackText },
          }
        } else {
          // Emit cleaned text if there's any left
          if (cleanText) {
            yield {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: cleanText },
            }
          }

          // Emit non-duplicate tool calls using proper Anthropic streaming format:
          // content_block_start (input: {}) → content_block_delta (input_json_delta) → content_block_stop
          for (const tc of newToolCalls) {
            const idx = contentBlockIndex++
            yield {
              type: 'content_block_start',
              index: idx,
              content_block: { type: 'tool_use', id: tc.id, name: tc.name, input: {} },
            }
            yield {
              type: 'content_block_delta',
              index: idx,
              delta: { type: 'input_json_delta', partial_json: JSON.stringify(tc.input) },
            }
            yield { type: 'content_block_stop', index: idx }
            hasToolCalls = true
            yieldedToolNames.add(tc.name)
          }
        }
      } else if (pendingNativeTools.size > 0) {
        // Native tool calls with args — filter duplicates
        const nativeAsList = [...pendingNativeTools.entries()].map(([name, args]) => ({
          type: 'tool_use' as const,
          id: `toolu_ol_${name}_${Math.random().toString(36).substring(7)}`,
          name,
          input: args,
        }))
        const newNative = filterDuplicates(nativeAsList)

        if (accumulatedContent.trim()) {
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: accumulatedContent },
          }
        }

        if (newNative.length === 0 && !accumulatedContent.trim()) {
          // All native tool calls were duplicates, no text — provide fallback
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'I already performed that action. Let me summarize the results.' },
          }
        } else {
          for (const tc of newNative) {
            const idx = contentBlockIndex++
            yield {
              type: 'content_block_start',
              index: idx,
              content_block: { type: 'tool_use', id: tc.id, name: tc.name, input: {} },
            }
            yield {
              type: 'content_block_delta',
              index: idx,
              delta: { type: 'input_json_delta', partial_json: JSON.stringify(tc.input) },
            }
            yield { type: 'content_block_stop', index: idx }
            hasToolCalls = true
            yieldedToolNames.add(tc.name)
          }
        }
      } else {
        // Plain text response — just emit it
        if (accumulatedContent) {
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: accumulatedContent },
          }
        } else {
          // Empty response — the model produced nothing (likely context overflow).
          // Emit a fallback so the user doesn't see a blank response.
          logToFile({ reason: 'empty_response_fallback' }, 'EMPTY_RESPONSE')
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: '[The model produced an empty response — this usually means the context was too large. Try a simpler request or a shorter file.]' },
          }
        }
      }
    } finally {
      // Close primary text block
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
      reader.releaseLock()
    }
  }

  // Anthropic SDK compatibility shims
  get beta() {
    return {
      messages: {
        create: (params: any, options?: any) => this._create(params, options),
      },
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
