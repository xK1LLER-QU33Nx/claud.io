import * as fs from 'node:fs'
import * as path from 'node:path'
import { feature } from 'bun:bundle'
import { getAnthropicClient } from '../services/api/client.js'
import { getGlobalConfig } from '../utils/config.js'
import { getSmallFastModel } from '../utils/model/model.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { getCompanion } from './companion.js'
import type { Message } from '../types/message.js'

function buddyLog(data: any, label: string) {
  const timestamp = new Date().toISOString()
  const msg = ` [${timestamp}] ${label}: ${JSON.stringify(data, null, 2)}\n`
  try {
    fs.appendFileSync(path.join(process.cwd(), 'buddy_debug.log'), msg)
  } catch (_) {}
}

/**
 * fireCompanionObserver is called at the end of every turn.
 * It periodically triggers Buddy reactions based on the conversation history.
 * Works with any provider (Anthropic, Ollama, OpenRouter, etc.)
 */
export async function fireCompanionObserver(
  messages: Message[],
  onReaction: (reaction: string) => void,
): Promise<void> {
  buddyLog({ messageCount: messages.length }, 'OBSERVER_CALLED')

  if (!feature('BUDDY')) {
    buddyLog('feature BUDDY is false', 'EARLY_EXIT')
    return
  }
  buddyLog('feature BUDDY is true', 'FEATURE_CHECK')

  const config = getGlobalConfig()
  const companion = getCompanion()

  buddyLog({
    hasCompanion: !!companion,
    companionName: companion?.name,
    companionSpecies: companion?.species,
    companionMuted: config.companionMuted,
    hasStoredCompanion: !!config.companion,
  }, 'COMPANION_CHECK')

  if (!companion || config.companionMuted) {
    buddyLog('no companion or muted', 'EARLY_EXIT')
    return
  }

  // Only react if the last message is from the assistant (turn complete)
  const lastMessage = messages[messages.length - 1]
  buddyLog({
    lastMessageRole: lastMessage?.role,
    lastMessageType: lastMessage?.type,
    lastMessageKeys: lastMessage ? Object.keys(lastMessage) : [],
    lastMessageMessageKeys: lastMessage?.message ? Object.keys(lastMessage.message) : [],
    lastMessageMessageRole: lastMessage?.message?.role,
  }, 'LAST_MESSAGE')
  // Message shape: { type: 'assistant', message: { role: 'assistant', content, ... } }
  const lastMsgRole = lastMessage?.type ?? lastMessage?.role ?? lastMessage?.message?.role
  if (!lastMessage || lastMsgRole !== 'assistant') {
    buddyLog({ lastMsgRole }, 'EARLY_EXIT_NOT_ASSISTANT')
    return
  }

  // Occasional reactions: 25% chance normally.
  // Exception: if the user addressed the companion by name in their last message.
  const userMsg = messages.findLast(m => (m.type ?? m.role) === 'user')
  const rawContent = userMsg?.message?.content ?? userMsg?.content
  const content = typeof rawContent === 'string' ? rawContent : ''
  const addressed = content.toLowerCase().includes(companion.name.toLowerCase())

  const reactionChance = 0.35
  const roll = Math.random()
  buddyLog({ addressed, roll, threshold: reactionChance, willReact: addressed || roll <= reactionChance }, 'REACTION_ROLL')

  if (!addressed && roll > reactionChance) {
    buddyLog('skipped by random chance', 'EARLY_EXIT')
    return
  }

  const provider = getAPIProvider()
  buddyLog({ provider }, 'PROVIDER')

  // Build a short summary of what just happened so the companion can react
  const lastAssistantRawContent = lastMessage?.message?.content ?? lastMessage?.content
  const lastAssistantText = typeof lastAssistantRawContent === 'string'
    ? lastAssistantRawContent.substring(0, 200)
    : '[code changes]'
  const lastUserText = content.substring(0, 100)

  const systemPrompt = `You are ${companion.name}, a small ${companion.species} who watches a coder work.
Personality: ${companion.personality ?? companion.rarity}.
Give a BRIEF ONE-LINE comment (max 12 words). Be in character.
If nothing interesting, return empty string.
NO quotes. NO narration. Just speak.`

  // Compact messages — only the last user+assistant pair, truncated
  const compactMessages = [
    { role: 'user' as const, content: lastUserText || 'working on code' },
    { role: 'assistant' as const, content: lastAssistantText || 'done' },
    { role: 'user' as const, content: 'React to what just happened in one short line.' },
  ]

  try {
    buddyLog('getting client...', 'API_CALL')
    const client = await getAnthropicClient({
      maxRetries: 1,
      model: getSmallFastModel(),
    })
    buddyLog('client obtained', 'API_CALL')

    // Use the current provider's model — getAnthropicClient already routes
    // to OllamaClient/OpenRouterClient/etc. based on env vars.
    // For local models we use small max_tokens to keep it fast.
    const model = provider === 'ollama'
      ? (process.env.OLLAMA_MODEL ?? 'llama3.2')
      : provider === 'openrouter'
        ? (process.env.OPENROUTER_MODEL ?? getSmallFastModel())
        : getSmallFastModel()

    buddyLog({ model, maxTokens: provider === 'ollama' ? 30 : 60, systemPrompt, compactMessages }, 'API_REQUEST')

    const response = await client.messages.create({
      model,
      max_tokens: provider === 'ollama' ? 30 : 60,
      system: systemPrompt,
      messages: compactMessages,
      stream: false,
    })

    buddyLog({ responseContent: response.content }, 'API_RESPONSE')

    const text = response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('')
      .trim()

    // Clean up quotes and truncate if model was too verbose
    let cleanedText = text.replace(/^["']|["']$/g, '').trim()
    // Enforce 12-word limit
    const words = cleanedText.split(/\s+/)
    if (words.length > 12) {
      cleanedText = words.slice(0, 12).join(' ')
    }

    buddyLog({ rawText: text, cleanedText, willEmit: cleanedText.length > 0 }, 'REACTION_TEXT')

    if (cleanedText && cleanedText.length > 0) {
      buddyLog({ reaction: cleanedText }, 'EMITTING_REACTION')
      onReaction(cleanedText)
    }
  } catch (error: any) {
    buddyLog({ error: error?.message, stack: error?.stack }, 'API_ERROR')
  }
}
