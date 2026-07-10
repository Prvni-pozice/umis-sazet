// api/_lib.js — sdílená logika Vercel funkcí (soubory s _ nejsou routy).
// Úložiště: jeden JSON klíč ve Vercel KV / Upstash Redis REST.
// Store: { scores: [...], verified: {email: ts}, codes: {email: {code, exp, tries, sent: [ts]}} }

import crypto from 'node:crypto'

export const KEY = 'umis-sazet-store'
export const TOKEN_MAX_AGE_MS = 2 * 3600 * 1000 // token platí 2 h
export const TIME_TOLERANCE_MS = 2500           // sklouz hodin / latence
export const MIN_TOTAL_MS = 30_000              // rychleji než 30 s celé kolo nedáš
export const MAX_TOTAL_MS = 3_600_000
export const CODE_TTL_MS = 15 * 60 * 1000       // kód platí 15 min
export const CODE_MAX_TRIES = 6
export const CODE_RESENDS_PER_HOUR = 3

// ── KV ────────────────────────────────────────────────────────────
export function kvEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  return { url, token }
}

export async function kvGet(url, token) {
  const r = await fetch(`${url}/get/${KEY}`, { headers: { Authorization: `Bearer ${token}` } })
  const data = await r.json()
  const empty = { scores: [], verified: {}, codes: {} }
  if (!data.result) return empty
  try { return { ...empty, ...JSON.parse(data.result) } } catch { return empty }
}

export async function kvSet(url, token, store) {
  await fetch(`${url}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(store),
  })
}

// ── podepsaný session token (anti-cheat) ──────────────────────────
// Klíč je server-only env. Token nese čas vydání; při ukládání ověříme,
// že od vydání uplynul aspoň naměřený čas → nelze poslat falešný
// „instantní" rekord přes curl.
export function signToken(secret) {
  const issued = Date.now()
  const nonce = crypto.randomBytes(8).toString('hex')
  const sig = crypto.createHmac('sha256', secret).update(`${issued}.${nonce}`).digest('hex')
  return `${issued}.${nonce}.${sig}`
}

export function verifyToken(secret, token, ms) {
  if (typeof token !== 'string') return 'missing'
  const parts = token.split('.')
  if (parts.length !== 3) return 'bad'
  const [issuedStr, nonce, sig] = parts
  const issued = parseInt(issuedStr, 10)
  if (!isFinite(issued)) return 'bad'
  const expected = crypto.createHmac('sha256', secret).update(`${issued}.${nonce}`).digest('hex')
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 'bad'
  const age = Date.now() - issued
  if (age < 0 || age > TOKEN_MAX_AGE_MS) return 'expired'
  if (age < ms - TIME_TOLERANCE_MS) return 'tooFast' // doběhl rychleji než token žije
  return 'ok'
}

// ── čas / týden (Europe/Prague, ISO týden Po–Ne) ──────────────────
export function todayPrague() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date())
}

export function isoWeekId(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dayNum = (date.getUTCDay() + 6) % 7          // Po=0
  date.setUTCDate(date.getUTCDate() - dayNum + 3)    // čtvrtek tohoto týdne
  const jan4 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const jan4Day = (jan4.getUTCDay() + 6) % 7
  jan4.setUTCDate(jan4.getUTCDate() - jan4Day + 3)   // první čtvrtek roku
  const week = 1 + Math.round((date - jan4) / (7 * 86400000))
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function prevWeekId(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() - 7)
  return isoWeekId(date.toISOString().slice(0, 10))
}

// ── validace vstupů ────────────────────────────────────────────────
export function sanitizeName(raw) {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/[<>&"']/g, '').trim().slice(0, 24)
  return name.length >= 1 ? name : null
}

export function sanitizeEmail(raw) {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase().slice(0, 80)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null
  return email
}

// ── žebříčky ──────────────────────────────────────────────────────
// Řazení: čas vzestupně; při shodě je výš STARŠÍ výsledek (menší ts).
export const byTime = (a, b) => (a.ms - b.ms) || (a.ts - b.ts)

// Nejlepší výsledek na hráče (klíč: e-mail, bez něj jméno), seřazeno.
export function bestPerPlayer(list, limit = 10) {
  const m = new Map()
  for (const s of list) {
    const key = s.email || `name:${s.name}`
    const b = m.get(key)
    if (!b || byTime(s, b) < 0) m.set(key, s)
  }
  return [...m.values()].sort(byTime).slice(0, limit)
    .map(({ name, ms, msPlant, msWater, date }) => ({ name, ms, msPlant, msWater, date }))
}

export function boardPayload(store) {
  const today = todayPrague()
  const weekId = isoWeekId(today)
  const lastWeekId = prevWeekId(today)
  const official = store.scores.filter(s => s.official)
  const unofficial = store.scores.filter(s => !s.official)
  const athRec = official.length ? [...official].sort(byTime)[0] : null
  return {
    date: today,
    weekId,
    week: bestPerPlayer(official.filter(s => s.weekId === weekId)),
    weekUnofficial: bestPerPlayer(unofficial.filter(s => s.weekId === weekId)),
    allTime: bestPerPlayer(official),
    ath: athRec ? { name: athRec.name, ms: athRec.ms, date: athRec.date } : null,
    lastWeek: {
      weekId: lastWeekId,
      winners: bestPerPlayer(official.filter(s => s.weekId === lastWeekId), 3),
    },
  }
}

// ── ověřovací kód e-mailem (SMTP 1pmail.cz, port 587 STARTTLS) ────
export function generateCode() {
  return String(crypto.randomInt(100000, 1000000))
}

/** Zapíše/obnoví kód ve store (mutuje). Vrací {code} nebo {error} při rate-limitu. */
export function issueCode(store, email) {
  const now = Date.now()
  const rec = store.codes[email] || { sent: [] }
  rec.sent = (rec.sent || []).filter(t => now - t < 3600_000)
  if (rec.sent.length >= CODE_RESENDS_PER_HOUR) {
    return { error: 'Příliš mnoho pokusů — zkus to za hodinu.' }
  }
  rec.code = generateCode()
  rec.exp = now + CODE_TTL_MS
  rec.tries = 0
  rec.sent.push(now)
  store.codes[email] = rec
  return { code: rec.code }
}

/** Ověří kód (mutuje store: smaže kód, zapíše verified, povýší skóre). */
export function consumeCode(store, email, code) {
  const rec = store.codes[email]
  if (!rec || !rec.code) return 'missing'
  if (Date.now() > rec.exp) { delete store.codes[email]; return 'expired' }
  rec.tries = (rec.tries || 0) + 1
  if (rec.tries > CODE_MAX_TRIES) { delete store.codes[email]; return 'tooMany' }
  if (String(code).trim() !== rec.code) return 'wrong'
  delete store.codes[email]
  store.verified[email] = Date.now()
  for (const s of store.scores) if (s.email === email) s.official = true
  return 'ok'
}

export async function sendCodeMail(email, code) {
  const { default: nodemailer } = await import('nodemailer')
  const host = process.env.SMTP_HOST || '1pmail.cz'
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) throw new Error('SMTP není nakonfigurováno (SMTP_USER/SMTP_PASS).')
  const transporter = nodemailer.createTransport({
    host, port,
    secure: false,        // 587 = STARTTLS (465/SSL z serveru timeoutuje)
    requireTLS: true,
    auth: { user, pass },
  })
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Umíš sázet?" <${user}>`,
    to: email,
    subject: `Ověřovací kód: ${code} — Umíš sázet?`,
    text: [
      `Tvůj ověřovací kód do hry Umíš sázet?: ${code}`,
      '',
      'Zadej ho ve hře — tvé výsledky se zařadí do oficiálního týdenního žebříčku.',
      'Kód platí 15 minut. Pokud jsi o něj nežádal/a, e-mail ignoruj.',
      '',
      'E-mail slouží jen k ověření a kontaktování výherců týdne.',
    ].join('\n'),
  })
}

/** Načte JSON body (Vercel req.body bývá už objekt, ale pojistíme se). */
export function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  try { return JSON.parse(req.body || '{}') } catch { return {} }
}
