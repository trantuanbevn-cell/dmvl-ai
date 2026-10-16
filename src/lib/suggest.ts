// Vật Liệu Đề Xuất: so khớp ảnh crop trong phối cảnh với map vật liệu trong thư viện (hoàn toàn bằng phần mềm, không dùng AI).
import { supabase } from './supabase'
import { cropCanvas, loadImage, clampBox } from './crop'
import { normSizes, type Mat, type Var } from '../pages/Library'
import { kindOfGroup, applyPicks, type Pick } from './suggestApply'
import { windowsOf, descOfWindow, combineDesc, sim2, FEAT_N, FEAT_LEN } from './matchFeat'
import { patScore, validPat, type Pat } from './patMatch'
import type { Entry, Occurrence, Page, Project, Room } from './types'

/** Ngưỡng tối thiểu tuyệt đối; ngoài ra chỉ giữ mẫu cách mẫu tốt nhất ≤ SUGGEST_BAND (so khớp theo hạng, không theo ngưỡng cố định) */
export const SUGGEST_MIN = 0.6
/** Tự điền vào bảng vật liệu chỉ khi khớp trên 95%; dưới đó để trống cho người làm tự tìm */
export const AUTO_MIN = 0.95
export const SUGGEST_BAND = 0.12
export type Feat = number[]   // [L,a,b, sdL,sda,sdb, edge, 8 ô histogram sáng]

function lab(r: number, g: number, b: number): [number, number, number] {
  const f = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  const R = f(r), G = f(g), B = f(b)
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const t = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116)
  return [116 * t(Y) - 16, 500 * (t(X) - t(Y)), 200 * (t(Y) - t(Z))]
}

/** Đặc trưng màu + độ nhám bề mặt của phần giữa ảnh (bỏ viền) */
export function featOf(src: CanvasImageSource, sw: number, sh: number): Feat {
  const N = 40, c = document.createElement('canvas'); c.width = N; c.height = N
  const x = c.getContext('2d', { willReadFrequently: true })!
  const m = 0.12; x.drawImage(src, sw * m, sh * m, sw * (1 - 2 * m), sh * (1 - 2 * m), 0, 0, N, N)
  const px = x.getImageData(0, 0, N, N).data, n = N * N
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n)
  for (let i = 0; i < n; i++) { const v = lab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]); L[i] = v[0]; A[i] = v[1]; B[i] = v[2] }
  const mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / n
  const sd = (a: Float32Array, mu: number) => Math.sqrt(a.reduce((s, v) => s + (v - mu) ** 2, 0) / n)
  const mL = mean(L), mA = mean(A), mB = mean(B)
  let edge = 0; for (let y = 0; y < N; y++) for (let xx = 0; xx < N - 1; xx++) edge += Math.abs(L[y * N + xx] - L[y * N + xx + 1]); edge /= n
  const h = new Array(8).fill(0); for (let i = 0; i < n; i++) h[Math.min(7, Math.floor(L[i] / 12.5))] += 1 / n
  const r = (v: number) => Math.round(v * 100) / 100
  return [mL, mA, mB, sd(L, mL), sd(A, mA), sd(B, mB), edge, ...h].map(r)
}

/** Độ trùng khớp 0..1 */
export function similarity(a: Feat, b: Feat): number {
  const dE = Math.hypot(0.4 * (a[0] - b[0]), a[1] - b[1], a[2] - b[2])
  const col = Math.max(0, 1 - dE / 45)
  const sdv = Math.max(0, 1 - Math.hypot(a[3] - b[3], a[4] - b[4], a[5] - b[5]) / 25)
  const edg = Math.max(0, 1 - Math.abs(a[6] - b[6]) / 10)
  let hi = 0; for (let i = 0; i < 8; i++) hi += Math.min(a[7 + i], b[7 + i])
  return 0.65 * col + 0.1 * sdv + 0.1 * edg + 0.15 * hi
}

/** Đặc trưng v2: màu + VÂN (hướng, tỷ lệ chi tiết) trên các cửa sổ giữ đúng tỉ lệ ảnh; margin = phần viền bỏ đi (vùng khoanh có cạnh tấm/bóng) */
export function featOf2(src: CanvasImageSource, sw: number, sh: number, margin: number): number[] {
  const mx = sw * margin, my = sh * margin, w = sw - 2 * mx, h = sh - 2 * my
  const c = document.createElement('canvas'); c.width = FEAT_N; c.height = FEAT_N
  const x = c.getContext('2d', { willReadFrequently: true })!
  const ds = windowsOf(w, h).map(([ox, oy, s]) => { x.drawImage(src, mx + ox, my + oy, s, s, 0, 0, FEAT_N, FEAT_N); return descOfWindow(x.getImageData(0, 0, FEAT_N, FEAT_N).data) })
  return combineDesc(ds)
}
export type QFeat = { f1: Feat; f2: number[] }
export type FMat = Mat & { feat: Feat; feat2?: number[] | null; pat?: Pat | null }
let cache: FMat[] | null = null
export async function loadFeatMats(force = false): Promise<FMat[]> {
  if (cache && !force) return cache
  const out: FMat[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('materials').select('id,brand,product_code,name,line,kind,url,image_url,tex_url,attrs,feat,feat2,pat').not('tex_url', 'is', null).order('id').range(from, from + 999)
    if (error) throw error
    out.push(...((data ?? []) as FMat[]).filter(m => m.feat?.length || m.feat2?.length === FEAT_LEN))
    if (!data || data.length < 1000) break
  }
  return (cache = out)
}

/** Đặc trưng của 1 vị trí trong ảnh phối cảnh (bbox 0..1 trên ảnh trang) */
export async function bboxFeat(url: string, bbox: number[]): Promise<QFeat> {
  const c = await cropCanvas(url, clampBox(bbox), 256)
  return { f1: featOf(c, c.width, c.height), f2: featOf2(c, c.width, c.height, 0.15) }
}
/** Ảnh vùng khoanh (bỏ viền 8%) gửi cho AI so vân */
export async function bboxQueryCanvas(url: string, bbox: number[]): Promise<HTMLCanvasElement> {
  const [x, y, w, h] = clampBox(bbox), m = 0.08
  return cropCanvas(url, [x + w * m, y + h * m, w * (1 - 2 * m), h * (1 - 2 * m)], 512)
}

export type Cand = { m: FMat; score: number }
/** Xếp hạng theo HỒ SƠ VÂN (AI đã đọc 1 lần): vân là chính; cộng chút điểm bề mặt cơ học để phân định các mẫu cùng vân */
export function rankByPat(q: Pat, f2: number[] | null, mats: FMat[], groupCode?: string | null, n = 24): Cand[] {
  const k = kindOfGroup(groupCode)
  return mats.filter(m => validPat(m.pat)).map(m => {
    const num = f2 && m.feat2?.length === FEAT_LEN ? sim2(f2, m.feat2).score : 0.5
    return { m, score: Math.min(1, 0.72 * patScore(q, m.pat!) + 0.26 * num + (k && m.kind === k ? 0.02 : 0)) }
  }).sort((a, b) => b.score - a.score).slice(0, n)
}
export const taggedCount = (mats: FMat[]) => mats.reduce((s, m) => s + (validPat(m.pat) ? 1 : 0), 0)
/** Danh sách ứng viên RỘNG cho AI so vân: top theo điểm bề mặt + top theo gần màu (để không sót mẫu vân đúng nhưng điểm cơ học thấp) */
export function shortlist(q: QFeat, mats: FMat[], groupCode?: string | null, n = 200): FMat[] {
  const k = kindOfGroup(groupCode)
  const sc = mats.map(m => {
    const has = m.feat2?.length === FEAT_LEN
    const s = has ? sim2(q.f2, m.feat2!).score : m.feat?.length ? similarity(q.f1, m.feat) * 0.9 : 0
    const dab = has ? Math.hypot(q.f2[1] - m.feat2![1], q.f2[2] - m.feat2![2]) : 99
    return { m, s: s + (k && m.kind === k ? 0.03 : 0), dab }
  })
  const a = [...sc].sort((x, y) => y.s - x.s).slice(0, Math.round(n * 0.7))
  const seen = new Set(a.map(x => x.m.id))
  const b = [...sc].filter(x => !seen.has(x.m.id)).sort((x, y) => x.dab - y.dab).slice(0, n - a.length)
  return [...a, ...b].map(x => x.m)
}
/** Xếp hạng TOÀN thư viện theo độ giống bề mặt (màu + vân). Nhóm vật liệu chỉ cộng nhẹ điểm ưu tiên, không loại mẫu khác nhóm. */
export function rank(q: QFeat, mats: FMat[], groupCode?: string | null, min = SUGGEST_MIN): Cand[] {
  const k = kindOfGroup(groupCode)
  const all = mats.map(m => {
    const s = m.feat2?.length === FEAT_LEN ? sim2(q.f2, m.feat2).score : m.feat?.length ? similarity(q.f1, m.feat) * 0.9 : 0
    return { m, score: Math.min(1, s + (k && m.kind === k ? 0.03 : 0)) }
  }).filter(c => c.score >= min).sort((a, b) => b.score - a.score)
  if (!all.length) return []
  return all.filter(c => c.score >= all[0].score - SUGGEST_BAND).slice(0, 24)
}

/** Admin: tính đặc trưng cho các mã thư viện chưa có (tiếp tục được nếu dừng giữa chừng) */
export async function backfillFeats(onProgress: (done: number, total: number) => void, stop: () => boolean): Promise<number> {
  const { count } = await supabase.from('materials').select('id', { count: 'exact', head: true }).is('feat2', null).not('tex_url', 'is', null)
  const total = count ?? 0; let done = 0
  while (!stop()) {
    const { data, error } = await supabase.from('materials').select('id,tex_url,feat').is('feat2', null).not('tex_url', 'is', null).limit(120)
    if (error) throw error
    if (!data?.length) break
    let i = 0
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (i < data.length && !stop()) {
        const r = data[i++]
        let feat: Feat | null = (r as any).feat ?? null, feat2: number[] = []
        try { const im = await loadImage(r.tex_url!); if (!feat?.length) feat = featOf(im, im.naturalWidth, im.naturalHeight); feat2 = featOf2(im, im.naturalWidth, im.naturalHeight, 0.04) } catch { /* ảnh lỗi → [] để khỏi lặp lại */ }
        await supabase.from('materials').update({ feat: feat ?? [], feat2 }).eq('id', r.id)
        done++; if (done % 10 === 0) onProgress(done, total)
      }
    }))
    onProgress(done, total)
  }
  cache = null
  return done
}

/** Chọn biến thể khi mẫu chỉ có đúng 1 kích thước; nhiều kích thước thì để người làm chọn */
export async function singleVariant(m: Mat): Promise<Var | null> {
  const { data } = await supabase.from('materials').select('variants,attrs').eq('id', m.id).single()
  const vs = ((data as any)?.variants ?? []) as Var[]
  if (vs.length === 1) return vs[0]
  if (!vs.length) { const s = normSizes((data as any)?.attrs?.sizes); if (s.length === 1) return { sub: '', size: s[0], th: '' } }
  return null
}

/** Lần quét phối cảnh đầu: mã chưa có hãng/mã → tự chọn mẫu thư viện khớp nhất (≥ ngưỡng) làm mặc định */
export async function autoPickRoom(project: Project, room: Room, urlOf: (p: Page) => Promise<string>, log: (s: string) => void): Promise<number> {
  log('  Đang đối chiếu thư viện vật liệu…'); await ensureFeats((a, b) => log(`  Phân tích ảnh thư viện ${a}/${b}…`))
  const mats = await loadFeatMats(true); if (!mats.length) return 0
  const [{ data: occ }, { data: ents }, { data: pgs }] = await Promise.all([
    supabase.from('occurrences').select('*').eq('room_id', room.id).not('bbox', 'is', null).not('page_id', 'is', null),
    supabase.from('entries').select('*').eq('project_id', project.id),
    supabase.from('pages').select('*').eq('project_id', project.id),
  ])
  const E = new Map(((ents ?? []) as Entry[]).map(e => [e.id, e])), P = new Map(((pgs ?? []) as Page[]).map(p => [p.id, p]))
  const done = new Set<string>(); let n = 0
  for (const o of (occ ?? []) as Occurrence[]) {
    const e = E.get(o.entry_id), pg = o.page_id ? P.get(o.page_id) : undefined
    if (!e || !pg || done.has(e.id) || e.product_code || e.brand || e.source === 'inferred') continue
    done.add(e.id)
    try {
      const best = rank(await bboxFeat(await urlOf(pg), o.bbox!), mats, e.group_code, AUTO_MIN)[0]
      const ek = kindOfGroup(e.group_code)
      if (!best || best.score < AUTO_MIN || (ek && best.m.kind && ek !== best.m.kind)) continue
      await applyPicks(e, [{ m: best.m, v: await singleVariant(best.m) } as Pick], false); n++
    } catch { /* bỏ qua mục lỗi ảnh */ }
  }
  if (n) log(`  ${room.code} – tự chọn ${n} mẫu thư viện khớp trên 95%`)
  return n
}

/** Tự động phân tích ảnh các mã thư viện còn thiếu (miễn phí, chạy ngầm; chỉ admin ghi được). Gọi nhiều lần vẫn chỉ chạy một lần. */
let running: Promise<number> | null = null
export function ensureFeats(onProgress?: (done: number, total: number) => void): Promise<number> {
  if (!running) running = backfillFeats((a, b) => onProgress?.(a, b), () => false).catch(() => 0).finally(() => { running = null })
  return running
}
