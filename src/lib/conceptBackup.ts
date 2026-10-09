// Lưu / nạp bản sao bộ concept về máy (1 file .json: dữ liệu + PDF mặt bằng + ảnh đã tải). Nạp lại luôn tạo bộ MỚI, không ghi đè.
import { supabase, BUCKET } from './supabase'
import { renderPdfPage } from './pdf'
import type { ProjectData } from './useProject'

const b64 = (b: Blob) => new Promise<string>(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b) })
const dl = async (path: string) => { const { data, error } = await supabase.storage.from(BUCKET).download(path); if (error) throw new Error(error.message); return b64(data) }
const toBlob = async (u: string) => (await fetch(u)).blob()

export async function exportConcept(d: ProjectData, log: (m: string) => void): Promise<{ blob: Blob; name: string }> {
  const p = d.project!
  const deck = (p as any).deck
  const files: Record<string, string> = {}
  const imgs: string[] = (deck?.pages ?? []).flatMap((x: any) => Object.values(x.img ?? {})) as string[]
  for (const [i, path] of imgs.entries()) { log(`Đang gói ảnh ${i + 1}/${imgs.length}…`); files[path] = await dl(path) }
  const floors = []
  for (const [i, f] of d.floors.entries()) { log(`Đang gói mặt bằng ${i + 1}/${d.floors.length}…`); floors.push({ floor_label: f.floor_label, page_no: f.page_no, scale_den: f.scale_den, geometry: f.geometry, sheet: f.sheet, status: f.status, pdf: await dl(f.pdf_path) }) }
  const data = { format: 'dmvl-concept', v: 1, at: new Date().toISOString(), project: { name: p.name, location: p.location, client: p.client, deck }, floors, files }
  const t = new Date(), pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}_${pad(t.getHours())}${pad(t.getMinutes())}`
  return { blob: new Blob([JSON.stringify(data)], { type: 'application/json' }), name: `${p.name.replace(/[^\p{L}\d]+/gu, '_')}_${stamp}.dmvl-concept.json` }
}

export async function restoreConcept(file: File, log: (m: string) => void): Promise<string> {
  const data = JSON.parse(await file.text())
  if (data.format !== 'dmvl-concept') throw new Error('Đây không phải file bản sao concept của DMVL AI')
  const { data: pr, error } = await supabase.from('projects').insert({ name: `${data.project.name} (bản nạp ${new Date().toLocaleDateString('vi-VN')})`, location: data.project.location, client: data.project.client, kind: 'concept' }).select().single()
  if (error) throw new Error(error.message)
  const pid = pr.id as string
  const up = async (path: string, dataUrl: string, type: string) => { const { error: e } = await supabase.storage.from(BUCKET).upload(path, await toBlob(dataUrl), { upsert: true, contentType: type }); if (e) throw new Error(e.message) }
  const map: Record<string, string> = {}
  for (const [old, u] of Object.entries<string>(data.files ?? {})) { const np = `${pid}/deck/${old.split('/').pop()}`; await up(np, u, 'image/jpeg'); map[old] = np }
  const deck = data.project.deck ? { ...data.project.deck, pages: data.project.deck.pages.map((p: any) => ({ ...p, img: Object.fromEntries(Object.entries<string>(p.img ?? {}).map(([k, v]) => [k, map[v] ?? v])) })) } : null
  if (deck) await supabase.from('projects').update({ deck }).eq('id', pid)
  for (const [i, f] of (data.floors ?? []).entries()) {
    log(`Đang nạp mặt bằng ${i + 1}/${data.floors.length}…`)
    const id = crypto.randomUUID(), pdfPath = `${pid}/floors/${id}.pdf`, prevPath = `${pid}/floors/${id}.jpg`
    const blob = await toBlob(f.pdf)
    await up(pdfPath, f.pdf, 'application/pdf')
    const pv = await renderPdfPage(await blob.arrayBuffer(), f.page_no, 2000)
    const { error: e1 } = await supabase.storage.from(BUCKET).upload(prevPath, pv.blob, { upsert: true, contentType: 'image/jpeg' }); if (e1) throw new Error(e1.message)
    const { error: e2 } = await supabase.from('floor_plans').insert({ id, project_id: pid, floor_label: f.floor_label, pdf_path: pdfPath, page_no: f.page_no, scale_den: f.scale_den, width: pv.width, height: pv.height, preview_path: prevPath, geometry: f.geometry, sheet: f.sheet, status: f.status })
    if (e2) throw new Error(e2.message)
  }
  return pid
}
