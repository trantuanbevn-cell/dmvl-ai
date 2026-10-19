// Dựng 3D một món nội thất theo loại: cao đúng chiều cao tiêu chuẩn (không phải chiều cao tường).
import * as THREE from 'three'
import { furnTypeOf } from './furn'
import type { Furn } from './model'

const LEGGED = new Set(['chair', 'stool', 'table', 'tableRound', 'desk', 'coffee', 'side'])
/** Nhóm mesh nằm sẵn đúng chỗ: tâm ở (f.x, 0, f.y), xoay theo f.ang. Trục cục bộ: x = w, z = d; lưng tựa ở phía -z (đổi phía bằng flip). */
export function buildFurn(f: Furn, color?: string): THREE.Group {
  const t = furnTypeOf(f.kind), g = new THREE.Group(), col = color ?? t.color
  const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.75 }), dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(col).multiplyScalar(0.7), roughness: 0.8 })
  const h = Math.max(0.05, f.h), w = f.w, d = f.d
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o }
  const box = (bw: number, bh: number, bd: number, x: number, y0: number, z: number, m = mat) => add(new THREE.BoxGeometry(bw, bh, bd), m, x, y0 + bh / 2, z)
  if (t.shape === 'round') {
    const cyl = (r: number, hh: number, y0: number, m: THREE.Material) => { const o = add(new THREE.CylinderGeometry(0.5, 0.5, hh, 28), m, 0, y0 + hh / 2, 0); o.scale.set(w, 1, d); return o }
    if (LEGGED.has(f.kind)) { cyl(1, 0.05, h - 0.05, mat); const o = add(new THREE.CylinderGeometry(0.5, 0.5, h - 0.05, 12), dark, 0, (h - 0.05) / 2, 0); o.scale.set(Math.min(0.08 / 1, w * 0.2) / 1 || 0.08, 1, Math.min(0.08, d * 0.2)) }
    else cyl(1, h, 0, mat)
  } else if (LEGGED.has(f.kind)) {
    const top = f.kind === 'chair' || f.kind === 'stool' ? 0.06 : 0.04, lg = Math.min(0.05, w / 6, d / 6)
    box(w, top, d, 0, h - top, 0)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(lg, h - top, lg, sx * (w / 2 - lg / 2 - 0.02), 0, sz * (d / 2 - lg / 2 - 0.02), dark)
  } else if (f.kind === 'group' || f.kind === 'stage') {
    box(w, h, d, 0, 0, 0)
  } else {
    box(w, h, d, 0, 0, 0)
  }
  if (t.back && t.back > h + 0.02 && t.shape !== 'round') { // lưng tựa / đầu giường / két nước dọc một cạnh dài của khối
    const bt = Math.min(t.backT ?? 0.1, d * 0.5), bh = t.back - h
    box(w, bh, bt, 0, h, -(d / 2 - bt / 2), f.kind === 'chair' ? mat : dark)
    if (f.kind === 'sofa' || f.kind === 'armchair') for (const sx of [-1, 1]) box(Math.min(0.15, w * 0.1), 0.2, d - bt, sx * (w / 2 - Math.min(0.15, w * 0.1) / 2), h, bt / 2, dark) // tay vịn
  }
  g.position.set(f.x, 0, f.y); g.rotation.y = -f.ang; if (f.flip) g.scale.z = -1
  return g
}
