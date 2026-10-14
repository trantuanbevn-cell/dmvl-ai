// AI so VÂN: phần mềm lọc rộng ~200 mẫu thư viện, ghép thành bảng mẫu đánh số; AI chỉ nhìn và chọn mẫu cùng vân với vùng khoanh.
import { supabase, FUNCTIONS_URL } from './supabase'
import { loadImage } from './crop'
import type { FMat } from './suggest'

export type AiPick = { m: FMat; confidence: number; reason: string }
const COLS = 5, ROWS = 8, PER = COLS * ROWS, TW = 240, TH = 120

async function tile(m: FMat): Promise<CanvasImageSource | null> {
  try { return await loadImage(m.tex_url!) } catch { return null }
}
/** Ghép các mẫu thành bảng (5×8 ô, mỗi ô 2:1, có số ở góc) */
async function sheetOf(ms: FMat[], from: number): Promise<string> {
  const c = document.createElement('canvas'); c.width = COLS * TW; c.height = ROWS * TH
  const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height)
  const ims = await Promise.all(ms.map(tile))
  ims.forEach((im, i) => {
    const cx = (i % COLS) * TW, cy = Math.floor(i / COLS) * TH
    if (im) {
      const w = (im as HTMLImageElement).naturalWidth, h = (im as HTMLImageElement).naturalHeight, r = Math.max(TW / w, TH / h)   // phủ kín ô, cắt giữa
      const sw = TW / r, sh = TH / r
      x.drawImage(im, (w - sw) / 2, (h - sh) / 2, sw, sh, cx + 2, cy + 2, TW - 4, TH - 4)
    }
    const t = String(from + i); x.font = 'bold 20px sans-serif'; const tw = x.measureText(t).width + 10
    x.fillStyle = '#fff'; x.fillRect(cx + 2, cy + 2, tw, 26); x.fillStyle = '#000'; x.fillText(t, cx + 7, cy + 22)
    x.strokeStyle = '#999'; x.lineWidth = 1; x.strokeRect(cx + 0.5, cy + 0.5, TW - 1, TH - 1)
  })
  return c.toDataURL('image/jpeg', 0.85).split(',')[1]
}

const memo = new Map<string, AiPick[]>()
/** Hỏi AI: trong `cands` (đã lọc bằng phần mềm) mẫu nào cùng vân với `query`. Kết quả nhớ theo khoá `key` trong phiên. */
export async function aiPickByPattern(key: string, query: HTMLCanvasElement, cands: FMat[], hint?: string): Promise<AiPick[]> {
  const hit = memo.get(key); if (hit) return hit
  const list = cands.slice(0, PER * 5)
  const sheets: { img: string; from: number; to: number }[] = []
  for (let i = 0; i < list.length; i += PER) { const part = list.slice(i, i + PER); sheets.push({ img: await sheetOf(part, i + 1), from: i + 1, to: i + part.length }) }
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${FUNCTIONS_URL}/match-surface`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ query: query.toDataURL('image/jpeg', 0.9).split(',')[1], sheets, hint }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error ?? `AI so vân lỗi ${res.status}`)
  const out: AiPick[] = []
  for (const p of (j.picks ?? []) as { n: number; confidence: number; reason?: string }[]) {
    const m = list[p.n - 1]; if (m && !out.some(o => o.m.id === m.id)) out.push({ m, confidence: Math.max(0, Math.min(1, +p.confidence || 0)), reason: p.reason ?? '' })
  }
  memo.set(key, out)
  return out
}
