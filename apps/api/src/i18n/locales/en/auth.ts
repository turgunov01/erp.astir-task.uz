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
  reset: {
    accepted: 'If this address is registered, we have sent it an email with a link to reset the password.',
    linkInvalid: 'This password reset link is invalid or has already been used. Request a new one.',
    linkExpired: 'This link has expired. Request a new one.',
    done: 'Your password has been changed. Sign in with the new password.'
  },
  resetEmail: {
    subject: 'Password reset — {studio}',
    greeting: 'Hello, {name}.',
    title: 'Password reset',
    intro: 'We received a request to reset the password of your {studio} account.',
    action: 'Reset password',
    linkFallback: 'If the button does not open, copy this link into your browser address bar:',
    validity: 'The link is valid for {minutes} minutes and works once.',
    notYou: 'If you did not ask for a password reset, just ignore this email: your password stays the same.'
  },
  passwordChangedEmail: {
    subject: 'Your password has been changed — {studio}',
    title: 'Your password has been changed',
    body: 'The password of your {studio} account was just changed using the link from the email. All open sessions have been signed out.',
    action: 'Sign in',
    notYou: 'If this was not you, reset the password again right away and let the studio administrator know.'
  },
  account: {
    currentPasswordWrong: 'The current password is wrong',
    passwordTooShort: 'The password is shorter than 8 characters',
    cannotChangeOwnRole: 'You cannot change the role of your own account',
    cannotDisableSelf: 'You cannot disable your own account'
  }
} satisfies Messages<typeof ru>
