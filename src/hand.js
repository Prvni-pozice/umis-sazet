// hand.js — first-person ruka vpravo dole: v fázi sázení drží sazeničku,
// ve fázi zalévání vědro s viditelnou hladinou vody (dle zásoby).
// Animace: hod sazeničky (švih dolů), nabrání vody (ponor + náklon),
// zalití (krátké naklopení vědra).
import * as THREE from 'three'

export class Hand {
  constructor(camera) {
    this.camera = camera
    this.group = new THREE.Group()
    // pravý dolní roh zorného pole
    this.basePos = new THREE.Vector3(0.42, -0.38, -0.75)
    this.baseRot = new THREE.Euler(-0.25, -0.35, 0.12)
    this.group.position.copy(this.basePos)
    this.group.rotation.copy(this.baseRot)
    camera.add(this.group)

    // předloktí (rukáv) + dlaň — bez stínů, renderují se blízko kamery
    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0x3e7d3a }) // zelený rukáv (zahradník)
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a06b })
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.42), sleeveMat)
    sleeve.position.z = 0.16
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.13, 0.2), skinMat)
    palm.position.z = -0.14
    this.group.add(sleeve, palm)

    // ── sazenička v dlani ──
    this.sapling = new THREE.Group()
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 })
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x5fce4e })
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.035), trunkMat)
    st.position.y = 0.14
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), leafMat)
    sl.position.y = 0.27
    const rootBall = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.09), new THREE.MeshLambertMaterial({ color: 0x5a3d24 }))
    rootBall.position.y = 0.035
    this.sapling.add(st, sl, rootBall)
    this.sapling.position.set(0, 0.03, -0.18)
    this.group.add(this.sapling)

    // ── vědro ──
    this.bucket = new THREE.Group()
    const bucketMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 }) // plech
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.16, 10, 1, true), bucketMat)
    wall.material.side = THREE.DoubleSide
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.015, 10), bucketMat)
    bottom.position.y = -0.08
    this.waterMat = new THREE.MeshBasicMaterial({ color: 0x3fa8e0 })
    this.waterDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 10), this.waterMat)
    this.waterDisc.position.y = -0.05
    this.waterDisc.visible = false
    this.bucket.add(wall, bottom, this.waterDisc)
    this.bucket.position.set(0, -0.02, -0.2)
    this.bucket.visible = false
    this.group.add(this.bucket)

    this.item = 'sapling'
    this.anim = null   // { type, t, dur, onDone }
    this.bobT = 0
  }

  /** 'sapling' | 'bucket' | null */
  setItem(item) {
    this.item = item
    this.sapling.visible = item === 'sapling'
    this.bucket.visible = item === 'bucket'
  }

  /** Hladina ve vědru: 0..1 (poměr zásoby) */
  setBucketFill(ratio) {
    this.waterDisc.visible = ratio > 0.001
    this.waterDisc.position.y = -0.075 + ratio * 0.13
  }

  playPlant(onDone) { this.anim = { type: 'plant', t: 0, dur: 0.45, onDone } }
  playScoop(onDone) { this.anim = { type: 'scoop', t: 0, dur: 0.6, onDone } }
  playPour(onDone) { this.anim = { type: 'pour', t: 0, dur: 0.5, onDone } }

  /** @param speed rychlost hráče (bob při chůzi) */
  update(dt, speed = 0) {
    this.bobT += dt * (2 + speed * 1.6)
    const bobY = Math.sin(this.bobT * 2) * 0.008 * Math.min(1, speed)
    const bobX = Math.cos(this.bobT) * 0.006 * Math.min(1, speed)

    let offY = 0, offZ = 0, rotX = 0, rotZ = 0
    if (this.anim) {
      const a = this.anim
      a.t += dt
      const t = Math.min(1, a.t / a.dur)
      const swing = Math.sin(t * Math.PI) // 0→1→0
      if (a.type === 'plant') {
        // švih dolů-dopředu (hod sazeničky do záhonu)
        offY = -swing * 0.22
        offZ = -swing * 0.28
        rotX = -swing * 1.1
        if (t > 0.5) this.sapling.visible = false // sazenička „opustila" ruku
      } else if (a.type === 'scoop') {
        // ponor vědra dolů + náklon a zpět
        offY = -swing * 0.3
        rotX = swing * 0.7
        rotZ = swing * 0.4
      } else if (a.type === 'pour') {
        // naklopení vědra dopředu (zalévání)
        rotX = -swing * 0.9
        offY = -swing * 0.08
      }
      if (t >= 1) {
        const done = a.onDone
        this.anim = null
        if (this.item === 'sapling') this.sapling.visible = true // další sazenička v ruce
        if (done) done()
      }
    }

    this.group.position.set(
      this.basePos.x + bobX,
      this.basePos.y + bobY + offY,
      this.basePos.z + offZ,
    )
    this.group.rotation.set(
      this.baseRot.x + rotX,
      this.baseRot.y,
      this.baseRot.z + rotZ,
    )
  }

  dispose() {
    this.camera.remove(this.group)
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) o.material.dispose()
    })
  }
}
