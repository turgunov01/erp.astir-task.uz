import type { Messages } from '../../types'
import type ru from '../ru/production'

export default {
  tasks: {
    statusChange: 'status {change}'
  }
} satisfies Messages<typeof ru>
