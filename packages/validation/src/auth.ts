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
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false)
})
export type LoginInput = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email')
})

export const resetPasswordSchema = z
  .object({
    token: z.string().min(16, 'Invalid reset token'),
    password: passwordSchema,
    confirmPassword: z.string()
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  })

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    password: passwordSchema,
    confirmPassword: z.string()
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  })

/** Finishing a login that was stopped for email verification. */
export const verifyCodeSchema = loginSchema.extend({
  code: z.string().trim().regex(/^[0-9]{6}$/, 'Код состоит из шести цифр')
})

export const resendCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email()
})
