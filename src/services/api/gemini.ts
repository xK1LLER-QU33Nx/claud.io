import type { Anthropic } from '@anthropic-ai/sdk'
import type { GoogleAuth } from 'google-auth-library'

/**
 * Sanitize JSON schema for Gemini.
 * Gemini's Vertex AI endpoint is strict and does not allow '$schema'
 * and other metadata fields in function declarations.
 */
function sanitizeSchema(schema: any, isRoot = true): any {
  if (!schema || typeof schema !== 'object') return schema

  const res = JSON.parse(JSON.stringify(schema))

  const forbidden = [
    '$schema',
    'additionalProperties',
    'default',
    'examples',
    'title',
    'exclusiveMinimum',
    'exclusiveMaximum',
  ]
  // Previously we were deleting description here, which was wrong.
  // Gemini uses description for each parameter to understand its purpose.

  for (const key of forbidden) {
    delete res[key]
  }

  if (isRoot && !res.type) res.type = 'object'

  if (res.properties) {
    for (const key of Object.keys(res.properties)) {
      res.properties[key] = sanitizeSchema(res.properties[key], false)
    }
  }

  if (res.items) {
    res.items = sanitizeSchema(res.items, false)
  }

  return res
}

/**
 * Extract the system prompt text from the various formats Claude Code may pass.
 * It can be a string, an array of text blocks, or undefined.
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

/**
 * Create a fake Stream object that wraps an AsyncIterable and has a `controller`
 * property, matching the interface that claude.ts expects from the Anthropic SDK.
 */
function createFakeStream(
  iterable: AsyncIterable<any>,
  abortController: AbortController,
): any {
  const stream: any = {
    controller: abortController,
    [Symbol.asyncIterator]() {
      return iterable[Symbol.asyncIterator]()
    },
  }
  return stream
}

// Module-level cache: maps tool_use IDs from a response to the thought_signature
// that was on that response's content block. Gemini thinking models require
// thought_signature to be replayed on subsequent requests containing function calls.
const thoughtSignatureCache = new Map<string, string>()

export class VertexGeminiClient {
  private googleAuth: GoogleAuth
  private projectId: string
  private region: string

  constructor(options: {
    googleAuth: GoogleAuth
    projectId: string
    region: string
  }) {
    this.googleAuth = options.googleAuth
    this.projectId = options.projectId
    this.region = options.region
  }

  /**
   * Inner implementation shared by messages.create and beta.messages.create.
   * Accepts any params shape (MessageCreateParams or BetaMessageStreamParams)
   * and returns the appropriate response.
   */
  private _create(params: any, options?: any): any {
    const abortController = new AbortController()

    // Wire up external abort signal if provided
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

    // Mimic Anthropic's APIPromise shape.
    // The SDK's .withResponse() returns { data, response, request_id }.
    const apiPromise = promise as any
    apiPromise.withResponse = () =>
      promise.then((data: any) => ({
        data,
        response: new Response(null, { status: 200 }),
        request_id: `gemini_${Math.random().toString(36).substring(7)}`,
      }))

    return apiPromise
  }

  private async executeRequest(
    params: any,
    abortController: AbortController,
  ): Promise<any> {
    try {
      const {
        model,
        messages,
        system,
        tools,
        max_tokens,
        temperature,
        stream: isStream,
      } = params

      // 1. Build Google payload
      const contents: any[] = []
      let lastRole: string | null = null

      for (const m of messages as any[]) {
        const role = m.role === 'assistant' ? 'model' : 'user'

        const parts = Array.isArray(m.content)
          ? m.content.map((block: any) => {
              if (block.type === 'text') return { text: block.text }
              if (block.type === 'tool_use') {
                // Look up cached thoughtSignature for this tool call
                const sig = block.id ? thoughtSignatureCache.get(block.id) : undefined
                const part: any = { functionCall: { name: block.name, args: block.input } }
                if (sig) {
                  part.thoughtSignature = sig
                }
                return part
              }
        if (block.type === 'tool_result') {
          // Extract original function name from CLI tool_use_id (e.g. "call_ls_abc123" -> "ls")
          let toolName = block.tool_use_id
          if (toolName.startsWith('call_')) {
            const parts = toolName.split('_')
            if (parts.length >= 2) {
              toolName = parts[1]
            }
          }

          return {
            functionResponse: {
              name: toolName,
              response: {
                content:
                  typeof block.content === 'string'
                    ? block.content
                    : JSON.stringify(block.content),
              },
            },
          }
        }
              return { text: JSON.stringify(block) }
            })
          : [{ text: String(m.content) }]

        if (role === lastRole && contents.length > 0) {
          // Group with previous content block of same role
          const lastContent = contents[contents.length - 1]
          lastContent.parts.push(...parts)
        } else {
          // New content block
          contents.push({ role, parts })
          lastRole = role
        }
      }

      const googleTools = tools?.length
        ? [
            {
              functionDeclarations: tools.map((t: any) => ({
                name: t.name,
                description: t.description,
                parameters: sanitizeSchema(t.input_schema),
              })),
            },
          ]
        : undefined

      const systemText = extractSystemText(system)

      const payload: any = {
        contents,
        ...(systemText && {
          systemInstruction: { parts: [{ text: systemText }] },
        }),
        ...(googleTools && { tools: googleTools }),
        generationConfig: {
          maxOutputTokens: max_tokens,
          temperature: temperature ?? 0.7,
        },
      }

      // 1.5. Debug Log Payload
      const fcPartsWithSig = contents
        .filter((c: any) => c.role === 'model')
        .flatMap((c: any) => c.parts || [])
        .filter((p: any) => p.functionCall)
      const sigCount = fcPartsWithSig.filter((p: any) => p.thoughtSignature).length
      const sigStatus = `thoughtSignature: ${sigCount}/${fcPartsWithSig.length} functionCall parts have sig. Cache size: ${thoughtSignatureCache.size}`
      const debugLog = `\n--- REQUEST TO ${model} (${sigStatus}) ---\n${JSON.stringify(payload, null, 2)}\n`
      try {
        const fs = await import('fs/promises')
        await fs.appendFile('vertex_debug.log', debugLog)
      } catch (e) {
        // Ignore logging errors
      }

      // 2. Get Token
      const authClient = await this.googleAuth.getClient()
      const tokenResponse = await authClient.getAccessToken()
      const token = tokenResponse.token

      // 3. Send Request
      const method = isStream ? 'streamGenerateContent' : 'generateContent'
      const location = this.region === 'global' ? 'global' : this.region
      const url = `https://aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${location}/publishers/google/models/${model}:${method}${isStream ? '?alt=sse' : ''}`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Gemini API Error (${response.status}): ${errText}`)
      }

      if (isStream) {
        const stream = this.handleStream(response, model)
        const loggedStream = async function* () {
          for await (const chunk of stream) {
            try {
              const fs = await import('fs/promises')
              await fs.appendFile(
                'vertex_debug.log',
                `--- RESPONSE CHUNK ---\n${JSON.stringify(chunk, null, 2)}\n`,
              )
            } catch (e) {}
            yield chunk
          }
        }
        return createFakeStream(loggedStream(), abortController)
      } else {
        const data = await response.json()
        try {
          const fs = await import('fs/promises')
          await fs.appendFile(
            'vertex_debug.log',
            `--- RESPONSE ---\n${JSON.stringify(data, null, 2)}\n`,
          )
        } catch (e) {}
        return this.handleResponse(data, model)
      }
    } catch (e) {
      throw e
    }
  }

  messages = {
    create: (params: any, options?: any) => this._create(params, options),
  }

  beta = {
    messages: {
      create: (params: any, options?: any) => this._create(params, options),
    },
  }

  private handleResponse(data: any, model: string): any {
    const candidates = data.candidates || []
    const content: any[] = []

    if (candidates[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.text) content.push({ type: 'text', text: part.text })
        if (part.functionCall) {
          const toolId = `call_${part.functionCall.name}_${Math.random().toString(36).substring(7)}`
          content.push({
            type: 'tool_use',
            id: toolId,
            name: part.functionCall.name,
            input: part.functionCall.args,
          })
          // Cache thoughtSignature for this tool call (non-streaming path)
          const sig = part.thoughtSignature || part.thought_signature
          if (sig) {
            thoughtSignatureCache.set(toolId, sig)
          }
        }
      }
    }

    return {
      id: `msg_${Math.random().toString(36).substring(7)}`,
      type: 'message',
      role: 'assistant',
      model,
      content,
      stop_reason:
        candidates[0]?.finishReason === 'FUNCTION_CALL'
          ? 'tool_use'
          : 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: data.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
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
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let contentIndex = 0
    const partToContentIndex = new Map<number, number>()
    const startedParts = new Set<number>()
    // Accumulate thought_signature across stream chunks
    let accumulatedThoughtSignature: string | undefined
    // Track tool call IDs emitted in this stream, to cache thought_signature
    const emittedToolCallIds: string[] = []

    // Emit initial message_start
    yield {
      type: 'message_start',
      message: {
        id: `msg_stream_${Math.random().toString(36).substring(7)}`,
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

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue

          const dataStr = trimmed.slice(5).trim()
          if (!dataStr) continue

          try {
            const chunk = JSON.parse(dataStr)

            // Log raw Gemini SSE keys for debugging thought_signature
            try {
              const fs = await import('fs/promises')
              const chunkKeys = Object.keys(chunk)
              const candidateKeys = chunk.candidates?.[0] ? Object.keys(chunk.candidates[0]) : []
              const contentKeys = chunk.candidates?.[0]?.content ? Object.keys(chunk.candidates[0].content) : []
              await fs.appendFile(
                'vertex_debug.log',
                `--- RAW SSE KEYS --- chunk: [${chunkKeys}] candidate: [${candidateKeys}] content: [${contentKeys}]\n`,
              )
              // Log full raw chunk if it has thought_signature anywhere
              const rawStr = JSON.stringify(chunk)
              if (rawStr.includes('thought') || rawStr.includes('signature') || rawStr.includes('Signature')) {
                await fs.appendFile('vertex_debug.log', `--- RAW THOUGHT DATA ---\n${JSON.stringify(chunk, null, 2)}\n`)
              }
            } catch (e) {}

            const candidates = chunk.candidates || []
            if (candidates.length === 0) continue

            const candidate = candidates[0]
            const parts = candidate.content?.parts || []

            for (let i = 0; i < parts.length; i++) {
              const part = parts[i]

              // Capture thoughtSignature from the part (per-part, on functionCall parts)
              // Gemini thinking models put thoughtSignature as sibling of functionCall
              const partThoughtSig = part.thoughtSignature || part.thought_signature
              if (partThoughtSig) {
                accumulatedThoughtSignature = partThoughtSig
              }

              if (!partToContentIndex.has(i)) {
                const newIdx = contentIndex++
                partToContentIndex.set(i, newIdx)
                startedParts.add(newIdx)
                const isText = !!part.text || part.text === ''
                const toolCallId = !isText
                  ? `call_${part.functionCall?.name || i}_${Math.random().toString(36).substring(7)}`
                  : undefined
                if (toolCallId) {
                  emittedToolCallIds.push(toolCallId)
                  // Cache the thought signature immediately for this tool call
                  if (partThoughtSig) {
                    thoughtSignatureCache.set(toolCallId, partThoughtSig)
                  }
                }
                yield {
                  type: 'content_block_start',
                  index: newIdx,
                  content_block: isText
                    ? { type: 'text', text: '' }
                    : {
                        type: 'tool_use',
                        id: toolCallId!,
                        name: part.functionCall?.name || 'unknown',
                        input: {},
                      },
                }
              } else if (partThoughtSig) {
                // Part was already started but now we got a thoughtSignature
                // (can happen if signature arrives in a later chunk)
                const existingToolId = emittedToolCallIds.find(id => {
                  const idx = partToContentIndex.get(i)
                  return idx !== undefined
                })
                if (existingToolId) {
                  thoughtSignatureCache.set(existingToolId, partThoughtSig)
                }
              }

              const targetIdx = partToContentIndex.get(i)!
              if (part.text) {
                yield {
                  type: 'content_block_delta',
                  index: targetIdx,
                  delta: { type: 'text_delta', text: part.text },
                }
              } else if (part.functionCall) {
                yield {
                  type: 'content_block_delta',
                  index: targetIdx,
                  delta: {
                    type: 'input_json_delta',
                    partial_json: JSON.stringify(part.functionCall.args),
                  },
                }
              }
            }

            // Also check for thoughtSignature at candidate/content level as fallback
            const candidateSig =
              candidate.thoughtSignature ||
              candidate.thought_signature ||
              candidate.content?.thoughtSignature ||
              candidate.content?.thought_signature
            if (candidateSig) {
              accumulatedThoughtSignature = candidateSig
            }

            if (
              candidate.finishReason &&
              candidate.finishReason !== 'STOP_REASON_UNSPECIFIED'
            ) {
              // If we got a signature at candidate level but didn't assign to specific
              // tool calls yet, assign to all emitted tool call IDs
              if (accumulatedThoughtSignature && emittedToolCallIds.length > 0) {
                for (const id of emittedToolCallIds) {
                  if (!thoughtSignatureCache.has(id)) {
                    thoughtSignatureCache.set(id, accumulatedThoughtSignature)
                  }
                }
              }

              try {
                const fs = await import('fs/promises')
                const cachedCount = emittedToolCallIds.filter(id => thoughtSignatureCache.has(id)).length
                await fs.appendFile(
                  'vertex_debug.log',
                  `--- FINISH: ${emittedToolCallIds.length} tool calls, ${cachedCount} have cached thoughtSignature\n`,
                )
              } catch (e) {}

              for (const idx of startedParts) {
                yield { type: 'content_block_stop', index: idx }
              }
              startedParts.clear()

              yield {
                type: 'message_delta',
                delta: {
                  stop_reason:
                    candidate.finishReason === 'FUNCTION_CALL'
                      ? 'tool_use'
                      : 'end_turn',
                  stop_sequence: null,
                },
                usage: {
                  output_tokens: chunk.usageMetadata?.candidatesTokenCount ?? 0,
                },
              }
            }
          } catch (e) {
            // Ignore parse errors from malformed chunks
          }
        }
      }
    } catch (e) {
      // Stream error
    } finally {
      // Emit content_block_stop for any remaining open blocks
      for (const idx of startedParts) {
        yield { type: 'content_block_stop', index: idx }
      }
      yield { type: 'message_stop' }
      reader.releaseLock()
    }
  }
}

