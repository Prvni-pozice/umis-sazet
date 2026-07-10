// leaderboard.js — klient žebříčku: GET/POST /api/scores, POST /api/verify.
// Jméno a e-mail hráče v localStorage. Server je lokální Vite middleware
// (VPS) nebo Vercel funkce — stejné relativní URL.
const NAME_KEY = 'umis-sazet-name'
const EMAIL_KEY = 'umis-sazet-email'

export function getSavedName() {
  return localStorage.getItem(NAME_KEY) || ''
}
export function saveName(name) {
  localStorage.setItem(NAME_KEY, name)
}
export function getSavedEmail() {
  return localStorage.getItem(EMAIL_KEY) || ''
}
export function saveEmail(email) {
  localStorage.setItem(EMAIL_KEY, email)
}

export async function fetchBoard() {
  const r = await fetch('/api/scores')
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// Podepsaný token na začátku kola — server jím ověří platnost času.
export async function requestSession() {
  const r = await fetch('/api/scores?session=1')
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const d = await r.json()
  return d.token || null
}

// msPlant/msWater = časy obou fází; server ověří token proti součtu.
// Bez e-mailu (nebo před ověřením) jde výsledek mimo soutěž.
export async function submitScore(name, email, msPlant, msWater, token) {
  const r = await fetch('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, msPlant, msWater, token }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
  return data
}

// Ověření e-mailu 6místným kódem — přesune výsledky do oficiálního žebříčku.
export async function verifyEmail(email, code) {
  const r = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
  return data
}
