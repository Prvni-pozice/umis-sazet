// Výpis výsledků ze žebříčku včetně telefonů — pro kontaktování výherců týdne.
// Telefon API nikdy nevrací, takže tudy vede jediná cesta k němu.
// Creds: .env.local v kořeni projektu (gitignored), nebo rovnou v env.
//
//   node scripts/export-scores.mjs            # všechno, nejrychlejší první
//   node scripts/export-scores.mjs --week     # jen probíhající ISO týden
//   node scripts/export-scores.mjs --best     # jen nejlepší čas na hráče
//   node scripts/export-scores.mjs --csv      # CSV na stdout
import fs from 'node:fs'
import { KEY, byTime, todayPrague, isoWeekId } from '../api/_lib.js'

try {
  for (const line of fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
    if (m) process.env[m[1]] ||= m[2]
  }
} catch { /* creds můžou být rovnou v env */ }

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
if (!url || !token) {
  console.error('Chybí KV_REST_API_URL / KV_REST_API_TOKEN (.env.local nebo env).')
  process.exit(1)
}

const fmt = ms => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(2).padStart(5, '0')}`

const r = await fetch(`${url}/get/${KEY}`, { headers: { Authorization: `Bearer ${token}` } })
const store = JSON.parse((await r.json()).result || '{"scores":[]}')

let scores = [...store.scores].sort(byTime)
if (process.argv.includes('--week')) {
  const weekId = isoWeekId(todayPrague())
  scores = scores.filter(s => s.weekId === weekId)
  console.error(`— jen týden ${weekId} —`)
}
if (process.argv.includes('--best')) {
  const seen = new Set()
  scores = scores.filter(s => !seen.has(s.name) && seen.add(s.name))
}

if (process.argv.includes('--csv')) {
  console.log('jmeno,telefon,celkem_ms,sazeni_ms,zalevani_ms,datum,tyden')
  for (const s of scores) {
    console.log([JSON.stringify(s.name), s.phone || '', s.ms, s.msPlant, s.msWater, s.date, s.weekId].join(','))
  }
} else {
  console.log(`${'#'.padStart(3)}  ${'JMÉNO'.padEnd(18)} ${'TELEFON'.padEnd(16)} ${'CELKEM'.padStart(9)}  ${'SÁZENÍ'.padStart(8)}  ${'ZALÉVÁNÍ'.padStart(8)}  DATUM`)
  scores.forEach((s, i) => {
    console.log(`${String(i + 1).padStart(3)}. ${s.name.padEnd(18)} ${(s.phone || '—').padEnd(16)} `
      + `${fmt(s.ms).padStart(9)}  ${fmt(s.msPlant).padStart(8)}  ${fmt(s.msWater).padStart(8)}  ${s.date}`)
  })
  const withPhone = scores.filter(s => s.phone).length
  console.log(`\n${scores.length} výsledků, z toho ${withPhone} s telefonem.`)
}
