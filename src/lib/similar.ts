// Tìm vật liệu đã có mã giống với vật liệu đang định thêm (chống 1 vật liệu có 2 mã). Phần mềm tự so, không dùng AI.
import type { Entry } from './types'
import { deltaE } from './library'

export const norm = (s?: string | null) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9\s]/g, ' ')
const STOP = new Set(['va', 'co', 'cho', 'cua', 'voi', 'mau', 'loai', 'the', 'and', 'with', 'for', 'of', 'a', 'mm', 'cm', 'm2'])
const toks = (s: string) => new Set(norm(s).split(/\s+/).filter(t => t.length > 1 && !STOP.has(t)))

export type Probe = { group: string; name: string; material?: string; color?: string | null; brand?: string; product_code?: string }
export type Similar = { entry: Entry; score: number; dE: number | null; why: string[] }

export function findSimilar(entries: Entry[], p: Probe, limit = 5): Similar[] {
  const a = toks(`${p.name} ${p.material ?? ''}`)
  if (!a.size && !p.product_code) return []
  const out: Similar[] = []
  for (const e of entries) {
    if (e.status === 'rejected') continue
    const why: string[] = []
    let score = 0
    if (p.product_code && e.product_code && norm(p.product_code).replace(/\s/g, '') === norm(e.product_code).replace(/\s/g, '') && (!p.brand || !e.brand || norm(p.brand) === norm(e.brand))) { score = 1; why.push('trùng mã sản phẩm') }
    const b = toks(`${e.name_vn} ${e.material_vn ?? ''}`)
    let inter = 0; for (const t of a) if (b.has(t)) inter++
    const jac = a.size && b.size ? inter / (a.size + b.size - inter) : 0
    const nameA = toks(p.name), nameB = toks(e.name_vn)
    let ni = 0; for (const t of nameA) if (nameB.has(t)) ni++
    const nameSim = nameA.size && nameB.size ? ni / Math.min(nameA.size, nameB.size) : 0
    let s = Math.max(jac, nameSim * 0.8)
    if (e.group_code === p.group) s += 0.12; else s *= 0.6
    const dE = deltaE(p.color, e.color_hex)
    if (dE != null) { if (dE < 10) { s += 0.2; why.push('màu rất gần') } else if (dE > 30) s *= 0.55 }
    if (s > score) score = s
    if (nameSim >= 0.8 && e.group_code === p.group) why.push('tên gần giống')
    else if (jac >= 0.4) why.push('vật liệu mô tả giống')
    if (score >= 0.4) out.push({ entry: e, score: Math.min(score, 1), dE, why })
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit)
}
