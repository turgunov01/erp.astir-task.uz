import type { Messages } from '../../types'
import type ru from '../ru/auth'

export default {
  verifyEmailSent: 'Confirm your email: a code was sent to {email}',
  verifyChangedEmailSent: 'Your sign-in address was changed. Confirm the new email: a code was sent to {email}',
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
    validityOnce: 'The code is valid for {minutes} minutes and can be used once.',
    emailChanged: 'The {studio} administrator changed your sign-in address to this email. Confirm it with the code — from now on you sign in with this address.',
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
  /** A manager moved the login to another address. */
  loginEmailChangedEmail: {
    subject: 'Your sign-in address was changed — {studio}',
    title: 'Your sign-in address was changed',
    body: 'The {studio} administrator changed the sign-in address of your account to {email}. Sign in with the new address from now on: at the first sign-in we will ask you to confirm it with an emailed code. All open sessions have been ended.',
    action: 'Sign in',
    notYou: 'If you did not expect this change, contact the studio administrator right away.'
  },
  /** A manager set a password the person must replace. */
  passwordSetEmail: {
    subject: 'The administrator set a new password for you — {studio}',
    title: 'A new password from the administrator',
    body: 'The {studio} administrator set a new password for your account. Ask the administrator for it: right after you sign in, you will be asked to replace it with your own. All open sessions have been ended.',
    action: 'Sign in',
    notYou: 'If you did not expect this change, contact the studio administrator right away.'
  },
  account: {
    currentPasswordWrong: 'The current password is wrong',
    passwordTooShort: 'The password is shorter than 8 characters',
    cannotChangeOwnRole: 'You cannot change the role of your own account',
    cannotDisableSelf: 'You cannot disable your own account',
    passwordChangeRequired: 'First set your own password in place of the one the administrator issued',
    passwordChangeNotRequired: 'No password change is required right now — change your password in the profile',
    sameAsIssued: 'The new password must differ from the one the administrator issued'
  }
} satisfies Messages<typeof ru>
