// leaderboard.js — klient žebříčku: GET/POST /api/scores.
// Jméno a telefon hráče v localStorage. Server je lokální Vite middleware
// (VPS) nebo Vercel funkce — stejné relativní URL.
const NAME_KEY = 'umis-sazet-name'
const PHONE_KEY = 'umis-sazet-phone'

export function getSavedName() {
  return localStorage.getItem(NAME_KEY) || ''
}
export function saveName(name) {
  localStorage.setItem(NAME_KEY, name)
}
export function getSavedPhone() {
  return localStorage.getItem(PHONE_KEY) || ''
}
export function savePhone(phone) {
  localStorage.setItem(PHONE_KEY, phone)
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
// Telefon je nepovinný — jen kontakt na výherce týdne.
export async function submitScore(name, phone, msPlant, msWater, token) {
  const r = await fetch('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, msPlant, msWater, token }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
  return data
}
