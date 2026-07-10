// ui.js — start screen, kvíz, HUD (čas + počítadla + voda), win overlay se
// dvěma časy, žebříček (týdenní oficiální/mimo soutěž + all-time), uložení
// výsledku s e-mail ověřením. Jména se vykreslují výhradně přes textContent.
import { fetchBoard, submitScore, verifyEmail, requestSession, getSavedName, saveName, getSavedEmail, saveEmail } from './leaderboard.js'
import { randomQuestion } from './quiz.js'

const BEST_KEY = 'umis-sazet-best-ms'

export function formatTime(ms) {
  const totalS = ms / 1000
  const m = Math.floor(totalS / 60)
  const s = totalS - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

export class UI {
  constructor({ isTouch, onStart, onReplay, onResume }) {
    this.onStart = onStart
    this.startScreen = document.getElementById('start-screen')
    this.quizOverlay = document.getElementById('quiz-overlay')
    this.winOverlay = document.getElementById('win-overlay')
    this.resumeOverlay = document.getElementById('resume-overlay')
    this.boardOverlay = document.getElementById('board-overlay')
    this.hud = document.getElementById('hud')
    this.hudTime = document.getElementById('hud-time')
    this.hudBest = document.getElementById('hud-best')
    this.hudPhase = document.getElementById('hud-phase')
    this.hudCount = document.getElementById('hud-count')
    this.waterGauge = document.getElementById('water-gauge')
    this.phaseFlash = document.getElementById('phase-flash')
    this.needWater = document.getElementById('need-water')
    this.recordBadge = document.getElementById('record-badge')
    this.winBest = document.getElementById('win-best')
    this.startBest = document.getElementById('start-best')
    this.startTop3 = document.getElementById('start-top3')
    this.winBoard = document.getElementById('win-board')
    this.saveScoreBox = document.getElementById('save-score')
    this.nameInput = document.getElementById('player-name')
    this.emailInput = document.getElementById('player-email')
    this.verifyBox = document.getElementById('verify-box')
    this.verifyCode = document.getElementById('verify-code')
    this.saveStatus = document.getElementById('save-status')
    this.lastBoard = null
    this.lastPlantMs = null
    this.lastWaterMs = null
    this.runToken = null

    if (isTouch) {
      document.getElementById('instructions-desktop').style.display = 'none'
      document.getElementById('instructions-mobile').style.display = 'block'
    }

    document.getElementById('start-btn').addEventListener('click', () => this.showQuiz())
    document.getElementById('quiz-continue').addEventListener('click', () => {
      this.quizOverlay.classList.add('hidden')
      this.onStart()
    })
    document.getElementById('replay-btn').addEventListener('click', onReplay)
    document.getElementById('resume-btn').addEventListener('click', onResume)
    document.getElementById('board-link').addEventListener('click', () => this.showBoard())
    document.getElementById('board-close').addEventListener('click', () => {
      this.boardOverlay.classList.add('hidden')
    })
    document.getElementById('save-score-btn').addEventListener('click', () => this._submit())
    document.getElementById('verify-btn').addEventListener('click', () => this._verify())
    for (const input of [this.nameInput, this.emailInput, this.verifyCode]) {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') (input === this.verifyCode ? this._verify() : this._submit())
        e.stopPropagation() // ať psaní neovládá hru
      })
    }
    this.nameInput.value = getSavedName()
    this.emailInput.value = getSavedEmail()
    this.totalPlots = 0

    this._refreshBestLabels()
    this.refreshBoards()
  }

  /** Propíše počet záhonů do textů na start screenu (.plot-n) */
  setPlotCount(n) {
    this.totalPlots = n
    for (const el of document.querySelectorAll('.plot-n')) el.textContent = n
  }

  // ── kvíz před startem kola (jen edukativní) ──
  showQuiz() {
    const q = randomQuestion()
    document.getElementById('quiz-q').textContent = q.q
    const optsEl = document.getElementById('quiz-options')
    const whyEl = document.getElementById('quiz-why')
    const contBtn = document.getElementById('quiz-continue')
    optsEl.replaceChildren()
    whyEl.classList.remove('show')
    whyEl.textContent = ''
    contBtn.classList.remove('show')

    q.options.forEach((text, i) => {
      const btn = document.createElement('button')
      btn.textContent = text
      btn.addEventListener('click', () => {
        for (const b of optsEl.children) b.disabled = true
        optsEl.children[q.correct].classList.add('correct')
        if (i !== q.correct) btn.classList.add('wrong')
        whyEl.textContent = (i === q.correct ? '✅ Správně! ' : '💡 ') + q.why
        whyEl.classList.add('show')
        contBtn.classList.add('show')
      })
      optsEl.appendChild(btn)
    })

    this.startScreen.classList.add('hidden')
    this.winOverlay.classList.add('hidden')
    this.quizOverlay.classList.remove('hidden')
  }

  // ── lokální rekord (součet obou časů) ──
  get best() {
    const v = localStorage.getItem(BEST_KEY)
    return v ? parseInt(v, 10) : null
  }

  _refreshBestLabels() {
    const b = this.best
    this.hudBest.textContent = b ? formatTime(b) : '—'
    this.startBest.textContent = b ? `Tvůj rekord (součet): ${formatTime(b)}` : ''
  }

  // ── žebříček ──
  async refreshBoards() {
    try {
      this.lastBoard = await fetchBoard()
      this._renderAll()
    } catch {
      this.startTop3.replaceChildren(this._muted('Žebříček není dostupný'))
    }
  }

  _muted(text) {
    const el = document.createElement('div')
    el.className = 'muted'
    el.textContent = text
    return el
  }

  _row(medal, name, ms) {
    const row = document.createElement('div')
    row.className = 'row'
    const m = document.createElement('span'); m.className = 'medal'; m.textContent = medal
    const n = document.createElement('span'); n.className = 'name'; n.textContent = name
    const t = document.createElement('span'); t.className = 'time'; t.textContent = formatTime(ms)
    row.append(m, n, t)
    return row
  }

  _fillList(ol, entries) {
    ol.replaceChildren()
    if (!entries || !entries.length) {
      const li = document.createElement('li')
      li.className = 'empty'
      li.textContent = 'Zatím žádný čas'
      ol.appendChild(li)
      return
    }
    for (const e of entries) {
      const li = document.createElement('li')
      const n = document.createElement('span'); n.className = 'name'; n.textContent = e.name
      const t = document.createElement('span'); t.className = 'time'; t.textContent = formatTime(e.ms)
      li.append(n, t)
      ol.appendChild(li)
    }
  }

  _renderAll() {
    const b = this.lastBoard
    if (!b) return

    // start screen: TOP 3 tento týden (oficiální; fallback all-time)
    const medals = ['🥇', '🥈', '🥉']
    const top3src = (b.week && b.week.length) ? b.week : (b.allTime || [])
    const top3label = (b.week && b.week.length) ? `Tento týden nejrychlejší (${b.weekId}):` : 'Nejrychlejší všech dob:'
    this.startTop3.replaceChildren()
    if (top3src.length) {
      this.startTop3.appendChild(this._muted(top3label))
      top3src.slice(0, 3).forEach((e, i) => {
        this.startTop3.appendChild(this._row(medals[i], e.name, e.ms))
      })
    }

    // overlay: týden oficiální + mimo soutěž + all-time + ATH + výherci minulého týdne
    this._fillList(document.getElementById('board-week'), b.week)
    this._fillList(document.getElementById('board-week-unofficial'), b.weekUnofficial)
    this._fillList(document.getElementById('board-alltime'), b.allTime)
    const ath = document.getElementById('board-ath')
    ath.textContent = b.ath
      ? `👑 Rekord všech dob: ${b.ath.name} · ${formatTime(b.ath.ms)} (${b.ath.date})`
      : ''
    const winners = document.getElementById('board-winners')
    if (b.lastWeek && b.lastWeek.winners && b.lastWeek.winners.length) {
      winners.textContent = `Výherci minulého týdne (${b.lastWeek.weekId}): ` +
        b.lastWeek.winners.map((w, i) => `${medals[i]} ${w.name} (${formatTime(w.ms)})`).join(' · ')
    } else {
      winners.textContent = ''
    }

    // win overlay board: týden TOP 10 + ATH
    this.winBoard.replaceChildren()
    if (b.week && b.week.length) {
      this.winBoard.appendChild(this._muted(`Tento týden TOP 10 (oficiální):`))
      b.week.forEach((e, i) => {
        this.winBoard.appendChild(this._row(medals[i] || `${i + 1}.`, e.name, e.ms))
      })
    }
    if (b.ath) {
      this.winBoard.appendChild(this._muted(`👑 Rekord: ${b.ath.name} · ${formatTime(b.ath.ms)} (${b.ath.date})`))
    }
  }

  // Zavolat na startu kola — vyžádá podepsaný token pro ověření času.
  async beginRun() {
    this.runToken = null
    try { this.runToken = await requestSession() } catch { /* offline → submit selže hláškou */ }
  }

  _setStatus(text, cls) {
    this.saveStatus.textContent = text
    this.saveStatus.className = cls || ''
  }

  async _submit() {
    if (this.lastPlantMs == null) return
    const name = this.nameInput.value.trim()
    if (!name) { this.nameInput.focus(); return }
    const email = this.emailInput.value.trim().toLowerCase()
    saveName(name)
    if (email) saveEmail(email)
    const btn = document.getElementById('save-score-btn')
    btn.disabled = true
    btn.textContent = 'Ukládám…'
    this._setStatus('', '')
    try {
      if (!this.runToken) this.runToken = await requestSession() // fallback
      const resp = await submitScore(name, email, this.lastPlantMs, this.lastWaterMs, this.runToken)
      this.lastBoard = resp.board || resp
      this._renderAll()
      if (resp.needVerify) {
        this.verifyBox.classList.add('visible')
        this._setStatus('Výsledek uložen mimo soutěž — po ověření e-mailu se přesune do oficiálního žebříčku.', 'info')
      } else {
        this.saveScoreBox.classList.add('done')
        this._setStatus(email ? '✅ Uloženo do oficiálního žebříčku.' : 'Uloženo mimo soutěž (bez e-mailu).', 'ok')
      }
    } catch (e) {
      btn.textContent = 'Zkusit znovu'
      this._setStatus(`Uložení selhalo: ${e.message}`, 'err')
    } finally {
      btn.disabled = false
      if (this.saveScoreBox.classList.contains('done')) btn.textContent = 'Uložit výsledek'
    }
  }

  async _verify() {
    const email = this.emailInput.value.trim().toLowerCase()
    const code = this.verifyCode.value.trim()
    if (!email || code.length !== 6) { this.verifyCode.focus(); return }
    const btn = document.getElementById('verify-btn')
    btn.disabled = true
    try {
      const resp = await verifyEmail(email, code)
      this.lastBoard = resp.board || resp
      this.verifyBox.classList.remove('visible')
      this.saveScoreBox.classList.add('done')
      this._setStatus('✅ E-mail ověřen — výsledky jsou v oficiálním žebříčku.', 'ok')
      this._renderAll()
    } catch (e) {
      this._setStatus(`Ověření selhalo: ${e.message}`, 'err')
    } finally {
      btn.disabled = false
    }
  }

  showBoard() {
    this.refreshBoards()
    this.boardOverlay.classList.remove('hidden')
  }

  // ── obrazovky ──
  showStart() {
    this.startScreen.classList.remove('hidden')
    this.winOverlay.classList.add('hidden')
    this.resumeOverlay.classList.add('hidden')
    this.hud.classList.remove('visible')
    this._refreshBestLabels()
    this.refreshBoards()
  }

  showPlaying(isTouch, total) {
    this.startScreen.classList.add('hidden')
    this.quizOverlay.classList.add('hidden')
    this.winOverlay.classList.add('hidden')
    this.resumeOverlay.classList.add('hidden')
    this.boardOverlay.classList.add('hidden')
    this.hud.classList.add('visible')
    this.hudPhase.textContent = '🌱'
    this.hudCount.textContent = `0/${total}`
    this.waterGauge.classList.remove('visible')
    this.needWater.classList.remove('show')
    document.getElementById('touch-ui').classList.toggle('visible', isTouch)
    this._refreshBestLabels()
  }

  setPlanted(count, total) {
    this.hudCount.textContent = `${count}/${total}`
  }

  // přechod do fáze zalévání
  showWateringPhase(plantMs, waterCap) {
    this.hudPhase.textContent = '💧'
    this.hudCount.textContent = `0/${this.totalPlots}`
    this.waterGauge.classList.add('visible')
    this.setWater(0, waterCap)
    this.phaseFlash.textContent = `🌱 Vysazeno za ${formatTime(plantMs)} — teď zalévej!`
    this.phaseFlash.classList.remove('show')
    void this.phaseFlash.offsetWidth
    this.phaseFlash.classList.add('show')
  }

  setWatered(count, total) {
    this.hudCount.textContent = `${count}/${total}`
  }

  setWater(units, cap) {
    const drops = this.waterGauge.querySelectorAll('.drop')
    drops.forEach((d, i) => d.classList.toggle('full', i < units))
  }

  setNeedWater(show) {
    this.needWater.classList.toggle('show', show)
  }

  updateTimer(ms) {
    const totalS = ms / 1000
    const m = Math.floor(totalS / 60)
    const s = totalS - m * 60
    this.hudTime.textContent = `${m}:${s.toFixed(1).padStart(4, '0')}`
  }

  /** @returns true pokud jde o nový lokální rekord (součet) */
  showWin(plantMs, waterMs) {
    const totalMs = plantMs + waterMs
    const prevBest = this.best
    const isRecord = !prevBest || totalMs < prevBest
    if (isRecord) localStorage.setItem(BEST_KEY, String(Math.round(totalMs)))

    this.lastPlantMs = plantMs
    this.lastWaterMs = waterMs
    document.getElementById('final-plant').textContent = formatTime(plantMs)
    document.getElementById('final-water').textContent = formatTime(waterMs)
    document.getElementById('final-total').textContent = formatTime(totalMs)
    this.recordBadge.classList.toggle('show', isRecord)
    const b = this.best
    this.winBest.textContent = b ? `Nejlepší součet: ${formatTime(b)}` : ''

    // reset submit UI pro nové kolo
    this.saveScoreBox.classList.remove('done')
    this.verifyBox.classList.remove('visible')
    this.verifyCode.value = ''
    this._setStatus('', '')
    const btn = document.getElementById('save-score-btn')
    btn.disabled = false
    btn.textContent = 'Uložit výsledek'
    this.nameInput.value = getSavedName()
    this.emailInput.value = getSavedEmail()

    this.winOverlay.classList.remove('hidden')
    this.hud.classList.remove('visible')
    this.waterGauge.classList.remove('visible')
    this.needWater.classList.remove('show')
    document.getElementById('touch-ui').classList.remove('visible')
    this.refreshBoards()
    return isRecord
  }

  showResume() {
    this.resumeOverlay.classList.remove('hidden')
  }

  hideResume() {
    this.resumeOverlay.classList.add('hidden')
  }
}
