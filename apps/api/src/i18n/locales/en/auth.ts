import type { Messages } from '../../types'
import type ru from '../ru/auth'

export default {
  verifyEmailSent: 'Confirm your email: a code was sent to {email}',
  code: {
    notRequested: 'No code was requested, or it has already been used',
    expired: 'The code has expired, request a new one',
    tooManyAttempts: 'Too many attempts, request a new code',
    wrong: 'Wrong code'
  },
  codeEmail: {
    subject: 'Email confirmation — {studio}',
    greeting: 'Hello, {name}.',
    yourCode: 'Your email confirmation code: {code}',
    whereToEnter: 'Enter it on the {studio} sign-in page right after your password:',
    validity: 'The code is needed only on your first sign-in, is valid for {minutes} minutes and can be used once.',
    notYou: 'If this was not you, let the studio administrator know.'
  },
  account: {
    currentPasswordWrong: 'The current password is wrong',
    passwordTooShort: 'The password is shorter than 8 characters',
    cannotChangeOwnRole: 'You cannot change the role of your own account',
    cannotDisableSelf: 'You cannot disable your own account'
  }
} satisfies Messages<typeof ru>
