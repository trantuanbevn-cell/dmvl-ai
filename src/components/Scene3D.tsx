// Khung 3D của mô hình soạn: tường (đã đục cửa) · cột · cánh cửa/kính · sàn. Xoay/zoom bằng chuột.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { wallParts, kindOf, inside, type Model, type Pt } from '../lib/plan3d/model'
import { buildFurn } from '../lib/plan3d/furn3d'
import { furnTypeOf } from '../lib/plan3d/furn'
import { buildDoor, doorSpec, finishOf, materialFor, type DoorSpec, type Finish } from '../lib/plan3d/library'

const area = (l: Pt[]) => { let a = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
function shapeOf(rings: Pt[][]) {
  const clean = (r: Pt[]) => { const o = r.slice(); if (o.length > 1 && o[0][0] === o[o.length - 1][0] && o[0][1] === o[o.length - 1][1]) o.pop(); return o }
  const v = (r: Pt[]) => clean(r).map(p => new THREE.Vector2(p[0], -p[1]))
  const sh = new THREE.Shape(v(rings[0])); for (const h of rings.slice(1)) sh.holes.push(new THREE.Path(v(h))); return sh
}
export default function Scene3D({ model, view, custom = [], customDoors = [], ceiling = false, showFurn = true }: { model: Model; showFurn?: boolean; view: number; custom?: Finish[]; customDoors?: DoorSpec[]; ceiling?: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null), api = useRef<{ set: (m: Model, c: Finish[], cd: DoorSpec[], ceil: boolean, sf: boolean) => void; reset: (k: number) => void } | null>(null)
  useEffect(() => {
    const c = cv.current!; const r = new THREE.WebGLRenderer({ canvas: c, antialias: true }); r.setPixelRatio(Math.min(2, devicePixelRatio))
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf3f1ec)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x998f80, 1.15)); const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(40, 80, 20); scene.add(sun)
    const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 2000), ctl = new OrbitControls(cam, c); ctl.enableDamping = true
    let grp = new THREE.Group(); scene.add(grp); let bb = { x: 0, y: 0, w: 10, h: 10 }, raf = 0
    const dispose = (g: THREE.Group) => { g.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (mt) (Array.isArray(mt) ? mt : [mt]).forEach(x => x.dispose()) }) }
    const mats: Record<string, THREE.Material> = {}
    let cust: Finish[] = []
    const mat = (k: string, fin?: string) => { const f = finishOf(fin ?? kindOf(k).finish, cust), key = k + '|' + (f?.id ?? '') ; return mats[key] ??= (f ? materialFor(f) : kindOf(k).glass ? new THREE.MeshStandardMaterial({ color: kindOf(k).color, transparent: true, opacity: 0.35, roughness: 0.1 }) : new THREE.MeshStandardMaterial({ color: kindOf(k).color, roughness: 0.9 })) }
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x2a2a2a })
    const set = (M: Model, cf: Finish[], cd: DoorSpec[], ceil: boolean, sf: boolean) => {
      cust = cf; for (const k of Object.keys(mats)) delete mats[k]
      scene.remove(grp); dispose(grp); grp = new THREE.Group(); scene.add(grp)
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
      for (const w of M.walls) {
        for (const p of wallParts(w, M)) {
          if (area(p.poly[0]) === 0) continue
          for (const q of p.poly[0]) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]) }
          const g = new THREE.ExtrudeGeometry(shapeOf(p.poly), { depth: p.z1 - p.z0, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, p.z0, 0)
          grp.add(new THREE.Mesh(g, mat(w.kind, w.finish))); grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 35), edgeMat))
        }
      }
      for (const w of M.walls) { // vách kính: đố chia tấm + thanh ngang chân/đầu
        const kt = kindOf(w.kind); if (!kt.glass || !kt.frame || w.shape.type !== 'seg') continue
        const [a, b] = [w.shape.a, w.shape.b], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.2) continue
        const H = w.h ?? M.hWall, fr = kt.frame, th = Math.max(w.shape.t, fr.w), n = Math.max(1, Math.round(L / Math.max(0.2, w.panel ?? kt.panel ?? 1.2))), fm = new THREE.MeshStandardMaterial({ color: fr.color, roughness: 0.5, metalness: 0.4 })
        const gp = new THREE.Group(); gp.position.set((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2); gp.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0])
        for (let i = 0; i <= n; i++) { const o = new THREE.Mesh(new THREE.BoxGeometry(fr.w, H, th), fm); o.position.set(-L / 2 + (L * i) / n, H / 2, 0); gp.add(o) }
        for (const y of [fr.rail / 2, H - fr.rail / 2]) { const o = new THREE.Mesh(new THREE.BoxGeometry(L, fr.rail, th), fm); o.position.set(0, y, 0); gp.add(o) }
        grp.add(gp)
      }
      for (const d of M.doors) { // cánh cửa, khung, kính… theo thư viện
        const m = buildDoor(d, doorSpec(d.lib, cd), cf, d.t ?? 0.2); m.position.set(d.x, d.sill, d.y); m.rotation.y = -d.ang; if (d.flip) m.scale.z = -1; grp.add(m)
        if (d.auto && d.kind !== 'window' && d.sill + d.h < M.hWall - 0.05) { // lanh-tô trên đầu cửa (nét tường đã bị hở)
          const lt = new THREE.Mesh(new THREE.BoxGeometry(d.w, M.hWall - d.sill - d.h, (d.t ?? 0.2)), mat('brick')); lt.position.set(d.x, d.sill + d.h + (M.hWall - d.sill - d.h) / 2, d.y); lt.rotation.y = -d.ang; grp.add(lt)
        }
      }
      if (sf) for (const f of M.furn ?? []) { const g = buildFurn(f), rm = (M.rooms ?? []).find(r => r.z && inside([f.x, f.y], r.poly)); if (rm) g.position.y += rm.z ?? 0; grp.add(g) }
      for (const r of M.rooms ?? []) { // sàn & trần theo vật liệu của phòng
        const v = r.poly.map(p => new THREE.Vector2(p[0], -p[1])); if (v.length < 3) continue
        const fl = finishOf(r.floor, cf)
        if (fl) { const g = new THREE.ShapeGeometry(new THREE.Shape(v)); g.rotateX(-Math.PI / 2); const o = new THREE.Mesh(g, materialFor(fl)); o.position.y = (r.z ?? 0) + 0.01; grp.add(o) }
        if (ceil) { const cfin = finishOf(r.ceil ?? 'c-paint', cf), g = new THREE.ShapeGeometry(new THREE.Shape(r.poly.map(p => new THREE.Vector2(p[0], p[1])))); g.rotateX(Math.PI / 2); const o = new THREE.Mesh(g, materialFor(cfin)); o.position.y = r.ceilH ?? M.hWall; grp.add(o) }
      }
      if (x1 > x0) { bb = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(bb.w + 4, bb.h + 4), new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 1 })); fl.rotation.x = -Math.PI / 2; fl.position.set(bb.x + bb.w / 2, -0.02, bb.y + bb.h / 2); grp.add(fl) }
    }
    const reset = (k: number) => { const cx = bb.x + bb.w / 2, cz = bb.y + bb.h / 2, R = Math.max(bb.w, bb.h)
      if (k === 1) cam.position.set(cx, R * 1.1, cz + 0.01); else cam.position.set(cx, R * 0.6, cz + R * 0.95)
      ctl.target.set(cx, 0, cz); ctl.update() }
    const size = () => { const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix() }
    const ro = new ResizeObserver(size); ro.observe(c); size()
    const loop = () => { ctl.update(); r.render(scene, cam); raf = requestAnimationFrame(loop) }; loop()
    api.current = { set, reset }
    return () => { cancelAnimationFrame(raf); ro.disconnect(); ctl.dispose(); dispose(grp); r.dispose(); api.current = null }
  }, [])
  const first = useRef(true)
  useEffect(() => { const t = setTimeout(() => { api.current?.set(model, custom, customDoors, ceiling, showFurn); if (first.current) { first.current = false; api.current?.reset(0) } }, 120); return () => clearTimeout(t) }, [model, custom, customDoors, ceiling, showFurn])
  useEffect(() => { api.current?.reset(view) }, [view])
  return <canvas ref={cv} style={{ width: '100%', height: '72vh', display: 'block', border: '1px solid #ddd', borderRadius: 6, background: '#f3f1ec', touchAction: 'none' }} />
}
