// Hoàn tất dự án: nén toàn bộ ảnh JPG của dự án (cạnh dài ≤ 1200px, chất lượng ~0.62) để giảm dung lượng kho ảnh.
// KHÔNG xoá file nào, KHÔNG đổi đường dẫn → mọi dữ liệu và liên kết còn nguyên, mở lại vẫn xem được (ảnh nhẹ hơn).
// PDF/DXF gốc giữ nguyên. Chỉ ghi đè ảnh khi bản nén nhỏ hơn rõ rệt (≥15%).
import { supabase, BUCKET } from './supabase'
import { autoBackup } from './backup'
import type { Project } from './types'

type Obj = { path: string; size: number }
async function listAll(prefix: string): Promise<Obj[]> {
  const out: Obj[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000, offset: off })
    if (error) throw new Error(error.message)
    if (!data?.length) break
    for (const f of data) {
      if (f.id == null) out.push(...await listAll(`${prefix}/${f.name}`))   // thư mục
      else out.push({ path: `${prefix}/${f.name}`, size: Number((f.metadata as { size?: number } | null)?.size ?? 0) })
    }
    if (data.length < 1000) break
  }
  return out
}
const isJpg = (p: string) => /\.jpe?g$/i.test(p) && !/_[ts]\.jpe?g$/i.test(p)   // bỏ qua ảnh nhỏ _t / _s đã sẵn nhẹ

async function shrink(blob: Blob, maxEdge: number, q: number): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const r = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * r)); c.height = Math.max(1, Math.round(bmp.height * r))
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.()
  return await new Promise((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('Không nén được ảnh'))), 'image/jpeg', q))
}

export type FinishResult = { files: number; before: number; after: number; skipped: number }
export async function finishProject(project: Project, log: (s: string) => void): Promise<FinishResult> {
  await autoBackup(project, 'Tự động trước khi Hoàn tất dự án')
  log('Đang liệt kê file của dự án…')
  const all = (await listAll(project.id)).filter(o => isJpg(o.path))
  let before = 0, after = 0, files = 0, skipped = 0, done = 0
  const queue = [...all]
  const worker = async () => {
    for (let o = queue.shift(); o; o = queue.shift()) {
      try {
        const { data, error } = await supabase.storage.from(BUCKET).download(o.path)
        if (error || !data) throw new Error(error?.message ?? 'không tải được')
        const nb = await shrink(data, 1200, 0.62)
        before += data.size
        if (nb.size < data.size * 0.85) {
          const up = await supabase.storage.from(BUCKET).upload(o.path, nb, { upsert: true, contentType: 'image/jpeg' })
          if (up.error) throw new Error(up.error.message)
          after += nb.size; files++
        } else { after += data.size; skipped++ }
      } catch (e) { skipped++; log(`  Bỏ qua ${o.path}: ${String((e as Error).message ?? e)}`) }
      done++; if (done % 10 === 0 || done === all.length) log(`  ${done}/${all.length} ảnh`)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  const info = { at: new Date().toISOString(), files, before, after }
  const { error } = await supabase.from('projects').update({ finished_at: info.at, finish_info: info }).eq('id', project.id)
  if (error) throw new Error(error.message)
  return { files, before, after, skipped }
}
export async function reopenProject(project: Project) {
  const { error } = await supabase.from('projects').update({ finished_at: null }).eq('id', project.id)
  if (error) throw new Error(error.message)
}
