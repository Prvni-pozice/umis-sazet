import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

// Sdílená logika s Vercel funkcemi — jeden zdroj pravdy pro token, týdny,
// žebříčky i ověřovací kódy. Lokálně se liší jen úložiště (soubor místo KV)
// a doručení kódu (console.log místo SMTP).
import {
  signToken as libSignToken, verifyToken as libVerifyToken, todayPrague,
  isoWeekId, sanitizeName, sanitizeEmail, boardPayload, issueCode,
  consumeCode, MIN_TOTAL_MS, MAX_TOTAL_MS,
} from './api/_lib.js'

// Lokální podpisový klíč platí v rámci běhu serveru (restart = nová sada
// tokenů; pro testovací VPS dostačuje).
const SIGN_SECRET = crypto.randomBytes(32).toString('hex')
const signToken = () => libSignToken(SIGN_SECRET)
const verifyToken = (token, ms) => libVerifyToken(SIGN_SECRET, token, ms)

// ── Lokální store (data/scores.json, gitignored) ─────────────────────
const DATA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'scores.json')

function readStore() {
  const empty = { scores: [], verified: {}, codes: {} }
  try { return { ...empty, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) } } catch { return empty }
}
function writeStore(d) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(d))
}

const rateMap = new Map() // ip → [timestamps]
function rateLimited(ip) {
  const now = Date.now()
  const arr = (rateMap.get(ip) || []).filter(t => now - t < 60_000)
  arr.push(now)
  rateMap.set(ip, arr)
  return arr.length > 12
}

function json(res, code, obj) {
  res.statusCode = code
  res.end(JSON.stringify(obj))
}

function collectBody(req, cb) {
  let body = ''
  req.on('data', c => { body += c; if (body.length > 4096) req.destroy() })
  req.on('end', () => {
    try { cb(JSON.parse(body)) } catch { cb(null) }
  })
}

function apiMiddleware(req, res, next) {
  if (!req.url.startsWith('/api/')) return next()
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  // ── /api/scores ──
  if (req.url.startsWith('/api/scores')) {
    if (req.method === 'GET') {
      if (req.url.includes('session=')) return json(res, 200, { token: signToken() })
      return json(res, 200, boardPayload(readStore()))
    }
    if (req.method === 'POST') {
      if (rateLimited(req.socket.remoteAddress || '?')) {
        return json(res, 429, { error: 'Příliš mnoho pokusů, zkus to za chvíli.' })
      }
      collectBody(req, data => {
        if (!data) return json(res, 400, { error: 'Neplatný požadavek.' })
        const { name: rawName, email: rawEmail, msPlant, msWater, token: runToken } = data
        const name = sanitizeName(rawName)
        const email = rawEmail ? sanitizeEmail(rawEmail) : null
        if (rawEmail && !email) return json(res, 400, { error: 'Neplatný e-mail.' })
        const p = Number(msPlant), w = Number(msWater)
        const total = p + w
        if (!name || !isFinite(p) || !isFinite(w) || p <= 0 || w <= 0
          || total < MIN_TOTAL_MS || total > MAX_TOTAL_MS) {
          return json(res, 400, { error: 'Neplatné jméno nebo čas.' })
        }
        const v = verifyToken(runToken, total)
        if (v !== 'ok') {
          const msg = v === 'tooFast' ? 'Čas neodpovídá délce hry.'
            : v === 'expired' ? 'Platnost kola vypršela, zahraj znovu.'
            : 'Kolo nelze ověřit, zahraj znovu.'
          return json(res, 403, { error: msg })
        }
        const store = readStore()
        const official = !!(email && store.verified[email])
        const date = todayPrague()
        store.scores.push({
          name, email: email || null,
          msPlant: Math.round(p), msWater: Math.round(w), ms: Math.round(total),
          date, weekId: isoWeekId(date), ts: Date.now(), official,
        })
        let needVerify = false
        let mailError = null
        if (email && !official) {
          needVerify = true
          const issued = issueCode(store, email)
          if (issued.error) mailError = issued.error
          // lokální dev: kód se neposílá mailem, jen do konzole serveru
          else console.log(`[umis-sazet] Ověřovací kód pro ${email}: ${issued.code}`)
        }
        writeStore(store)
        json(res, 200, { board: boardPayload(store), needVerify, mailError })
      })
      return
    }
    return json(res, 405, { error: 'Method not allowed' })
  }

  // ── /api/verify ──
  if (req.url.startsWith('/api/verify')) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
    collectBody(req, data => {
      if (!data) return json(res, 400, { error: 'Neplatný požadavek.' })
      const email = sanitizeEmail(data.email)
      if (!email || !data.code) return json(res, 400, { error: 'Chybí e-mail nebo kód.' })
      const store = readStore()
      const result = consumeCode(store, email, data.code)
      if (result !== 'ok') {
        const msg = result === 'wrong' ? 'Nesprávný kód.'
          : result === 'expired' ? 'Kód vypršel — ulož výsledek znovu, pošleme nový.'
          : result === 'tooMany' ? 'Příliš mnoho pokusů — vyžádej si nový kód.'
          : 'Žádný aktivní kód — ulož výsledek s e-mailem, kód dorazí.'
        return json(res, 400, { error: msg })
      }
      writeStore(store)
      json(res, 200, { board: boardPayload(store), verified: true })
    })
    return
  }

  return next()
}

const apiPlugin = {
  name: 'umis-sazet-api-local',
  configureServer(server) { server.middlewares.use(apiMiddleware) },
  configurePreviewServer(server) { server.middlewares.use(apiMiddleware) },
}

export default defineConfig({
  server: { host: true, port: 5181 },
  preview: { host: true, port: 5181 },
  build: { target: 'es2019' },
  plugins: [apiPlugin],
})
