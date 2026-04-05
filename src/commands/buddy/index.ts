import type { Command } from '../../commands.js'
import { isBuddyLive } from '../../buddy/useBuddyNotification.js'

const buddy = {
  type: 'local',
  name: 'buddy',
  description: 'Hatch or visit your companion',
  isEnabled: () => isBuddyLive(),
  isHidden: false,
  supportsNonInteractive: false,
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy
