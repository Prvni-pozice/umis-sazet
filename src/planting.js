// planting.js — 25 záhonů: fáze 1 = sázení (průchod záhonem), fáze 2 =
// zalévání (průchod se zásobou vody). Zalitá sazenice vyroste v mladý dub.
import * as THREE from 'three'

const TOUCH_R = 1.1   // vzdálenost středu hráče od středu záhonu = akce

export class Planting {
  constructor(scene, world) {
    this.scene = scene
    this.world = world
    this.group = new THREE.Group()
    this.plantedCount = 0
    this.wateredCount = 0

    // sdílené materiály
    this.trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 })
    this.leafMat = new THREE.MeshLambertMaterial({ color: 0x5fce4e })   // svěží zeleň sazeničky
    this.leafGrownMat = new THREE.MeshLambertMaterial({ color: 0x3c9a3a }) // vzrostlý dub

    this.plots = world.soilPlots.map(p => this._makePlot(p))
    scene.add(this.group)
  }

  _makePlot({ x, z, y }) {
    // sazenička: tenký kmínek + lísteček; skrytá (scale 0) dokud se nezasadí
    const g = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 0.09), this.trunkMat)
    trunk.position.y = 0.25
    trunk.castShadow = true
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), this.leafMat)
    crown.position.y = 0.58
    crown.castShadow = true
    // koruna dospělého stromku (objeví se růstem po zalití)
    const bigCrown = new THREE.Group()
    const bc1 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.7, 0.85), this.leafGrownMat)
    bc1.position.y = 1.45
    const bc2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.55), this.leafGrownMat)
    bc2.position.y = 1.95
    bc1.castShadow = true; bc2.castShadow = true
    bigCrown.add(bc1, bc2)
    bigCrown.scale.setScalar(0.001)
    bigCrown.visible = false

    g.add(trunk, crown, bigCrown)
    g.position.set(x + 0.5, y, z + 0.5)
    g.scale.setScalar(0.001)
    g.visible = false
    this.group.add(g)

    return {
      x, z, y,
      pos: new THREE.Vector3(x + 0.5, y, z + 0.5),
      planted: false,
      watered: false,
      mesh: g, trunk, crown, bigCrown,
      popT: -1,   // animace zasazení (0..1)
      growT: -1,  // animace růstu po zalití (0..1)
      swayPhase: Math.random() * Math.PI * 2,
    }
  }

  _near(playerPos, plot) {
    const dx = playerPos.x - plot.pos.x
    const dz = playerPos.z - plot.pos.z
    return dx * dx + dz * dz < TOUCH_R * TOUCH_R && Math.abs(playerPos.y - plot.y) < 2
  }

  /** Fáze 1: průchod nezasazeným záhonem → zasadit. Vrací plot nebo null. */
  tryPlant(playerPos) {
    for (const p of this.plots) {
      if (p.planted || !this._near(playerPos, p)) continue
      p.planted = true
      p.popT = 0
      p.mesh.visible = true
      this.plantedCount++
      return p
    }
    return null
  }

  /** Fáze 2: průchod zasazeným nezalitým záhonem → zalít. Vrací plot nebo null. */
  tryWater(playerPos) {
    for (const p of this.plots) {
      if (!p.planted || p.watered || !this._near(playerPos, p)) continue
      p.watered = true
      p.growT = 0
      this.wateredCount++
      return p
    }
    return null
  }

  /** Cíle pro markery: fáze 1 = nezasazené záhony, fáze 2 = nezalité sazenice */
  pendingTargets(phase) {
    return this.plots.filter(p => phase === 'planting' ? !p.planted : (p.planted && !p.watered))
  }

  update(dt) {
    for (const p of this.plots) {
      // pop-in zasazené sazeničky (pružné škubnutí)
      if (p.popT >= 0 && p.popT < 1) {
        p.popT = Math.min(1, p.popT + dt / 0.4)
        const t = p.popT
        const overshoot = 1 + Math.sin(t * Math.PI) * 0.25
        p.mesh.scale.setScalar(Math.max(0.001, t * overshoot))
      }
      // růst po zalití: kmínek se protáhne, velká koruna se nafoukne
      if (p.growT >= 0 && p.growT < 1) {
        p.growT = Math.min(1, p.growT + dt / 1.1)
        const t = p.growT
        const e = 1 - Math.pow(1 - t, 3) // ease-out
        p.trunk.scale.y = 1 + e * 2.2
        p.trunk.position.y = 0.25 * p.trunk.scale.y
        p.crown.scale.setScalar(Math.max(0.001, 1 - e))       // lísteček ustoupí koruně
        p.bigCrown.visible = true
        p.bigCrown.scale.setScalar(Math.max(0.001, e))
      }
      // jemné pohupování zalitých stromků
      if (p.watered && p.growT >= 1) {
        p.bigCrown.rotation.z = Math.sin(performance.now() / 1000 * 1.1 + p.swayPhase) * 0.03
      }
    }
  }

  dispose() {
    this.scene.remove(this.group)
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose() })
    for (const m of [this.trunkMat, this.leafMat, this.leafGrownMat]) m.dispose()
    this.plots = []
  }
}
