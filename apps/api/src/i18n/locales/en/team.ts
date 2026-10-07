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
    templateNeedsStage: 'At least one stage is required',
    selfLockout: 'You cannot take settings and permission management away from your own role',
    beyondOwnRole: 'You cannot grant permissions your own role does not have: {permissions}',
    beyondRoleCeiling: 'This role cannot be granted: {permissions}',
    noEmailForType: 'No emails are sent for this type of notification'
  },
  employees: {
    emailTaken: 'A user with the email {email} already exists',
    cannotDeleteSelf: 'You cannot delete your own account',
    ownLoginHere: 'The email and password of your own account are not changed here — change your password in the profile',
    loginOutranked: 'You can change the email and password only of people who do not outrank you'
  },
  departments: {
    hasEmployees: 'The department still has employees: {count}. Move them to another department first.'
  },
  timesheets: {
    noEmployee: 'Your account is not linked to an employee, so hours cannot be logged',
    ownOnly: 'You can only change your own timesheet entries'
  },
  attendance: {
    dayNotYet: 'This day has not come yet',
    futureDayCorrection: 'A day that has not come yet cannot be corrected',
    checkInRequired: 'Give the arrival time — without it the departure time means nothing',
    checkOutAfterCheckIn: 'Departure must be later than arrival',
    notCorrected: 'This day has not been corrected manually',
    correctionReason: 'Describe the reason for the correction',
    staffOnly: 'Marking arrival is only available to studio employees',
    correctedByAdmin: 'An administrator has already corrected this day — no need to mark it',
    checkInFirst: 'Mark your arrival first — press “I’m in”',
    checkOutByAdmin: 'An administrator corrected this day — they will enter the departure time',
    penaltyRateMissing: 'The lateness penalty rate is not set. Set it in Settings → Work schedule.',
    penaltyReason: 'Late by {minutes} min: arrived {arrival}, work starts at {start}',
    penaltyMarked: '(attendance)',
    penaltyUnmarked: '(no “I’m in” mark — by first activity)'
  }
} satisfies Messages<typeof ru>
