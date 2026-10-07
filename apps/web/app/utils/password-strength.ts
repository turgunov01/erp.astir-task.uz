export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong'

/** Lower case, upper case, digits, everything else — in any script. */
const CHARACTER_CLASSES = [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}]/u]
const LONG = 12
const VERY_LONG = 16

/**
 * A rough strength hint for the new-password field.
 *
 * Length carries it, matching the policy (length-first, packages/validation):
 * anything under the minimum is weak whatever it contains, and mixing
 * character kinds only adds one step. It guides; the server decides.
 */
export function passwordStrength(password: string, minLength: number): PasswordStrength {
  if (password.length < minLength) return 'weak'
  const kinds = CHARACTER_CLASSES.filter(pattern => pattern.test(password)).length
  const score = 1
    + (password.length >= LONG ? 1 : 0)
    + (password.length >= VERY_LONG ? 1 : 0)
    + (kinds >= 3 ? 1 : 0)
  if (score >= 4) return 'strong'
  if (score === 3) return 'good'
  if (score === 2) return 'fair'
  return 'weak'
}
