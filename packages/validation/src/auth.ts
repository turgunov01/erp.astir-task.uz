import { z } from 'zod'

/**
 * Password policy.
 *
 * Deliberately length-first rather than character-class soup: length is the
 * property that actually resists offline cracking. The seeded admin account
 * is exempt because it is forced to change on first login.
 */
export const passwordSchema = z
  .string()
  .min(8)
  .max(128)

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('i18n:common.validation.invalidEmail'),
  password: z.string().min(1, 'i18n:common.validation.required'),
  rememberMe: z.boolean().optional().default(false)
})
export type LoginInput = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('i18n:common.validation.invalidEmail')
})

export const resetPasswordSchema = z
  .object({
    token: z.string().min(16, 'i18n:common.validation.invalidFormat'),
    password: passwordSchema,
    confirmPassword: z.string()
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'i18n:common.validation.passwordsMismatch',
    path: ['confirmPassword']
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

/** Finishing a login that was stopped for email verification. */
export const verifyCodeSchema = loginSchema.extend({
  code: z.string().trim().regex(/^[0-9]{6}$/, 'i18n:common.validation.codeSixDigits')
})

export const resendCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email()
})
