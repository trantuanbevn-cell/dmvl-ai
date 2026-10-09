// Mặt bằng GỐC theo tầng (PDF vector xuất từ AutoCAD): tải lên, đọc nét vẽ, tìm phòng kín.
import { supabase, BUCKET } from './supabase'
import { loadCv } from './cv'
import { readVectorPage, guessWallClasses, detectDoors } from './vector'
import { applyMerges, applyCuts } from './cadZones'
import { rasterWalls, findRooms, mPerPt } from './cad'
import { renderPdfPage } from './pdf'
import type { Project, FloorPlan, FloorGeom } from './types'

type Log = (m: string) => void
async function must<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> { const { data, error } = await p; if (error) throw new Error(error.message ?? String(error)); return data }

export async function addFloorPlan(project: Project, file: File, label: string, scaleDen: number, pageNo: number, log: Log) {
  const id = crypto.randomUUID()
  const pdfPath = `${project.id}/floors/${id}.pdf`
  log(`Đang tải ${file.name} lên...`)
  await must(supabase.storage.from(BUCKET).upload(pdfPath, file, { upsert: true, contentType: 'application/pdf' }))
  const buf = await file.arrayBuffer()
  log('Đang vẽ ảnh xem trước...')
  const pv = await renderPdfPage(buf, pageNo, 2000)
  const prevPath = `${project.id}/floors/${id}.jpg`
  await must(supabase.storage.from(BUCKET).upload(prevPath, pv.blob, { upsert: true, contentType: 'image/jpeg' }))
  const row = await must(supabase.from('floor_plans').insert({ id, project_id: project.id, floor_label: label, pdf_path: pdfPath, page_no: pageNo, scale_den: scaleDen, width: pv.width, height: pv.height, preview_path: prevPath }).select().single()) as FloorPlan
  await computeFloor(row, {}, log, buf)
}

/** Đọc lại bản vẽ và tìm phòng. Có thể đổi nhóm nét tường, bề rộng cửa, tỉ lệ. */
export async function computeFloor(fp: FloorPlan, opts: { wallKeys?: string[]; doorW?: number; scaleDen?: number }, log: Log, buf?: ArrayBuffer) {
  const scaleDen = opts.scaleDen ?? fp.scale_den
  log('Đang nạp bộ xử lý ảnh...')
  const cv = await loadCv()
  if (!buf) buf = await (await must(supabase.storage.from(BUCKET).download(fp.pdf_path)) as Blob).arrayBuffer()
  const v = await readVectorPage(buf, fp.page_no, log)
  if (v.nSeg < 20) throw new Error('File này gần như không có nét vector (có thể là PDF ảnh/scan). Hãy xuất PDF từ AutoCAD ở dạng vector.')
  const keys = opts.wallKeys ?? fp.geometry?.wall_keys
  const sel = keys ? new Set(v.classes.map((c, i) => (keys.includes(c.key) ? i : -1)).filter(i => i >= 0)) : guessWallClasses(v)
  if (!sel.size) throw new Error('Không chọn được nhóm nét nào làm tường')
  const doors = detectDoors(v, mPerPt(scaleDen))
  const doorW = opts.doorW ?? fp.geometry?.door_w ?? (doors.length >= 3 ? 0.3 : 1.0)
  log(`Nhận diện được ${doors.length} cửa đi (cung quay + cánh)${doors.length < 3 ? ' – ít, dùng cách đóng ô cửa theo bề rộng' : ' – tường được đóng đúng tại cửa'}.`)
  const ppp = Math.min(4, 4000 / Math.max(v.w, v.h))
  log(`Đang tìm tường và phòng kín (${sel.size} nhóm nét tường)...`)
  await new Promise(r => setTimeout(r, 20))
  const withDoors = new Set(sel); v.classes.forEach((c, i) => { if (/DOOR|CUA DI|CUA SO|WINDOW/i.test(c.layer) && !c.fill) withDoors.add(i) })
  const { mask, W, H } = rasterWalls(v, withDoors, ppp, doors, true, mPerPt(scaleDen))
  const res = findRooms(cv, v, mask, W, H, ppp, scaleDen, doorW)
  const geom: FloorGeom = {
    w: v.w, h: v.h, m_per_pt: mPerPt(scaleDen), door_w: doorW, leaked: res.leaked,
    wall_keys: [...sel].map(i => v.classes[i].key),
    classes: v.classes.map(c => ({ ...c })).sort((a, b) => b.len - a.len).slice(0, 60),
    algo: 2, doors: doors.length, rooms: res.rooms, raw_rooms: res.rooms, uncut_rooms: res.rooms, cuts: fp.geometry?.cuts ?? [], merges: fp.geometry?.merges ?? [],
  }
  if (geom.cuts?.length) geom.raw_rooms = applyCuts(res.rooms, geom.cuts)
  geom.rooms = applyMerges(geom.raw_rooms!, geom.merges!)
  await must(supabase.from('floor_plans').update({ scale_den: scaleDen, geometry: geom, status: 'ready' }).eq('id', fp.id))
  log(`Xong: tìm được ${res.rooms.length} phòng kín${geom.merges?.length ? `, áp lại ${geom.merges.length} phép gộp/đặt tên` : ''}${res.leaked ? ' – ít quá, có thể tường chưa kín: thử chọn thêm nhóm nét tường hoặc tăng bề rộng cửa' : ''}.`)
}

export async function deleteFloorPlan(fp: FloorPlan) {
  await supabase.storage.from(BUCKET).remove([fp.pdf_path, ...(fp.preview_path ? [fp.preview_path] : [])])
  await must(supabase.from('floor_plans').delete().eq('id', fp.id))
}
