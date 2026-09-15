'use strict'
/**
 * Minimal client for the ERP's own HTTP API: one Session per person, so every
 * record is created by the account that would create it by hand, with the
 * same validation, permissions, activity log and notifications a form gets.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const MIN_GAP_MS = Number(process.env.POPULATE_GAP_MS ?? 230) // the API allows 300 req/min per IP
let lastCall = 0
async function throttle() {
  const wait = lastCall + MIN_GAP_MS - Date.now()
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
  lastCall = Date.now()
}

export class ApiError extends Error {
  constructor(status, method, path, body) {
    super(method + ' ' + path + ' -> ' + status + ' ' + JSON.stringify(body).slice(0, 400))
    this.status = status
    this.body = body
  }
}

export class Session {
  constructor(base, email, password, label = email) {
    this.base = base.replace(/\/$/, '')
    this.email = email
    this.password = password
    this.label = label
    this.cookies = new Map()
    this.user = null
  }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => k + '=' + v).join('; ')
  }

  absorb(res) {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';')
      const index = pair.indexOf('=')
      if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
    }
  }

  async login() {
    const res = await this.raw('POST', '/api/auth/login', { json: { email: this.email, password: this.password } })
    this.user = res.data.user
    return this.user
  }

  async raw(method, path, { json, form, retry = true } = {}) {
    await throttle()
    const headers = { Accept: 'application/json' }
    if (this.cookies.size) headers.Cookie = this.cookieHeader()
    let body
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json) }
    if (form) body = form
    const res = await fetch(this.base + path, { method, headers, body })
    this.absorb(res)
    const text = await res.text()
    let parsed = null
    try { parsed = text ? JSON.parse(text) : null } catch { parsed = { raw: text.slice(0, 200) } }
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 20000
      this.throttled = (this.throttled ?? 0) + 1
      if (this.throttled > 6) throw new ApiError(429, method, path, parsed)
      await new Promise(resolve => setTimeout(resolve, wait))
      return this.raw(method, path, { json, form, retry })
    }
    this.throttled = 0
    if (res.status === 401 && retry && path !== '/api/auth/login') {
      await this.login()
      return this.raw(method, path, { json, form, retry: false })
    }
    if (!res.ok) throw new ApiError(res.status, method, path, parsed)
    return parsed
  }

  get(path) { return this.raw('GET', path) }
  post(path, json) { return this.raw('POST', path, { json }).then(r => r?.data ?? r) }
  patch(path, json) { return this.raw('PATCH', path, { json }).then(r => r?.data ?? r) }

  /** Multipart upload, the way the file inputs in the forms send it. */
  async upload(path, fields, file) {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && value !== '') form.append(key, String(value))
    }
    if (file) {
      const blob = new Blob([readFileSync(file.path)], { type: file.mimeType })
      form.append('file', blob, file.name ?? basename(file.path))
    }
    return this.raw('POST', path, { form }).then(r => r?.data ?? r)
  }
}

export function log(line) {
  console.log('  ' + line)
}
