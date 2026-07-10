// Vercel Serverless Function: /api/scores — žebříček (GET board / POST výsledek).
// Úložiště: Vercel KV / Upstash Redis REST (env KV_REST_API_URL/TOKEN nebo
// UPSTASH_REDIS_REST_*). Bez nich vrací 501.
//
// POST: { name, email?, msPlant, msWater, token }
//  - anti-cheat token váže SOUČET časů (viz _lib.verifyToken)
//  - s ověřeným e-mailem → oficiální výsledek; jinak mimo soutěž
//  - s neověřeným e-mailem se rovnou odešle ověřovací kód (needVerify: true)
// Stejná logika běží lokálně ve vite.config.js middleware.

import {
  kvEnv, kvGet, kvSet, signToken, verifyToken, todayPrague, isoWeekId,
  sanitizeName, sanitizeEmail, boardPayload, issueCode, sendCodeMail,
  MIN_TOTAL_MS, MAX_TOTAL_MS, readBody,
} from './_lib.js'

export default async function handler(req, res) {
  const { url, token } = kvEnv()
  if (!url || !token) {
    res.status(501).json({ error: 'Žebříček není nakonfigurován (chybí Vercel KV / Upstash).' })
    return
  }
  // podpisový klíč: dedikovaný env, jinak KV token (taky server-only)
  const secret = process.env.SIGNING_SECRET || token

  if (req.method === 'GET') {
    if (req.query && req.query.session) {
      res.status(200).json({ token: signToken(secret) })
      return
    }
    const store = await kvGet(url, token)
    res.status(200).json(boardPayload(store))
    return
  }

  if (req.method === 'POST') {
    const { name: rawName, email: rawEmail, msPlant, msWater, token: runToken } = readBody(req)
    const name = sanitizeName(rawName)
    const email = rawEmail ? sanitizeEmail(rawEmail) : null
    if (rawEmail && !email) {
      res.status(400).json({ error: 'Neplatný e-mail.' })
      return
    }
    const p = Number(msPlant), w = Number(msWater)
    const total = p + w
    if (!name || !isFinite(p) || !isFinite(w) || p <= 0 || w <= 0
      || total < MIN_TOTAL_MS || total > MAX_TOTAL_MS) {
      res.status(400).json({ error: 'Neplatné jméno nebo čas.' })
      return
    }
    const v = verifyToken(secret, runToken, total)
    if (v !== 'ok') {
      const msg = v === 'tooFast' ? 'Čas neodpovídá délce hry.'
        : v === 'expired' ? 'Platnost kola vypršela, zahraj znovu.'
        : 'Kolo nelze ověřit, zahraj znovu.'
      res.status(403).json({ error: msg })
      return
    }

    const store = await kvGet(url, token)
    const official = !!(email && store.verified[email])
    const date = todayPrague()
    store.scores.push({
      name, email: email || null,
      msPlant: Math.round(p), msWater: Math.round(w), ms: Math.round(total),
      date, weekId: isoWeekId(date), ts: Date.now(), official,
    })
    if (store.scores.length > 5000) store.scores = store.scores.slice(-5000)

    // neověřený e-mail → poslat kód (pokud to rate-limit dovolí)
    let needVerify = false
    let mailError = null
    if (email && !official) {
      needVerify = true
      const issued = issueCode(store, email)
      if (issued.error) {
        mailError = issued.error
      } else {
        try { await sendCodeMail(email, issued.code) }
        catch (e) { mailError = `Kód se nepodařilo odeslat: ${e.message}` }
      }
    }

    await kvSet(url, token, store)
    res.status(200).json({ board: boardPayload(store), needVerify, mailError })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
