// main.js — orchestrace: renderer, osvětlení, obloha, post-processing, game loop.
// Hra „Umíš sázet?": fáze 1 = zasadit PLOT_COUNT sazenic (průchod záhonem),
// fáze 2 = zalít je (vědro na 5 dílků, doplňování u vody). Dva časy.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'

import { World, SIZE } from './world.js'
import { Player } from './player.js'
import { Controls, isTouchDevice } from './controls.js'
import { Animals } from './animals.js'
import { Planting } from './planting.js'
import { Hand } from './hand.js'
import { Particles } from './particles.js'
import { UI } from './ui.js'
import { QualityManager } from './quality.js'
import { AudioFX } from './audio.js'

const WATER_CAP = 5      // dílků vody ve vědru

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Game {
  constructor() {
    this.touch = isTouchDevice()
    this.state = 'menu' // menu | planting | watering | won
    this.phaseStart = 0
    this.plantMs = 0    // čas fáze sázení (finální po dokončení)
    this.waterMs = 0    // čas fáze zalévání
    this.water = 0      // aktuální zásoba vody (0..WATER_CAP)

    this._setupRenderer()
    this._setupSceneBase()
    this._setupPost()

    this.audio = new AudioFX()
    this.stepDistance = 0
    this._prevPlayerXZ = null

    const muteBtn = document.getElementById('mute-btn')
    muteBtn.textContent = this.audio.muted ? '🔇' : '🔊'
    muteBtn.addEventListener('click', () => {
      this.audio.init()
      muteBtn.textContent = this.audio.toggleMute() ? '🔇' : '🔊'
    })

    this.controls = new Controls(this.renderer.domElement)
    this.controls.onLockLost = () => {
      if (this.state === 'planting' || this.state === 'watering') {
        this.paused = true
        this.ui.showResume()
      }
    }

    this.ui = new UI({
      isTouch: this.touch,
      onStart: () => this._startRound(),          // voláno až PO kvízu
      onReplay: () => { this._rebuildRound(); this.ui.showQuiz() },
      onResume: () => {
        this.paused = false
        this.ui.hideResume()
        this.controls.lock()
      },
    })

    this._buildRound()

    window.addEventListener('resize', () => this._onResize())
    this.clock = new THREE.Clock()
    this.renderer.setAnimationLoop(() => this._tick())
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false, // AA řeší SMAA pass
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    document.body.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2500)
  }

  _setupSceneBase() {
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0xd3e6f2, 90, 420)
    this.scene.add(this.camera) // kvůli FP ruce (child kamery)

    // slunce výš — česká letní obloha, kratší stíny než Miami západ
    const sunDir = new THREE.Vector3(0.55, 0.62, 0.42).normalize()
    this.sunDir = sunDir

    // obloha: letní modř nad Vysočinou, jemná záře kolem slunce, duha
    // naproti slunci (ladí se zaléváním — „po dešti")
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uSunDir: { value: sunDir } },
      vertexShader: /* glsl */`
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uSunDir;
        varying vec3 vWorldPos;
        vec3 hsv2rgb(vec3 c) {
          vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
          return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
        }
        void main() {
          vec3 dir = normalize(vWorldPos - cameraPosition);
          float h = dir.y;

          // letní česká modř: sytá v zenitu, mléčně světlá u obzoru
          vec3 zenith = vec3(0.13, 0.38, 0.82);
          vec3 horizon = vec3(0.76, 0.87, 0.95);
          vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));

          // teplý nádech u obzoru na straně slunce (jemný, žádné Miami)
          vec2 dxz = normalize(dir.xz + vec2(1e-5));
          vec2 sxz = normalize(uSunDir.xz + vec2(1e-5));
          float az = dot(dxz, sxz) * 0.5 + 0.5;
          float warm = smoothstep(0.55, 1.0, az) * pow(clamp(1.0 - h, 0.0, 1.0), 2.2);
          col = mix(col, vec3(1.0, 0.88, 0.72), warm * 0.28);

          // duha na opačné straně než slunce (kolem anti-solárního bodu, ~40–42°)
          float ra = degrees(acos(clamp(dot(dir, -uSunDir), -1.0, 1.0)));
          float rt = (ra - 40.0) / 2.2;
          float arc = smoothstep(0.0, 0.12, rt) * smoothstep(1.0, 0.86, rt);
          float aboveH = smoothstep(-0.03, 0.12, h);
          vec3 rainbow = hsv2rgb(vec3((1.0 - clamp(rt, 0.0, 1.0)) * 0.72, 0.85, 1.0));
          col = mix(col, rainbow, arc * aboveH * 0.4);

          // sluneční kotouč + záře
          float s = dot(dir, normalize(uSunDir));
          float glow = pow(max(s, 0.0), 900.0) * 0.85 + pow(max(s, 0.0), 60.0) * 0.22;
          col += vec3(1.0, 0.93, 0.78) * glow;
          col += vec3(1.0, 0.97, 0.88) * smoothstep(0.99955, 0.99985, s) * 2.2;

          // pod obzorem opar
          col = mix(col, vec3(0.74, 0.83, 0.88), smoothstep(0.0, -0.12, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat)
    this.sky.position.set(SIZE / 2, 0, SIZE / 2)
    this.scene.add(this.sky)

    // ambient výplň: obloha shora, odraz zeleně zdola (žádná černá zákoutí)
    this.hemi = new THREE.HemisphereLight(0xd6ecff, 0x9ec27f, 2.0)
    this.scene.add(this.hemi)
    this.ambient = new THREE.AmbientLight(0xdce8ff, 0.42)
    this.scene.add(this.ambient)

    this.sun = new THREE.DirectionalLight(0xfff6e0, 1.35)
    this.sun.position.copy(sunDir).multiplyScalar(140).add(new THREE.Vector3(SIZE / 2, 0, SIZE / 2))
    this.sun.target.position.set(SIZE / 2, 0, SIZE / 2)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(this.touch ? 2048 : 4096, this.touch ? 2048 : 4096)
    const d = SIZE / 2 + 14
    this.sun.shadow.camera.left = -d
    this.sun.shadow.camera.right = d
    this.sun.shadow.camera.top = d
    this.sun.shadow.camera.bottom = -d
    this.sun.shadow.camera.near = 5
    this.sun.shadow.camera.far = 380
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.03
    this.sun.shadow.intensity = 0.45
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)
  }

  _setupPost() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.32,  // strength — odlesky vody, slunce
      0.6,   // radius
      0.85,  // threshold
    )
    this.composer.addPass(this.bloom)
    this.smaa = new SMAAPass(
      window.innerWidth * this.renderer.getPixelRatio(),
      window.innerHeight * this.renderer.getPixelRatio(),
    )
    this.composer.addPass(this.smaa)

    this.quality = new QualityManager({
      renderer: this.renderer,
      composer: this.composer,
      bloom: this.bloom,
      smaa: this.smaa,
      isTouch: this.touch,
    })
  }

  _buildRound() {
    const seed = (Math.random() * 2 ** 31) | 0
    this.world = new World(this.scene, seed)
    this.world.waterUniforms.uSunDir.value.copy(this.sunDir)

    this.player = new Player(this.world)
    this.particles = new Particles(this.scene)
    this.player.onSplash = pos => {
      this.particles.splash(pos)
      this.audio.splash()
    }

    this.animals = new Animals(this.scene, this.world, mulberry32(seed ^ 0xabcdef), this.player.pos)
    this.planting = new Planting(this.scene, this.world)
    this.totalPlots = this.planting.plots.length // = PLOT_COUNT (kolik se vešlo)
    this.ui.setPlotCount(this.totalPlots)
    this.hand = new Hand(this.camera)
    this.hand.setItem(null) // v menu bez ruky
    this.water = 0
    this.paused = false
  }

  _rebuildRound() {
    this.world.dispose()
    this.animals.dispose()
    this.planting.dispose()
    this.hand.dispose()
    this.particles.dispose()
    this._buildRound()
  }

  _startRound() {
    this.state = 'planting'
    this.paused = false
    this.phaseStart = performance.now()
    this.plantMs = 0
    this.waterMs = 0
    this.water = 0
    this.audio.init() // user gesture — iOS vyžaduje
    this.ui.beginRun() // vyžádá anti-cheat token (fire-and-forget)
    this.hand.setItem('sapling')
    this.controls.enabled = true
    this.controls.lock()
    this.ui.showPlaying(this.touch, this.totalPlots)
  }

  _enterWatering() {
    this.plantMs = performance.now() - this.phaseStart
    this.state = 'watering'
    this.phaseStart = performance.now()
    this.audio.phase()
    this.hand.setItem('bucket')
    this.hand.setBucketFill(0)
    this.ui.showWateringPhase(this.plantMs, WATER_CAP)
  }

  _win() {
    this.waterMs = performance.now() - this.phaseStart
    this.state = 'won'
    this.particles.confetti(this.player.pos.clone().add(new THREE.Vector3(0, 2, 0)))
    this.audio.fanfare()
    this.hand.setItem(null)
    this.controls.enabled = false
    this.controls.unlock()
    this.ui.showWin(this.plantMs, this.waterMs)
  }

  _tick() {
    const rawDt = this.clock.getDelta()
    this.quality.update(rawDt)
    const dt = Math.min(rawDt, 0.05)

    const playing = (this.state === 'planting' || this.state === 'watering') && !this.paused
    let speed = 0

    if (playing) {
      const move = this.controls.getMove()
      this.player.update(dt, move, this.controls.yaw, this.controls.jumpHeld)
      speed = Math.hypot(this.player.vel.x, this.player.vel.z) / 5.6

      // kroky: každé ~2.1 bloku ušlé po zemi
      if (this._prevPlayerXZ && this.player.onGround && !this.player.inWater) {
        this.stepDistance += Math.hypot(
          this.player.pos.x - this._prevPlayerXZ.x,
          this.player.pos.z - this._prevPlayerXZ.z,
        )
        if (this.stepDistance > (this.world.inMeadow(this.player.pos.x, this.player.pos.z) ? 1.3 : 2.1)) {
          this.stepDistance = 0
          if (this.world.inMeadow(this.player.pos.x, this.player.pos.z)) this.audio.grass()
          else this.audio.step()
        }
      }
      this._prevPlayerXZ = { x: this.player.pos.x, z: this.player.pos.z }
      if (this.player.justJumped) {
        this.player.justJumped = false
        this.audio.jump()
      }

      this.ui.updateTimer(performance.now() - this.phaseStart)

      if (this.state === 'planting') {
        const plot = this.planting.tryPlant(this.player.pos)
        if (plot) {
          this.audio.plant()
          this.hand.playPlant()
          this.particles.confetti(plot.pos.clone().add(new THREE.Vector3(0, 0.6, 0)))
          this.ui.setPlanted(this.planting.plantedCount, this.totalPlots)
          if (this.planting.plantedCount >= this.totalPlots) this._enterWatering()
        }
      } else if (this.state === 'watering') {
        // doplnění vody dotykem vodní plochy
        if (this.player.inWater && this.water < WATER_CAP) {
          this.water = WATER_CAP
          this.audio.scoop()
          this.hand.playScoop()
          this.hand.setBucketFill(1)
          this.particles.splash(new THREE.Vector3(this.player.pos.x, this.world.waterY, this.player.pos.z))
          this.ui.setWater(this.water, WATER_CAP)
        }
        // zalití sazenice (jen se zásobou vody)
        if (this.water > 0) {
          const plot = this.planting.tryWater(this.player.pos)
          if (plot) {
            this.water--
            this.audio.pour()
            this.hand.playPour()
            this.hand.setBucketFill(this.water / WATER_CAP)
            this.particles.splash(plot.pos.clone().add(new THREE.Vector3(0, 0.8, 0)))
            setTimeout(() => this.audio.grow(), 350) // stromek „vystřelí"
            this.ui.setWatered(this.planting.wateredCount, this.totalPlots, this.water)
            if (this.planting.wateredCount >= this.totalPlots) this._win()
          }
        }
        this.ui.setNeedWater(this.water === 0)
      }
    }

    // kamera
    const eye = this.player.eyePosition
    this.camera.position.copy(eye)
    this.camera.rotation.set(0, 0, 0)
    this.camera.rotateY(this.controls.yaw)
    this.camera.rotateX(this.controls.pitch)

    this._updateTargetMarkers()

    this.world.update(dt)
    this.animals.update(dt, this.player.pos, () => this.audio.squeak())
    this.planting.update(dt)
    this.hand.update(dt, speed)
    this.particles.update(dt)

    this.composer.render()
  }

  // Markery cílů: 🌱 nad nezasazenými záhony (fáze 1), 💧 nad nezalitými
  // sazenicemi (fáze 2). Zobrazuje se nejbližších 8, mimo obrazovku se
  // přichytí k okraji jako šipka.
  _updateTargetMarkers() {
    const container = document.getElementById('target-markers')
    const show = (this.state === 'planting' || this.state === 'watering') && !this.paused
    if (container.style.display !== (show ? 'block' : 'none')) {
      container.style.display = show ? 'block' : 'none'
    }
    if (!show) return
    if (!this._markers) this._markers = []
    if (!this._markTmp) { this._markTmp = new THREE.Vector3(); this._markFwd = new THREE.Vector3() }

    const icon = this.state === 'planting' ? '🌱' : '💧'
    const targets = this.planting.pendingTargets(this.state)
      .map(p => ({ p, d: this.player.pos.distanceTo(p.pos) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8)

    const W = window.innerWidth, H = window.innerHeight
    const cx = W / 2, cy = H / 2, pad = 36
    const camPos = this.camera.position
    this.camera.getWorldDirection(this._markFwd)
    let mi = 0

    for (const { p, d } of targets) {
      let el = this._markers[mi]
      if (!el) {
        el = document.createElement('div')
        el.className = 'target-marker'
        el.innerHTML = '<span class="ic"></span><span class="dist"></span>'
        container.appendChild(el)
        this._markers[mi] = el
      }
      el.style.display = 'flex'
      el.querySelector('.ic').textContent = icon

      const t = this._markTmp
      t.copy(p.pos); t.y += 1.8
      const behind = t.clone().sub(camPos).dot(this._markFwd) < 0
      t.project(this.camera)
      let sx = (t.x * 0.5 + 0.5) * W
      let sy = (-t.y * 0.5 + 0.5) * H
      if (behind) { sx = W - sx; sy = H - sy }

      const offscreen = behind || sx < pad || sx > W - pad || sy < pad || sy > H - pad
      if (offscreen) {
        let vx = sx - cx, vy = sy - cy
        const len = Math.hypot(vx, vy) || 1
        vx /= len; vy /= len
        const scale = Math.min((cx - pad) / Math.max(Math.abs(vx), 1e-3), (cy - pad) / Math.max(Math.abs(vy), 1e-3))
        sx = cx + vx * scale; sy = cy + vy * scale
      }
      el.style.left = sx + 'px'
      el.style.top = sy + 'px'
      el.classList.toggle('edge', offscreen)
      if (!offscreen) el.querySelector('.dist').textContent = Math.round(d) + ' m'
      mi++
    }
    for (let j = mi; j < this._markers.length; j++) this._markers[j].style.display = 'none'
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }
}

new Game()
