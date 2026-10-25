// CROP KHÔNG GIAN kiểu isometric: tách một phòng ra khỏi công trình (sàn + hai mảng tường phía sau + nội thất), tường phía người nhìn bị hạ thấp
// để thấy bên trong. Màu phẳng, viền mảnh, vật liệu lấy từ danh mục (nếu có). Trả về ảnh + vị trí các điểm chú thích đã chiếu ra màn hình.
import * as THREE from 'three'
import polygonClipping from 'polygon-clipping'
import { wallParts, wallH, doorRect, type Model, type Pt, type Room } from './model'
import { finishOf, wallTypeOf } from './library'
import { furnTypeOf } from './furn'
import { buildFurn } from './furn3d'
import type { MatFor } from './section'

export type IsoLabel = { n: number; name: string; color: string; code?: string; src: 'catalog' | 'lib'; note?: string; x: number; y: number }
export type IsoResult = { url: string; w: number; h: number; labels: IsoLabel[] }

const PAPER = 0xf4efe6
const shapeOf = (rings: Pt[][]) => {
  const clean = (r: Pt[]) => { const o = r.slice(); if (o.length > 1 && o[0][0] === o[o.length - 1][0] && o[0][1] === o[o.length - 1][1]) o.pop(); return o }
  const v = (r: Pt[]) => clean(r).map(p => new THREE.Vector2(p[0], -p[1]))
  const sh = new THREE.Shape(v(rings[0])); for (const h of rings.slice(1)) sh.holes.push(new THREE.Path(v(h))); return sh
}
const cen = (l: Pt[]): Pt => { let x = 0, y = 0; for (const p of l) { x += p[0]; y += p[1] } return [x / l.length, y / l.length] }

/** az = 0..3: góc nhìn từ 4 góc phòng (0 = từ góc dưới-phải của mặt bằng) */
export function renderRoomIso(M: Model, room: Room, az: number, mat?: MatFor, W = 1000, H = 720): IsoResult {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setPixelRatio(1); r.setSize(W, H); r.setClearColor(PAPER, 1)
  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 1.9)); const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(-30, 60, 25); scene.add(sun)
  const edge = new THREE.LineBasicMaterial({ color: 0x4a443c })
  const zf = room.z ?? 0, zc = room.ceilH ?? M.hWall
  const fm = mat?.('floor', room.name), wm = mat?.('wall', room.name)
  const floorCol = fm?.color ?? finishOf(room.floor)?.color ?? '#d6c7ad'
  const wallCol = wm?.color ?? '#efe9dd'
  const L = (m: THREE.Mesh, deg = 30) => { scene.add(m); const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, deg), edge); e.position.copy(m.position); e.rotation.copy(m.rotation); scene.add(e); return m }
  const solid = (c: THREE.ColorRepresentation, opacity = 1) => new THREE.MeshLambertMaterial({ color: c, transparent: opacity < 1, opacity })

  // khung crop: bbox phòng + 0.35 m (để thấy bề dày tường liền kề)
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9
  for (const p of room.poly) { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]) }
  const E = 0.35, rect: Pt[][] = [[[bx0 - E, by0 - E], [bx1 + E, by0 - E], [bx1 + E, by1 + E], [bx0 - E, by1 + E]]]
  const c0 = cen(room.poly)
  // hướng từ tâm phòng tới camera (mặt phẳng ngang)
  const ang = Math.PI / 4 + az * Math.PI / 2, cx = Math.cos(ang), cy = Math.sin(ang)

  // sàn + bản sàn
  { const g = new THREE.ExtrudeGeometry(shapeOf([room.poly]), { depth: 0.14, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, zf - 0.14, 0)
    const m = new THREE.Mesh(g, [solid(floorCol), solid('#b9b3a6')]); L(m) }
  // tường
  const labelPts: { name: string; mat?: ReturnType<MatFor>; p: THREE.Vector3; lib: string; libCol: string; kind: 'floor' | 'wall' | 'furn' | 'door' }[] = []
  labelPts.push({ name: 'Sàn', mat: fm, p: new THREE.Vector3(c0[0], zf, c0[1]), lib: finishOf(room.floor)?.name ?? 'Lớp hoàn thiện sàn', libCol: floorCol, kind: 'floor' })
  const farCand: { x: number; y: number; z: number; dot: number }[] = []
  for (const w of M.walls) {
    const Hw = Math.min(wallH(w, M), zc), wt = wallTypeOf(w.kind)
    if (wt.glass) continue
    for (const part of wallParts(w, M)) {
      let cl: Pt[][][] = []
      try { cl = polygonClipping.intersection(part.poly as any, rect as any) as unknown as Pt[][][] } catch { continue }
      for (const poly of cl) {
        const o = poly[0]; if (!o || o.length < 3) continue
        const pc = cen(o), dot = (pc[0] - c0[0]) * cx + (pc[1] - c0[1]) * cy
        const near = dot > 0.2 * Math.hypot(bx1 - bx0, by1 - by0) * 0.5 + 0.1
        const z1 = near ? Math.min(part.z1, 0.1) : Math.min(part.z1, Hw)
        const z0 = part.z0; if (z1 - z0 < 0.01) continue
        const g = new THREE.ExtrudeGeometry(shapeOf(poly), { depth: z1 - z0, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, zf + z0, 0)
        const side = finishOf(w.finish)?.color ?? wallCol
        L(new THREE.Mesh(g, [solid('#d9d3c7'), solid(near ? '#d9d3c7' : wm?.color ?? side)]))
        if (!near && z1 > 1.2) farCand.push({ x: pc[0], y: pc[1], z: zf + Math.min(1.6, z1 * 0.6), dot })
      }
    }
  }
  // cửa sổ / cửa kính / cửa đi của tường phía sau (tấm mỏng trong ô trống)
  for (const d of M.doors) {
    const rr = doorRect(d, 0.2), dc = cen(rr)
    if (dc[0] < bx0 - E || dc[0] > bx1 + E || dc[1] < by0 - E || dc[1] > by1 + E) continue
    if ((dc[0] - c0[0]) * cx + (dc[1] - c0[1]) * cy > 0.2 * Math.hypot(bx1 - bx0, by1 - by0) * 0.5 + 0.1) continue
    const glass = d.kind === 'window' || d.kind === 'slide'
    const g = new THREE.BoxGeometry(d.w, Math.max(0.05, d.h), 0.04), m = new THREE.Mesh(g, solid(glass ? '#a9d4e0' : '#b08968', glass ? 0.6 : 1))
    m.position.set(d.x, zf + d.sill + d.h / 2, d.y); m.rotation.y = -d.ang; L(m)
  }
  // nội thất trong phòng
  const fur = (M.furn ?? []).filter(f => f.x >= bx0 - 0.1 && f.x <= bx1 + 0.1 && f.y >= by0 - 0.1 && f.y <= by1 + 0.1)
  for (const f of fur) {
    const g = buildFurn(f, finishOf(f.finish)?.color); g.position.y += zf
    g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { const old = m.material as THREE.MeshStandardMaterial; m.material = solid(old.color ?? '#bbb'); const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 35), edge); m.add(e) } })
    scene.add(g)
  }
  const big = [...fur].filter(f => !['rug'].includes(f.kind)).sort((a, b) => b.w * b.d - a.w * a.d).slice(0, 3)
  for (const f of big) { const t = furnTypeOf(f.kind); labelPts.push({ name: f.name || t.label.replace(/\s*\(.*$/, ''), p: new THREE.Vector3(f.x, zf + (f.z ?? t.z ?? 0) + f.h, f.y), lib: f.name || t.label.replace(/\s*\(.*$/, ''), libCol: finishOf(f.finish)?.color ?? t.color, kind: 'furn' }) }
  // tường phía sau: điểm chú thích gần nhất người nhìn xa nhất
  farCand.sort((a, b) => a.dot - b.dot)
  if (farCand[0]) labelPts.push({ name: 'Tường', mat: wm, p: new THREE.Vector3(farCand[0].x, farCand[0].z, farCand[0].y), lib: 'Tường hoàn thiện', libCol: wallCol, kind: 'wall' })

  // camera isometric
  const el = Math.atan(1 / Math.sqrt(2)), dist = 60
  const cam = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 500)
  cam.position.set(c0[0] + Math.cos(el) * cx * dist, zf + Math.sin(el) * dist, c0[1] + Math.cos(el) * cy * dist); cam.lookAt(c0[0], zf + 1.0, c0[1]); cam.updateMatrixWorld()
  const inv = cam.matrixWorldInverse
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9
  for (const x of [bx0 - E, bx1 + E]) for (const y of [by0 - E, by1 + E]) for (const z of [zf - 0.15, zc]) { const v = new THREE.Vector3(x, z, y).applyMatrix4(inv); mnx = Math.min(mnx, v.x); mxx = Math.max(mxx, v.x); mny = Math.min(mny, v.y); mxy = Math.max(mxy, v.y) }
  const pad = 0.08 * Math.max(mxx - mnx, mxy - mny), aspect = W / H
  let hw = (mxx - mnx) / 2 + pad, hh = (mxy - mny) / 2 + pad; if (hw / hh < aspect) hw = hh * aspect; else hh = hw / aspect
  const mcx = (mnx + mxx) / 2, mcy = (mny + mxy) / 2
  cam.left = mcx - hw; cam.right = mcx + hw; cam.top = mcy + hh; cam.bottom = mcy - hh; cam.updateProjectionMatrix()
  r.render(scene, cam)
  const url = r.domElement.toDataURL('image/png')
  const labels: IsoLabel[] = labelPts.map((l, i) => { const v = l.p.clone().project(cam); return { n: i + 1, name: l.mat?.name ?? l.lib, color: l.mat?.color ?? l.libCol, code: l.mat?.code, src: l.mat ? 'catalog' as const : 'lib' as const, note: l.mat && !l.mat.full && l.kind !== 'furn' ? 'danh mục chưa khai đủ cấu tạo lớp' : l.mat?.layers?.length ? l.mat.layers.join(' + ') : undefined, x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H } })
  scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose() })
  r.dispose(); r.forceContextLoss()
  return { url, w: W, h: H, labels }
}
