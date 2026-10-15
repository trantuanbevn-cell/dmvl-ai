// TỰ SỬA bản dựng theo chỗ AI nghi sai: chỉ làm bằng phần mềm (không AI). Với mỗi khung đỏ "thiếu tường/vách · bị gộp · cửa lơ lửng", tìm nét tường dài thẳng trong bản vẽ gốc
// mà bản dựng chưa có, rồi CHỈ nhận nét nào thật sự cắt một không gian thành hai phần ≥ 3 m² (vách ngăn đúng nghĩa); nét đồ nội thất/ký hiệu không cắt được gì nên bị loại.
import { loadCv } from './cv'
import type { PlanResult } from './planRead'
import type { PlanIssue } from './planAi'

const WALL_KINDS = new Set(['merged', 'missing_wall', 'floating_door', 'bad_split'])
export type FixReport = { segs: number[][]; tried: number; accepted: number; boxes: number }

export async function findWallFixes(res: PlanResult, orig: HTMLCanvasElement, issues: PlanIssue[], onLog: (s: string) => void = () => {}): Promise<FixReport> {
  const cv = await loadCv()
  const { W, H, ppp, mpp, lab, wall } = res, PT = 1 / mpp, m2 = (mpp / ppp) ** 2
  const boxes = issues.filter(i => WALL_KINDS.has(i.kind))
  const og = orig.getContext('2d')!
  const accepted: number[][] = [], rep: FixReport = { segs: accepted, tried: 0, accepted: 0, boxes: boxes.length }
  const thin = Math.max(3, Math.round(0.07 * PT * ppp))
  const minLen = 1.0 * PT * ppp
  const room = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? lab[y * W + x] : 0)
  const done = new Set<string>()
  for (let bi = 0; bi < boxes.length; bi++) {
    const b = boxes[bi].box, mg = Math.round(0.5 * PT * ppp)
    const x0 = Math.max(0, Math.floor(b[0] - mg)), y0 = Math.max(0, Math.floor(b[1] - mg)), x1 = Math.min(W, Math.ceil(b[2] + mg)), y1 = Math.min(H, Math.ceil(b[3] + mg))
    const w = x1 - x0, h = y1 - y0; if (w < 20 || h < 20) continue
    onLog(`Tự sửa: khung ${bi + 1}/${boxes.length}…`)
    const im = og.getImageData(x0, y0, w, h).data, dark = new Uint8Array(w * h)
    const k = Math.max(2, Math.round(0.3 * PT * ppp))
    // tường đã có (giãn ra) → bỏ khỏi nét tối của bản gốc
    const wm = new cv.Mat(h, w, cv.CV_8UC1), dk = new cv.Mat(h, w, cv.CV_8UC1)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { wm.data[y * w + x] = wall[(y + y0) * W + x + x0] ? 255 : 0; const o = (y * w + x) * 4; dk.data[y * w + x] = (im[o] + im[o + 1] + im[o + 2]) / 3 < 150 ? 255 : 0 }
    const wd = new cv.Mat(); cv.dilate(wm, wd, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k)))
    for (let i = 0; i < w * h; i++) if (wd.data[i]) dk.data[i] = 0
    const lines = new cv.Mat(); cv.HoughLinesP(dk, lines, 1, Math.PI / 180, Math.round(minLen * 0.3), Math.round(minLen * 0.8), Math.round(0.4 * PT * ppp))
    const cand: number[][] = []
    for (let i = 0; i < lines.rows * lines.cols; i++) { const l = lines.data32S.slice(i * 4, i * 4 + 4); cand.push([l[0] + x0, l[1] + y0, l[2] + x0, l[3] + y0]) }
    for (const m of [wm, dk, wd, lines]) m.delete()
    // gộp các đoạn gần như cùng đường thẳng (nét tường bị đứt khúc) thành đoạn dài
    { let merged = true; const gap = 0.5 * PT * ppp
      while (merged) {
        merged = false
        for (let i = 0; i < cand.length && !merged; i++) for (let j = i + 1; j < cand.length && !merged; j++) {
          const a = cand[i], b = cand[j], la = Math.hypot(a[2] - a[0], a[3] - a[1]), ux = (a[2] - a[0]) / la, uy = (a[3] - a[1]) / la
          const lb = Math.hypot(b[2] - b[0], b[3] - b[1]); if (Math.abs(ux * (b[2] - b[0]) / lb + uy * (b[3] - b[1]) / lb) < 0.9985) continue
          const dist = (x: number, y: number) => Math.abs((x - a[0]) * -uy + (y - a[1]) * ux)
          if (dist(b[0], b[1]) > 4 || dist(b[2], b[3]) > 4) continue
          const t = (x: number, y: number) => (x - a[0]) * ux + (y - a[1]) * uy, ta = [0, la], tb = [t(b[0], b[1]), t(b[2], b[3])].sort((p, q) => p - q)
          if (tb[0] > ta[1] + gap || tb[1] < ta[0] - gap) continue
          const lo = Math.min(ta[0], tb[0]), hi = Math.max(ta[1], tb[1])
          cand[i] = [a[0] + ux * lo, a[1] + uy * lo, a[0] + ux * hi, a[1] + uy * hi]; cand.splice(j, 1); merged = true
        }
      } }
    cand.sort((p, q) => Math.hypot(q[2] - q[0], q[3] - q[1]) - Math.hypot(p[2] - p[0], p[3] - p[1]))
    for (const c of cand.slice(0, 40)) {
      const key = c.map(v => Math.round(v / 6)).join(','); if (done.has(key)) continue; done.add(key)
      rep.tried++
      const L = Math.hypot(c[2] - c[0], c[3] - c[1]), ux = (c[2] - c[0]) / L, uy = (c[3] - c[1]) / L, ex = 0.2 * PT * ppp
      const A = [c[0] - ux * ex, c[1] - uy * ex], B = [c[2] + ux * ex, c[3] + uy * ex]
      // không gian bị cắt = nhãn phổ biến nhất dọc theo nét
      const cnt = new Map<number, number>()
      for (let t = 0; t <= 1; t += 0.05) { const id = room(Math.round(A[0] + (B[0] - A[0]) * t), Math.round(A[1] + (B[1] - A[1]) * t)); if (id) cnt.set(id, (cnt.get(id) ?? 0) + 1) }
      let id = 0, best = 0; cnt.forEach((n, i2) => { if (n > best) { best = n; id = i2 } }); if (!id || best < 5) continue
      const r = res.rooms[id - 1]; if (!r) continue
      const rx0 = Math.max(0, Math.floor(r.x * ppp) - 8), ry0 = Math.max(0, Math.floor(r.y * ppp) - 8), rw = Math.min(W - rx0, Math.ceil(r.w * ppp) + 16), rh = Math.min(H - ry0, Math.ceil(r.h * ppp) + 16)
      const count = (extra: number[][]) => {
        const mk = new cv.Mat(rh, rw, cv.CV_8UC1)
        for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) mk.data[y * rw + x] = lab[(y + ry0) * W + x + rx0] === id ? 255 : 0
        for (const s of extra) cv.line(mk, new cv.Point(Math.round(s[0] - rx0), Math.round(s[1] - ry0)), new cv.Point(Math.round(s[2] - rx0), Math.round(s[3] - ry0)), new cv.Scalar(0), thin)
        const l2 = new cv.Mat(), st = new cv.Mat(), ce = new cv.Mat(), n = cv.connectedComponentsWithStats(mk, l2, st, ce, 4, cv.CV_32S)
        let big = 0; for (let i2 = 1; i2 < n; i2++) if (st.data32S[i2 * 5 + 4] * m2 >= 3) big++
        for (const m of [mk, l2, st, ce]) m.delete(); return big
      }
      const local = accepted.map(s => [s[0] * ppp, s[1] * ppp, s[2] * ppp, s[3] * ppp])
      const before = count(local), after = count([...local, [A[0], A[1], B[0], B[1]]])
      if (after > before && after >= 2) { accepted.push([A[0] / ppp, A[1] / ppp, B[0] / ppp, B[1] / ppp]); rep.accepted++ }
    }
  }
  onLog(`Tự sửa: thử ${rep.tried} nét, nhận ${rep.accepted} vách`)
  return rep
}
