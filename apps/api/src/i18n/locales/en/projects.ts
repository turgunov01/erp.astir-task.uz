import type { Messages } from '../../types'
import type ru from '../ru/projects'

export default {
  leadRole: {
    projectManager: 'Project manager',
    producer: 'Producer'
  },
  codeTaken: 'Project code {code} is already taken',
  confirmDeleteCode: 'Type the project code to confirm permanent deletion',
  members: {
    accountDisabled: 'This account is disabled',
    alreadyMember: 'This person is already on the project team',
    hasOpenTasks: 'This person still has open tasks: {count}. Reassign them first.'
  },
  clients: {
    hasActiveProjects: 'The client has active projects: {count}. Complete or reassign them first.'
  },
  files: {
    notReceived: 'No file was received',
    typeNotAllowed: 'This file type cannot be uploaded: {type}',
    unknownTarget: 'Unknown attachment target: {target}',
    targetRequired: 'Attach the file to a record, a project or a client'
  },
  dashboard: {
    phase: {
      preProduction: 'Pre-production',
      production: 'Production',
      postProduction: 'Post-production',
      review: 'Review',
      delivery: 'Delivery'
    }
  }
} satisfies Messages<typeof ru>
