import { createTransport, type Transporter } from 'nodemailer'
import { env } from '../config/env'
import { logger } from './logger'

/**
 * Outgoing email.
 *
 * SMTP is optional on purpose: no credentials have been supplied yet, and a
 * half-configured mail server must not stop an account from being created.
 * Without SMTP the message goes to the server log instead, so the flow is
 * complete and testable and becomes real delivery the moment the variables are
 * filled in. The code never travels back in an HTTP response — that would
 * defeat the point of mailing it.
 */

export interface Mail {
  to: string
  subject: string
  text: string
}

let transporter: Transporter | null = null
let checked = false

function transport(): Transporter | null {
  if (checked) return transporter
  checked = true

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    logger.warn(
      'SMTP is not configured; verification emails will be written to the log only'
    )
    return null
  }

  transporter = createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 is implicit TLS; anything else negotiates STARTTLS.
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
  })
  return transporter
}

export async function sendMail(mail: Mail): Promise<{ delivered: boolean }> {
  const sender = transport()

  if (!sender) {
    logger.warn(
      { to: mail.to, subject: mail.subject, body: mail.text },
      'email not sent (SMTP unconfigured) — contents logged for local use'
    )
    return { delivered: false }
  }

  try {
    await sender.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: mail.to,
      subject: mail.subject,
      text: mail.text
    })
    return { delivered: true }
  } catch (err) {
    // A mail failure must not take down the request that triggered it: the
    // account still exists and the code can be resent.
    logger.error({ err, to: mail.to }, 'failed to send email')
    return { delivered: false }
  }
}

/** Whether real delivery is possible, so callers can say what to expect. */
export function mailIsConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD)
}
