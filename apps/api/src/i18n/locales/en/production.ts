import type { Messages } from '../../types'
import type ru from '../ru/production'

export default {
  tasks: {
    statusChange: 'status {change}',
    noChanges: 'no changes',
    overdueEditReason: 'This task is overdue. Give a reason for the edit — it will be sent to management.',
    overdueEditReasonField: 'Give a reason for editing an overdue task',
    overdueMoveReason: 'This task is overdue. Give a reason for the move — it will be sent to management.',
    overdueMoveReasonField: 'Give a reason',
    prerequisitesUnfinished: 'Finish the prerequisite tasks first: {tasks}',
    selfDependency: 'A task cannot depend on itself',
    crossProjectDependency: 'Dependencies are only possible within one project',
    reverseDependency: 'That task already depends on this one',
    alreadyArchived: 'The task is already archived',
    notArchived: 'The task is not archived',
    overdueComment: 'Edit of an overdue task ({days} d late): {reason}',
    fields: {
      title: 'title',
      description: 'description',
      status: 'status',
      priority: 'priority',
      assigneeId: 'assignee',
      reviewerId: 'reviewer',
      episodeId: 'episode',
      sceneId: 'scene',
      shotId: 'shot',
      stageId: 'stage',
      estimatedHours: 'estimated hours',
      actualHours: 'actual hours',
      startDate: 'start date',
      deadline: 'deadline'
    }
  },
  comments: {
    editOwnOnly: 'You can only edit your own comment',
    deleteOwnOnly: 'You can only delete your own comment'
  },
  reviews: {
    alreadyClosed: 'This review is already closed',
    revisionTitle: 'Changes to {target}',
    clientReviewByClient: 'A client review is closed by the client',
    internalNotForClient: 'Internal reviews are not available to clients'
  },
  versions: {
    alreadySubmitted: 'This version has already been submitted for review',
    approvedDeleteByProduction: 'Only production can delete an approved version',
    projectIdRequired: 'Specify the project (projectId)',
    fileTypeNotAllowed: 'File type {type} is not allowed'
  },
  episodes: {
    duplicate: 'Episode {number} already exists in this project',
    hasScenes: 'The episode still has scenes: {count}. Delete them first.'
  },
  scenes: {
    otherProjectEpisode: 'This episode belongs to another project',
    duplicate: 'Scene {number} already exists here',
    hasShots: 'The scene still has shots: {count}. Delete them first.'
  },
  shots: {
    duplicate: 'Shot {code} already exists in this project'
  },
  stages: {
    hasTasks: 'Tasks are still linked to this stage: {count}.'
  },
  assets: {
    hasVersions: 'The asset still has versions: {count}. Delete them first.'
  },
  uploads: {
    typeUnsupported: 'File type {type} is not supported',
    tooManyOpen: 'Too many unfinished uploads. Finish or cancel them.',
    chunkOutOfRange: 'Chunk number out of range: {index} of {total}',
    chunkWrongSize: 'Chunk {index} must be {expected} bytes, not {actual}',
    chunksMissing: 'Not all parts of the file have been received',
    chunkTooBig: 'A file chunk is larger than its declared size',
    chunkIncomplete: 'Chunk {index} is incomplete: received {received} of {expected} bytes',
    completing: 'The upload is already being completed'
  }
} satisfies Messages<typeof ru>
