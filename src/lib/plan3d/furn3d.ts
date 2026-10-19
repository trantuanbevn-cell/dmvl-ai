// Dựng 3D đơn giản nhưng ĐÚNG KIỂU từng loại nội thất (ghế có mặt ngồi + lưng + chân, bàn có mặt + chân, sofa có đệm + lưng + tay vịn, tủ khối đặc, giường có đệm + đầu giường + gối,
// bồn cầu, tiểu, lavabo, thang máy, thang bộ có bậc), cao đúng chiều cao tiêu chuẩn của loại – không bao giờ cao bằng tường.
import * as THREE from 'three'
import { furnTypeOf } from './furn'
import type { Furn } from './model'

const LEGGED = new Set(['chair', 'stool', 'table', 'tableRound', 'desk', 'coffee', 'side'])
/** Nhóm mesh: tâm ở (f.x, 0, f.y), xoay theo f.ang. Trục cục bộ: x = w, z = d; lưng tựa / mặt trước ở phía -z (đổi phía bằng flip). */
export function buildFurn(f: Furn, color?: string): THREE.Group {
  const t = furnTypeOf(f.kind), g = new THREE.Group(), col = color ?? t.color
  const M = (c: THREE.ColorRepresentation, rough = 0.75, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal })
  const mat = M(col), dark = M(new THREE.Color(col).multiplyScalar(0.7)), white = M('#f2f2ef', 0.35), steel = M('#b9bdc2', 0.35, 0.6), black = M('#2b2b2d', 0.6)
  const h = Math.max(0.05, f.h), w = f.w, d = f.d
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o }
  const box = (bw: number, bh: number, bd: number, x: number, y0: number, z: number, m: THREE.Material = mat) => add(new THREE.BoxGeometry(bw, bh, bd), m, x, y0 + bh / 2, z)
  const cyl = (rx: number, rz: number, hh: number, x: number, y0: number, z: number, m: THREE.Material, seg = 28) => { const o = add(new THREE.CylinderGeometry(1, 1, hh, seg), m, x, y0 + hh / 2, z); o.scale.set(rx, 1, rz); return o }
  const front = -(d / 2) // phía -z

  switch (f.kind) {
    case 'wc': { // két nước ở sau (phía +z), bệ ôm quanh phía trước
      const tank = Math.min(0.2, d * 0.35)
      box(w * 0.55, f.h * 2, tank, 0, 0, d / 2 - tank / 2, white)            // két nước cao 0.8
      cyl((w - tank) / 2, (d - tank) / 2, f.h - 0.08, 0, 0, -tank / 2, white) // bệ
      cyl((w - tank) / 2 * 0.85, (d - tank) / 2 * 0.85, 0.03, 0, f.h - 0.04, -tank / 2, black)
      break }
    case 'urinal': { box(w, 0.55, d * 0.5, 0, 0.45, d / 4, white); cyl(w / 2, d / 2, 0.55, 0, 0.45, 0, white, 20).scale.z = d / 2; box(w * 0.4, 0.4, 0.04, 0, 1.0, d / 2 - 0.02, steel); break }
    case 'basin': { box(w * 0.3, 0.75, d * 0.3, 0, 0, d / 4, white); box(w, 0.15, d, 0, h - 0.15, 0, white); cyl(w * 0.35, d * 0.35, 0.02, 0, h - 0.005, 0, black); break }
    case 'vanity': { // bàn đá + chân tủ + chậu âm cách đều 0.6 m + vòi
      box(w, h - 0.04, d * 0.92, 0, 0, 0, dark); box(w, 0.04, d, 0, h - 0.04, 0, M('#e9e6df', 0.3))
      const n = Math.max(1, Math.round(w / 0.7)); for (let i = 0; i < n; i++) { const x = -w / 2 + (w * (i + 0.5)) / n; cyl(Math.min(0.22, w / n / 2.6), 0.17, 0.012, x, h + 0.001, 0, white); box(0.025, 0.12, 0.025, x, h, d / 2 - 0.1, steel) }
      break }
    case 'bath': { box(w, h, d, 0, 0, 0, white); box(w * 0.88, 0.02, d * 0.78, 0, h - 0.005, 0, M('#cfd8dc', 0.2)); break }
    case 'bed': { // đệm + khung + đầu giường + 2 gối
      box(w, 0.25, d, 0, 0, 0, dark); box(w * 0.98, h - 0.25, d * 0.98, 0, 0.25, 0.01, M('#e8e2d6', 0.9))
      const back = (f.h ? furnTypeOf('bed').back ?? 1.0 : 1.0); box(w, back, 0.08, 0, 0, front + 0.04, dark)
      for (const sx of [-1, 1]) box(w * 0.4, 0.12, 0.35, sx * w * 0.24, h, front + 0.3, M('#fbfaf6', 0.9)); break }
    case 'sofa': case 'armchair': {
      const arm = Math.min(0.18, w * 0.1), back = t.back ?? 0.85, bt = Math.min(t.backT ?? 0.2, d * 0.4), base = h * 0.45
      box(w, base, d, 0, 0, 0, dark)                                            // khung chân
      box(w - 2 * arm, h - base, d - bt, 0, base, bt / 2, mat)                  // đệm ngồi
      box(w, back - base, bt, 0, base, front + bt / 2, mat)                     // lưng
      for (const sx of [-1, 1]) box(arm, Math.min(back, h + 0.25) - base, d, sx * (w / 2 - arm / 2), base, 0, mat) // tay vịn
      if (f.kind === 'sofa' && w > 1.6) { const n = Math.round(w / 0.8); for (let i = 1; i < n; i++) box(0.01, 0.01, d - bt, -w / 2 + (w * i) / n, h, bt / 2, dark) }
      break }
    case 'lift': { // thân hộp + 2 cánh cửa thép ở mặt trước (-z)
      box(w, h, d, 0, 0, 0, M('#d4d6d9', 0.7)); const dw = Math.min(1.1, w * 0.6) / 2
      for (const sx of [-1, 1]) box(dw, 2.1, 0.04, sx * dw / 2, 0, front - 0.02, steel)
      box(w, 0.25, 0.05, 0, 2.1, front - 0.025, dark); break }
    case 'stair': { // bậc thang cao 170, chạy dọc trục w, thấp ở phía -x, cao dần đến h
      const n = Math.max(3, Math.round(h / 0.17)), tread = w / n, rise = h / n
      for (let i = 0; i < n; i++) box(tread, rise * (i + 1), d, -w / 2 + tread * (i + 0.5), 0, 0, i % 2 ? mat : dark)
      break }
    case 'spiral': { // thang xoắn: lõi trụ thép + các bậc hình quạt xoay dần, cao 170/bậc
      const R = Math.max(w, d) / 2, n = Math.max(8, Math.round(h / 0.17))
      cyl(0.08, 0.08, h, 0, 0, 0, steel, 12)
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 * Math.min(1.25, n / 14), step = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.04, 8, 1, false, 0, Math.PI / 5), i % 2 ? mat : dark); step.position.set(0, 0.17 * (i + 1) - 0.04 / 2, 0); step.rotation.y = a; g.add(step) }
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.9, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#b9bdc2', transparent: true, opacity: 0.15, side: THREE.DoubleSide })); rail.position.y = 0.45 + h / 2; g.add(rail); break }
    case 'counter': case 'kitchen': case 'cabinet': case 'tv': case 'wardrobe': case 'shelf': case 'fridge': {
      box(w, h, d, 0, 0, 0, mat)
      if (f.kind === 'wardrobe' || f.kind === 'fridge') box(w * 0.015, h * 0.5, 0.02, w * 0.04, h * 0.2, front - 0.01, black) // tay nắm
      if (f.kind === 'kitchen' || f.kind === 'counter') box(w, 0.04, d * 1.02, 0, h, 0, M('#e9e6df', 0.3))                       // mặt đá
      if (f.kind === 'shelf') for (let i = 1; i < 5; i++) box(w * 1.0, 0.012, d * 1.02, 0, (h * i) / 5, 0, dark)
      break }
    case 'shower': { box(w, 0.06, d, 0, 0, 0, white); const gl = M('#bfe3ee', 0.1); (gl as THREE.MeshStandardMaterial).transparent = true; (gl as THREE.MeshStandardMaterial).opacity = 0.35
      box(w, h - 0.06, 0.012, 0, 0.06, front + 0.006, gl); box(0.012, h - 0.06, d, -w / 2 + 0.006, 0.06, 0, gl); cyl(0.06, 0.06, 0.02, 0, h - 0.02, d / 2 - 0.15, steel, 16); break }
    case 'mirror': { box(w, h, d, 0, 0, 0, M('#cfe3ea', 0.05, 0.8)); break }
    case 'wcab': case 'wcabLow': case 'wcabTop': case 'wcounter': case 'dresser': case 'island': case 'sinkK': {
      box(w, h, d, 0, 0, 0, mat); const n = Math.max(1, Math.round(w / 0.6))
      for (let i = 1; i < n; i++) box(0.008, h * 0.96, 0.01, -w / 2 + (w * i) / n, h * 0.02, front - 0.004, dark)
      if (f.kind === 'wcounter' || f.kind === 'island' || f.kind === 'sinkK' || f.kind === 'dresser') box(w, 0.04, d * 1.02, 0, h, 0, M('#e9e6df', 0.3))
      if (f.kind === 'sinkK') box(w * 0.45, 0.012, d * 0.55, 0, h + 0.04, 0, steel)
      break }
    case 'plant': { cyl(w * 0.35, d * 0.35, 0.35, 0, 0, 0, dark); cyl(w * 0.55, d * 0.55, h - 0.35, 0, 0.35, 0, M('#6b8f5e', 0.9), 10); break }
    case 'stage': case 'group': box(w, h, d, 0, 0, 0, mat); break
    default: {
      if (t.shape === 'round') {
        if (LEGGED.has(f.kind)) { cyl(w / 2, d / 2, 0.05, 0, h - 0.05, 0, mat); cyl(Math.min(0.05, w / 6), Math.min(0.05, d / 6), h - 0.05, 0, 0, 0, dark, 10) }
        else cyl(w / 2, d / 2, h, 0, 0, 0, mat)
      } else if (LEGGED.has(f.kind)) {
        const top = f.kind === 'chair' || f.kind === 'stool' ? 0.06 : 0.04, lg = Math.min(0.05, w / 6, d / 6)
        box(w, top, d, 0, h - top, 0, mat)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(lg, h - top, lg, sx * (w / 2 - lg / 2 - 0.02), 0, sz * (d / 2 - lg / 2 - 0.02), dark)
        if (t.back && t.back > h) box(w, t.back - h, Math.min(t.backT ?? 0.06, d * 0.4), 0, h, front + Math.min(t.backT ?? 0.06, d * 0.4) / 2, mat) // lưng ghế
      } else box(w, h, d, 0, 0, 0, mat)
    }
  }
  g.position.set(f.x, f.z ?? t.z ?? 0, f.y); g.rotation.y = -f.ang; if (f.flip) g.scale.z = -1
  return g
}
