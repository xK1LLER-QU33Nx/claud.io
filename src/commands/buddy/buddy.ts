import type { LocalCommandResult } from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { getOrCreateUserID } from '../../utils/config.js'
import {
  roll,
  companionUserId,
  getCompanion,
} from '../../buddy/companion.js'
import { renderSprite } from '../../buddy/sprites.js'
import { RARITY_STARS } from '../../buddy/types.js'

const NAMES = [
  'Pip', 'Fizz', 'Mochi', 'Bean', 'Nyx', 'Boop', 'Twig',
  'Dot', 'Rue', 'Hex', 'Zuzu', 'Arlo', 'Koda', 'Wren',
  'Flick', 'Jinx', 'Luma', 'Puck', 'Sage', 'Orbit',
]

const PERSONALITIES = [
  'cheerful and easily excited',
  'quiet but fiercely loyal',
  'sarcastic with a heart of gold',
  'endlessly curious about everything',
  'sleepy but always watching',
  'dramatic about minor inconveniences',
  'encouraging, always believes in you',
  'mischievous and loves puns',
]

export async function call(): Promise<LocalCommandResult> {
  const existing = getCompanion()

  if (existing) {
    const sprite = renderSprite(existing, 0)
    const stars = RARITY_STARS[existing.rarity]
    const lines = [
      `${existing.name} the ${existing.species} ${stars}`,
      `Personality: ${existing.personality}`,
      existing.shiny ? '(shiny!)' : '',
      '',
      ...sprite,
      '',
      `Stats: ${Object.entries(existing.stats).map(([k, v]) => `${k}:${v}`).join(' ')}`,
    ].filter(Boolean)
    return { type: 'text', value: lines.join('\n') }
  }

  // Hatch a new companion
  const userId = companionUserId()
  const { bones, inspirationSeed } = roll(userId)

  // Pick name and personality deterministically from seed
  const rng = mulberry32(inspirationSeed)
  const name = NAMES[Math.floor(rng() * NAMES.length)]!
  const personality = PERSONALITIES[Math.floor(rng() * PERSONALITIES.length)]!

  saveGlobalConfig(config => ({
    ...config,
    companion: {
      name,
      personality,
      hatchedAt: Date.now(),
    },
  }))

  const sprite = renderSprite(bones, 0)
  const stars = RARITY_STARS[bones.rarity]
  const lines = [
    `An egg cracks open...`,
    '',
    ...sprite,
    '',
    `${name} the ${bones.species} has hatched! ${stars}`,
    `Rarity: ${bones.rarity}${bones.shiny ? ' (SHINY!)' : ''}`,
    `Personality: ${personality}`,
    `Stats: ${Object.entries(bones.stats).map(([k, v]) => `${k}:${v}`).join(' ')}`,
  ]

  return { type: 'text', value: lines.join('\n') }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
