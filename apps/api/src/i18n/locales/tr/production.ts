import type { Messages } from '../../types'
import type ru from '../ru/production'

export default {
  tasks: {
    statusChange: 'durum {change}'
  }
} satisfies Messages<typeof ru>
