// controls.js — desktop (Pointer Lock + WASD) i mobil (joystick + drag look).
// Obě sady vstupů jsou registrované vždy: notebooky s dotykovým displejem
// hlásí maxTouchPoints > 0, ale ovládají se myší a klávesnicí. Režim (jaké UI
// ukázat) se odhadne z média a přepne se podle prvního skutečného vstupu.

/** Odhad: dotykové zařízení = hrubý primární ukazatel (prst), ne jen přítomnost touch API. */
export function isTouchDevice() {
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false
  return hasTouch && coarse
}

export class Controls {
  constructor(canvas) {
    this.canvas = canvas
    this.mode = isTouchDevice() ? 'touch' : 'desktop'
    this.touch = this.mode === 'touch' // zpětná kompatibilita
    this.yaw = 0
    this.pitch = -0.1
    this.keys = new Set()
    this.jumpHeld = false
    this.enabled = false
    this.onLockLost = null
    this.onModeChange = null

    this._setupDesktop()
    this._setupTouch()
  }

  _setMode(mode) {
    if (this.mode === mode) return
    this.mode = mode
    this.touch = mode === 'touch'
    if (this.onModeChange) this.onModeChange(mode)
  }

  _addLook(dx, dy, sens) {
    this.yaw -= dx * sens
    this.pitch -= dy * sens
    this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch))
  }

  // ── Desktop ──
  _setupDesktop() {
    const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
    document.addEventListener('keydown', e => {
      if (MOVE_KEYS.includes(e.code)) {
        e.preventDefault()
        this._setMode('desktop')
      }
      this.keys.add(e.code)
      if (e.code === 'Space') this.jumpHeld = true
    })
    document.addEventListener('keyup', e => {
      this.keys.delete(e.code)
      if (e.code === 'Space') this.jumpHeld = false
    })

    // Rozhled: primárně Pointer Lock. Když ho prohlížeč nepovolí (iframe bez
    // allow="pointer-lock", zamítnuté gesto), funguje tažení se stisknutým
    // tlačítkem, ať hráč nezůstane bez rozhledu.
    this.dragging = false
    this.dragLast = { x: 0, y: 0 }
    this.canvas.addEventListener('mousedown', e => {
      if (!this.enabled || this.mode !== 'desktop') return
      if (document.pointerLockElement === this.canvas) return
      this.dragging = true
      this.dragLast = { x: e.clientX, y: e.clientY }
      this.lock() // pokus o znovuzamčení
    })
    document.addEventListener('mouseup', () => { this.dragging = false })
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement === this.canvas) {
        this._addLook(e.movementX, e.movementY, 0.0024)
      } else if (this.dragging && this.enabled) {
        this._addLook(e.clientX - this.dragLast.x, e.clientY - this.dragLast.y, 0.0035)
        this.dragLast = { x: e.clientX, y: e.clientY }
      }
    })
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.canvas && this.enabled && this.mode === 'desktop' && this.onLockLost) {
        this.onLockLost()
      }
    })
  }

  lock() {
    if (this.mode !== 'desktop' || !this.canvas.requestPointerLock) return
    // Zamítnutí ignorujeme (Safari/iframe hází i synchronně) — rozhled pak
    // obslouží tažení myší.
    try {
      const p = this.canvas.requestPointerLock()
      if (p && p.catch) p.catch(() => {})
    } catch { /* pointer lock není k dispozici */ }
  }

  unlock() {
    this.dragging = false
    if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock()
  }

  // ── Mobil ──
  _setupTouch() {
    this.joyId = null
    this.joyOrigin = { x: 0, y: 0 }
    this.joyVec = { x: 0, y: 0 }
    this.lookId = null
    this.lookLast = { x: 0, y: 0 }

    this.joyBase = document.getElementById('joystick-base')
    this.joyKnob = document.getElementById('joystick-knob')
    const jumpBtn = document.getElementById('jump-btn')

    // pointer* pokrývá prst i myš — tlačítko skok jde zmáčknout i na PC
    jumpBtn.addEventListener('pointerdown', e => {
      e.preventDefault()
      this.jumpHeld = true
      if (jumpBtn.setPointerCapture) jumpBtn.setPointerCapture(e.pointerId)
    })
    const jumpEnd = () => { this.jumpHeld = false }
    jumpBtn.addEventListener('pointerup', jumpEnd)
    jumpBtn.addEventListener('pointercancel', jumpEnd)
    jumpBtn.addEventListener('lostpointercapture', jumpEnd)

    const area = document.body
    area.addEventListener('touchstart', e => {
      this._setMode('touch')
      if (!this.enabled) return
      for (const t of e.changedTouches) {
        if (t.target === jumpBtn) continue
        if (t.clientX < window.innerWidth * 0.45 && this.joyId === null) {
          this.joyId = t.identifier
          this.joyOrigin = { x: t.clientX, y: t.clientY }
          this.joyVec = { x: 0, y: 0 }
          this.joyBase.style.display = 'block'
          this.joyBase.style.left = t.clientX + 'px'
          this.joyBase.style.top = t.clientY + 'px'
          this._setKnob(0, 0)
        } else if (this.lookId === null) {
          this.lookId = t.identifier
          this.lookLast = { x: t.clientX, y: t.clientY }
        }
      }
    }, { passive: false })

    area.addEventListener('touchmove', e => {
      if (!this.enabled) return
      e.preventDefault()
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) {
          const dx = t.clientX - this.joyOrigin.x
          const dy = t.clientY - this.joyOrigin.y
          const len = Math.hypot(dx, dy)
          const max = 55, dead = 8
          const cl = Math.min(len, max)
          const nx = len > 0 ? dx / len : 0
          const ny = len > 0 ? dy / len : 0
          const mag = len < dead ? 0 : (cl - dead) / (max - dead)
          this.joyVec = { x: nx * mag, y: -ny * mag } // y nahoru = dopředu
          this._setKnob(nx * cl, ny * cl)
        } else if (t.identifier === this.lookId) {
          const dx = t.clientX - this.lookLast.x
          const dy = t.clientY - this.lookLast.y
          this.lookLast = { x: t.clientX, y: t.clientY }
          this._addLook(dx, dy, 0.0045)
        }
      }
    }, { passive: false })

    const endTouch = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) {
          this.joyId = null
          this.joyVec = { x: 0, y: 0 }
          this.joyBase.style.display = 'none'
        } else if (t.identifier === this.lookId) {
          this.lookId = null
        }
      }
    }
    area.addEventListener('touchend', endTouch)
    area.addEventListener('touchcancel', endTouch)
  }

  _setKnob(dx, dy) {
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
  }

  /** Pohybový vektor {x: strafe (+doprava), y: forward (+dopředu)} v rozsahu -1..1 */
  getMove() {
    if (Math.hypot(this.joyVec.x, this.joyVec.y) > 0) return { ...this.joyVec }
    let x = 0, y = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1
    const len = Math.hypot(x, y)
    if (len > 1) { x /= len; y /= len }
    return { x, y }
  }
}
