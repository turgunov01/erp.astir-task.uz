import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge conditional class lists without Tailwind specificity collisions. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
