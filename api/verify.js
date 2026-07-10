// Vercel Serverless Function: /api/verify — ověření e-mailu 6místným kódem.
// Úspěch: e-mail je trvale „verified", všechny jeho výsledky (i minulé)
// se povýší na oficiální. Stejná logika běží lokálně ve vite middleware.

import { kvEnv, kvGet, kvSet, sanitizeEmail, consumeCode, boardPayload, readBody } from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { url, token } = kvEnv()
  if (!url || !token) {
    res.status(501).json({ error: 'Žebříček není nakonfigurován.' })
    return
  }
  const { email: rawEmail, code } = readBody(req)
  const email = sanitizeEmail(rawEmail)
  if (!email || !code) {
    res.status(400).json({ error: 'Chybí e-mail nebo kód.' })
    return
  }
  const store = await kvGet(url, token)
  const result = consumeCode(store, email, code)
  if (result !== 'ok') {
    const msg = result === 'wrong' ? 'Nesprávný kód.'
      : result === 'expired' ? 'Kód vypršel — ulož výsledek znovu, pošleme nový.'
      : result === 'tooMany' ? 'Příliš mnoho pokusů — vyžádej si nový kód.'
      : 'Žádný aktivní kód — ulož výsledek s e-mailem, kód dorazí.'
    res.status(400).json({ error: msg })
    return
  }
  await kvSet(url, token, store)
  res.status(200).json({ board: boardPayload(store), verified: true })
}
