// Test ovládání bez prohlížeče: minimální DOM stub + kontrola,
// že na PC s dotykovým displejem funguje klávesnice, myš i tlačítko skok.
function makeEl(id) {
  const el = { id, style: {}, classList: { _s: new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)}, contains(c){return this._s.has(c)}, toggle(c,v){v?this.add(c):this.remove(c)} }, _h: {} }
  el.addEventListener = (t, f) => { (el._h[t] ||= []).push(f) }
  el.fire = (t, e = {}) => (el._h[t] || []).forEach(f => f({ preventDefault(){}, ...e }))
  el.setPointerCapture = () => {}
  return el
}
function setupDom({ coarse, maxTouchPoints }) {
  const els = { 'joystick-base': makeEl('joystick-base'), 'joystick-knob': makeEl('joystick-knob'), 'jump-btn': makeEl('jump-btn') }
  const body = makeEl('body')
  const doc = { _h: {}, body, pointerLockElement: null,
    getElementById: id => els[id],
    addEventListener: (t, f) => { (doc._h[t] ||= []).push(f) },
    fire: (t, e = {}) => (doc._h[t] || []).forEach(f => f({ preventDefault(){}, ...e })),
    exitPointerLock: () => { doc.pointerLockElement = null } }
  global.document = doc
  global.window = { innerWidth: 1440, innerHeight: 900, matchMedia: q => ({ matches: q.includes('coarse') ? coarse : false }) }
  Object.defineProperty(global, 'navigator', { value: { maxTouchPoints }, configurable: true, writable: true })
  return { doc, els, body }
}

let fail = 0
const ok = (name, cond) => { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fail++ }

async function scenario(name, env, fn) {
  console.log('\n=== ' + name + ' ===')
  const dom = setupDom(env)
  const mod = await import(new URL('../src/controls.js', import.meta.url).href + '?' + Math.random())
  const canvas = makeEl('canvas')
  canvas.requestPointerLock = () => { dom.doc.pointerLockElement = canvas }
  const c = new mod.Controls(canvas)
  c.enabled = true
  fn(c, dom, canvas)
}

// 1) PC s dotykovou obrazovkou: maxTouchPoints > 0, ale jemný ukazatel
await scenario('PC s dotykovým displejem (maxTouchPoints=10, pointer:fine)',
  { coarse: false, maxTouchPoints: 10 }, (c, dom, canvas) => {
    ok('režim = desktop', c.mode === 'desktop')
    dom.doc.fire('keydown', { code: 'KeyW' })
    ok('W jede dopředu', c.getMove().y === 1)
    dom.doc.fire('keyup', { code: 'KeyW' })
    ok('po puštění stojí', c.getMove().y === 0)
    dom.doc.fire('keydown', { code: 'Space' })
    ok('mezerník skáče', c.jumpHeld === true)
    dom.doc.fire('keyup', { code: 'Space' })
    c.lock()
    ok('pointer lock zamčen', dom.doc.pointerLockElement === canvas)
    const y0 = c.yaw
    dom.doc.fire('mousemove', { movementX: 100, movementY: 0 })
    ok('myš otáčí rozhled', c.yaw !== y0)
    // tlačítko skok myší
    dom.els['jump-btn'].fire('pointerdown', { pointerId: 1 })
    ok('tlačítko SKOK reaguje na myš', c.jumpHeld === true)
    dom.els['jump-btn'].fire('pointerup', { pointerId: 1 })
    ok('tlačítko SKOK pouští', c.jumpHeld === false)
  })

// 2) PC bez pointer locku (např. iframe) — musí fungovat tažení myší
await scenario('PC bez pointer locku (iframe)', { coarse: false, maxTouchPoints: 0 }, (c, dom, canvas) => {
  canvas.requestPointerLock = () => { throw new Error('blocked') }
  let threw = false
  try { canvas.fire('mousedown', { clientX: 500, clientY: 400 }) } catch { threw = true }
  ok('mousedown nespadne', !threw)
  const y0 = c.yaw
  dom.doc.fire('mousemove', { clientX: 560, clientY: 400 })
  ok('tažení otáčí rozhled', c.yaw !== y0)
  dom.doc.fire('mouseup', {})
  const y1 = c.yaw
  dom.doc.fire('mousemove', { clientX: 700, clientY: 400 })
  ok('po puštění se rozhled nehýbe', c.yaw === y1)
})

// 3) Mobil
await scenario('Mobil (pointer:coarse)', { coarse: true, maxTouchPoints: 5 }, (c, dom) => {
  ok('režim = touch', c.mode === 'touch')
  dom.body.fire('touchstart', { changedTouches: [{ identifier: 1, target: null, clientX: 200, clientY: 700 }] })
  dom.body.fire('touchmove', { changedTouches: [{ identifier: 1, clientX: 200, clientY: 640 }] })
  ok('joystick jede dopředu', c.getMove().y > 0)
  dom.body.fire('touchend', { changedTouches: [{ identifier: 1 }] })
  ok('po puštění stojí', c.getMove().y === 0)
  dom.els['jump-btn'].fire('pointerdown', { pointerId: 2 })
  ok('tlačítko SKOK reaguje na dotyk', c.jumpHeld === true)
  dom.els['jump-btn'].fire('pointerup', { pointerId: 2 })
})

// 4) Přepnutí režimu podle skutečného vstupu
await scenario('Hybrid: desktop → dotyk po skutečném doteku', { coarse: false, maxTouchPoints: 10 }, (c, dom) => {
  let seen = null
  c.onModeChange = m => { seen = m }
  dom.body.fire('touchstart', { changedTouches: [{ identifier: 1, target: null, clientX: 100, clientY: 700 }] })
  ok('režim přepnut na touch', c.mode === 'touch' && seen === 'touch')
  dom.doc.fire('keydown', { code: 'KeyW' })
  ok('režim zpět na desktop po klávese', c.mode === 'desktop' && seen === 'desktop')
  dom.doc.fire('keyup', { code: 'KeyW' })
})

console.log(fail === 0 ? '\nVŠE OK' : `\n${fail} SELHÁNÍ`)
process.exit(fail ? 1 : 0)
