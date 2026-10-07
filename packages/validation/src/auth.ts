import { z } from 'zod'

/**
 * Password policy.
 *
 * Deliberately length-first rather than character-class soup: length is the
 * property that actually resists offline cracking. The seeded admin account
 * is exempt because it is forced to change on first login.
 */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 200

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'i18n:auth.account.passwordTooShort')
  .max(PASSWORD_MAX_LENGTH)

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('i18n:common.validation.invalidEmail'),
  password: z.string().min(1, 'i18n:common.validation.required'),
  rememberMe: z.boolean().optional().default(false)
})
export type LoginInput = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('i18n:common.validation.invalidEmail')
})

/**
 * A reset link carries 32 random bytes as base64url (43 characters). The bounds
 * only keep junk out; whether a token is real is decided by its hash.
 */
const resetTokenSchema = z
  .string()
  .trim()
  .min(32, 'i18n:common.validation.invalidFormat')
  .max(128, 'i18n:common.validation.invalidFormat')

/** Setting a new password from an emailed link. Repeating it is the form's job. */
export const resetPasswordSchema = z.object({
  token: resetTokenSchema,
  password: passwordSchema
})
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

/** Asking whether a link still works, before the new password is typed. */
export const resetTokenCheckSchema = z.object({
  token: resetTokenSchema
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'i18n:common.validation.required'),
    password: passwordSchema,
    confirmPassword: z.string()
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'i18n:common.validation.passwordsMismatch',
    path: ['confirmPassword']
  })

/**
 * Replacing a password an administrator set. The current one is not asked
 * for: it was typed seconds ago to open this very session, and only a
 * session in that state may use this.
 */
export const setOwnPasswordSchema = z.object({
  password: passwordSchema
})

/** Finishing a login that was stopped for email verification. */
export const verifyCodeSchema = loginSchema.extend({
  code: z.string().trim().regex(/^[0-9]{6}$/, 'i18n:common.validation.codeSixDigits')
})

export const resendCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email()
})
