import type { Messages } from '../../types'
import type ru from '../ru/team'

export default {
  notifications: {
    deadline: 'due {date}',
    taskAssigned: 'You have a new task: {title}',
    projectAssigned: 'You were added to the project: {name}',
    commentMention: 'You were mentioned in a discussion',
    renderFailed: 'Render failed: {code}',
    versionApproved: 'Version approved: {label}',
    changesRequested: 'Changes requested: {label}',
    versionRejected: 'Version rejected: {label}',
    revisionCreated: 'New revision: {title}',
    revisionAssigned: 'A revision was assigned to you: {title}',
    revisionRound: '{code} · round {round}',
    versionSubmitted: 'For review: {label}',
    overdueEdited: 'Overdue task edited: {title}',
    overdueEditedBody: '{days} d late · {change}',
    overdueReason: 'reason: {reason}'
  },
  email: {
    greeting: 'Hello.',
    greetingNamed: 'Hello, {name}.',
    open: 'Open',
    openTask: 'Open the task',
    openProject: 'Open the project',
    unsubscribeText: 'You can turn these emails off in your profile: {link}',
    unsubscribeLink: 'turn these emails off in your profile'
  },
  settings: {
    workDayEndBeforeStart: 'The working day must end after it starts',
    pickWorkday: 'Choose at least one working day',
    noEmail: 'The current account has no email address',
    mailTestSubject: '{studio} — mail test',
    mailTestBody: 'If you are reading this, email from {studio} is set up correctly.',
    mailTestSent: 'Email sent to {email}',
    mailTestLogged: 'SMTP is not configured — the email was written to the server log instead of being sent',
    templateNeedsStage: 'At least one stage is required'
  }
} satisfies Messages<typeof ru>
