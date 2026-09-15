import { createTransport, type Transporter } from 'nodemailer'
import { logger } from './logger'
import { mailConfig } from './settings'

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
/** The configuration the current transport was built from, to detect a change. */
let builtFrom = ''

/**
 * The transport for the SMTP settings in force right now.
 *
 * Settings are editable at runtime, so this can no longer be decided once at
 * startup: the fingerprint is compared on every send and the transport rebuilt
 * when somebody saves different credentials. Nodemailer pools connections, so
 * keeping one instance per configuration still matters.
 */
async function transport(): Promise<Transporter | null> {
  const config = await mailConfig()

  if (!config) {
    transporter = null
    builtFrom = ''
    return null
  }

  const fingerprint = [config.host, config.port, config.user, config.password].join('|')
  if (transporter && builtFrom === fingerprint) return transporter

  transporter = createTransport({
    host: config.host,
    port: config.port,
    // 465 is implicit TLS; anything else negotiates STARTTLS.
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password }
  })
  builtFrom = fingerprint
  return transporter
}

export async function sendMail(mail: Mail): Promise<{ delivered: boolean }> {
  const config = await mailConfig()
  const sender = await transport()

  if (!sender || !config) {
    logger.warn(
      { to: mail.to, subject: mail.subject, body: mail.text },
      'email not sent (SMTP unconfigured) — contents logged for local use'
    )
    return { delivered: false }
  }

  try {
    await sender.sendMail({
      from: config.from,
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
export async function mailIsConfigured(): Promise<boolean> {
  return Boolean(await mailConfig())
}
