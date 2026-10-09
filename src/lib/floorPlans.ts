// Mặt bằng GỐC theo tầng (PDF vector xuất từ AutoCAD): tải lên, đọc nét vẽ, tìm phòng kín.
import { supabase, BUCKET } from './supabase'
import { loadCv } from './cv'
import { readVectorPage, guessWallClasses, detectDoors } from './vector'
import { applyMerges, applyCuts, roomPolys, inRoom } from './cadZones'
import { autoBackup } from './backup'
import { detectFurniture } from './furniture'
import { roomKey } from './sheetLayout'
import { detectScale } from './dims'
import { rasterWalls, findRooms, mPerPt } from './cad'
import { renderPdfPage } from './pdf'
import type { Project, FloorPlan, FloorGeom, FloorRoom, FloorVersion, ZoneMerge, ZoneCut } from './types'

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

type AnalyzeOpts = { wallKeys?: string[]; doorW?: number; scaleDen?: number; preferDim?: boolean; merges?: ZoneMerge[]; cuts?: ZoneCut[] }

/** Đọc bản vẽ (PDF) → hình học: tỉ lệ (dim+lưới trục), cửa, không gian, đồ rời. KHÔNG ghi gì vào dữ liệu. */
export async function analyzeFloor(fp: FloorPlan, opts: AnalyzeOpts, log: Log, buf: ArrayBuffer): Promise<{ geom: FloorGeom; scaleDen: number; nRooms: number; leaked: boolean }> {
  log('Đang nạp bộ xử lý ảnh...')
  const cv = await loadCv()
  const v = await readVectorPage(buf, fp.page_no, log)
  if (v.nSeg < 20) throw new Error('File này gần như không có nét vector (có thể là PDF ảnh/scan). Hãy xuất PDF từ AutoCAD ở dạng vector.')
  // tỉ lệ: người dùng chỉnh tay > tự đọc từ dim + lưới trục > giá trị đã lưu
  const det = detectScale(v)
  const userSet = opts.scaleDen != null && opts.scaleDen !== fp.scale_den
  let scaleDen = fp.scale_den, scaleSrc: 'dim' | 'user' | 'default' = 'default', scaleNote = ''
  if (userSet) { scaleDen = opts.scaleDen!; scaleSrc = 'user'; scaleNote = 'Tỉ lệ do bạn nhập/chỉnh theo diện tích thật.' }
  else if (!opts.preferDim && fp.geometry?.scale_src === 'user') { scaleSrc = 'user'; scaleNote = fp.geometry.scale_note ?? '' }
  else if (det && det.conf >= 0.6) { scaleDen = det.den; scaleSrc = 'dim'; scaleNote = `Tự đọc từ dim + lưới trục: ${det.note}.` }
  else if (opts.preferDim && fp.geometry?.scale_src === 'user') { scaleSrc = 'user'; scaleNote = fp.geometry.scale_note ?? '' }
  log(det ? `Đọc dim/lưới trục: tỉ lệ 1:${det.den} (${det.note}, tin cậy ${Math.round(det.conf * 100)}%)${scaleSrc === 'dim' ? ' → dùng tỉ lệ này.' : ''}` : 'Không đọc được dim/lưới trục – dùng tỉ lệ đã nhập.')
  const keys = opts.wallKeys ?? fp.geometry?.wall_keys
  let sel = keys ? new Set(v.classes.map((c, i) => (keys.includes(c.key) ? i : -1)).filter(i => i >= 0)) : guessWallClasses(v)
  if (!sel.size) sel = guessWallClasses(v)
  if (!sel.size) throw new Error('Không chọn được nhóm nét nào làm tường')
  const mpp = mPerPt(scaleDen)
  const doors = detectDoors(v, mpp)
  const doorW = opts.doorW ?? fp.geometry?.door_w ?? (doors.length >= 3 ? 0.3 : 1.0)
  log(`Nhận diện được ${doors.length} cửa đi (cung quay + cánh)${doors.length < 3 ? ' – ít, dùng cách đóng ô cửa theo bề rộng' : ' – tường được đóng đúng tại cửa'}.`)
  const ppp = Math.min(4, 4000 / Math.max(v.w, v.h))
  log(`Đang tìm tường và phòng kín (${sel.size} nhóm nét tường)...`)
  await new Promise(r => setTimeout(r, 20))
  const withDoors = new Set(sel); v.classes.forEach((c, i) => { if (/DOOR|CUA DI|CUA SO|WINDOW/i.test(c.layer) && !c.fill) withDoors.add(i) })
  const { mask, W, H } = rasterWalls(v, withDoors, ppp, doors, true, mpp)
  const res = findRooms(cv, v, mask, W, H, ppp, scaleDen, doorW)
  log('Đang đếm đồ rời trong bản vẽ...')
  const furn = detectFurniture(v, mpp)
  const labels: [string, number, number][] = []
  for (const t of v.texts) { const s = t.t.trim(); if (s.length >= 3 && !/^[\d.,\s\-+×x*/m²]+$/i.test(s) && labels.length < 3000) labels.push([s, +(t.x / v.w).toFixed(5), +((t.y - t.h * 0.3) / v.h).toFixed(5)]) }
  const merges = opts.merges ?? fp.geometry?.merges ?? [], cuts = opts.cuts ?? fp.geometry?.cuts ?? []
  const geom: FloorGeom = {
    w: v.w, h: v.h, m_per_pt: mpp, door_w: doorW, leaked: res.leaked,
    wall_keys: [...sel].map(i => v.classes[i].key),
    classes: v.classes.map(c => ({ ...c })).sort((a, b) => b.len - a.len).slice(0, 60),
    algo: 5, scale_src: scaleSrc, scale_note: scaleNote, doors: doors.length, rooms: res.rooms, raw_rooms: res.rooms, uncut_rooms: res.rooms, cuts, merges,
    furn: { ...furn, names: fp.geometry?.furn?.names ?? {} }, labels, history: fp.geometry?.history,
  }
  if (geom.cuts?.length) geom.raw_rooms = applyCuts(res.rooms, geom.cuts)
  geom.rooms = applyMerges(geom.raw_rooms!, geom.merges!)
  return { geom, scaleDen, nRooms: res.rooms.length, leaked: res.leaked }
}

/** Đọc lại bản vẽ hiện có và tìm phòng. Có thể đổi nhóm nét tường, bề rộng cửa, tỉ lệ. */
export async function computeFloor(fp: FloorPlan, opts: { wallKeys?: string[]; doorW?: number; scaleDen?: number }, log: Log, buf?: ArrayBuffer) {
  if (!buf) buf = await (await must(supabase.storage.from(BUCKET).download(fp.pdf_path)) as Blob).arrayBuffer()
  const { geom, scaleDen, nRooms, leaked } = await analyzeFloor(fp, opts, log, buf)
  await must(supabase.from('floor_plans').update({ scale_den: scaleDen, geometry: geom, status: 'ready' }).eq('id', fp.id))
  log(`Xong: tìm được ${nRooms} phòng kín${geom.merges?.length ? `, áp lại ${geom.merges.length} phép gộp/đặt tên` : ''}${leaked ? ' – ít quá, có thể tường chưa kín: thử chọn thêm nhóm nét tường hoặc tăng bề rộng cửa' : ''}.`)
}

const envelope = (rooms: FloorRoom[]) => { let x0 = 1, y0 = 1, x1 = 0, y1 = 0; for (const r of rooms) for (const pl of roomPolys(r)) for (const p of pl) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]) } return { x0, y0, x1, y1 } }

/** Chuyển tên phòng/phép gộp từ bản cũ sang bản mới: căn 2 mặt bằng theo khung bao toàn nhà rồi tìm không gian mới chứa tâm cũ */
export function carryOver(oldG: FloorGeom, newG: FloorGeom): { merges: ZoneMerge[]; map: Map<string, string>; carried: number; total: number; ok: boolean; why?: string } {
  const oldRaw = oldG.raw_rooms ?? oldG.rooms, newRaw = newG.raw_rooms ?? newG.rooms
  const total = (oldG.merges ?? []).length
  if (!total || !oldRaw.length || !newRaw.length) return { merges: [], map: new Map(), carried: 0, total, ok: true }
  const o = envelope(oldRaw), n = envelope(newRaw)
  const ao = ((o.x1 - o.x0) * oldG.w) / Math.max(1e-6, (o.y1 - o.y0) * oldG.h), an = ((n.x1 - n.x0) * newG.w) / Math.max(1e-6, (n.y1 - n.y0) * newG.h)
  if (Math.abs(ao / an - 1) > 0.12) return { merges: [], map: new Map(), carried: 0, total, ok: false, why: 'Hình dáng toàn nhà của bản vẽ mới khác bản cũ nên không tự chuyển được tên phòng.' }
  const mp = (x: number, y: number): [number, number] => [n.x0 + ((x - o.x0) / Math.max(1e-6, o.x1 - o.x0)) * (n.x1 - n.x0), n.y0 + ((y - o.y0) / Math.max(1e-6, o.y1 - o.y0)) * (n.y1 - n.y0)]
  const used = new Set<number>(), merges: ZoneMerge[] = [], map = new Map<string, string>()
  let carried = 0
  for (const m of oldG.merges ?? []) {
    const members: [number, number][] = []
    for (const [x, y] of m.members) {
      const [qx, qy] = mp(x, y)
      let r = newRaw.find(rr => !used.has(rr.id) && inRoom(rr, qx, qy))
      if (!r) { let bd = 0.02; for (const rr of newRaw) { if (used.has(rr.id)) continue; const d = Math.hypot(rr.cx - qx, rr.cy - qy); if (d < bd) { bd = d; r = rr } } }
      if (r) { used.add(r.id); members.push([r.cx, r.cy]) }
    }
    if (members.length) { merges.push({ ...m, members }); carried++ }
  }
  // khoá ô tên (tâm làm tròn) cũ → mới, để giữ màu/vị trí ô tên ở trang mặt bằng tổng
  const oldRooms = oldG.rooms.filter(r => r.user), newRooms = applyMerges(newRaw, merges)
  for (const r of oldRooms) { const [qx, qy] = mp(r.cx, r.cy); const nr = newRooms.find(x => x.user && inRoom(x, qx, qy)); if (nr) map.set(roomKey(r), roomKey(nr)) }
  return { merges, map, carried, total, ok: true }
}

/** Cập nhật mặt bằng của tầng bằng PDF MỚI. Không xoá/ghi đè file cũ; dữ liệu vật liệu (phòng, mã, vị trí…) không bị động tới; có sao lưu tự động và giữ bản cũ để quay lại. */
export async function updateFloorPdf(fp: FloorPlan, file: File, log: Log): Promise<string> {
  if (!fp.geometry) throw new Error('Tầng này chưa được đọc')
  log('Đang sao lưu dữ liệu dự án trước khi cập nhật...')
  await autoBackup({ id: fp.project_id }, `Trước khi cập nhật PDF mặt bằng "${fp.floor_label}"`)
  const stamp = Date.now()
  const pdfPath = `${fp.project_id}/floors/${fp.id}-${stamp}.pdf`, prevPath = `${fp.project_id}/floors/${fp.id}-${stamp}.jpg`
  log(`Đang tải ${file.name} lên (bản cũ vẫn được giữ)...`)
  await must(supabase.storage.from(BUCKET).upload(pdfPath, file, { upsert: false, contentType: 'application/pdf' }))
  const buf = await file.arrayBuffer()
  const pv = await renderPdfPage(buf, fp.page_no, 2000)
  await must(supabase.storage.from(BUCKET).upload(prevPath, pv.blob, { upsert: false, contentType: 'image/jpeg' }))
  const { geom, scaleDen, nRooms } = await analyzeFloor({ ...fp, pdf_path: pdfPath }, { preferDim: true, wallKeys: undefined, merges: [], cuts: [] }, log, buf)
  const old = fp.geometry
  const co = carryOver(old, geom)
  const raw = co.merges.length ? geom : geom
  // áp lại tên phòng đã chuyển
  raw.merges = co.merges; raw.cuts = []; raw.rooms = applyMerges(raw.raw_rooms ?? raw.rooms, co.merges)
  raw.furn!.names = old.furn?.names ?? {}
  const { history: _h, ...oldSnap } = old
  const ver: FloorVersion = { at: new Date().toISOString(), note: `Trước khi cập nhật bằng ${file.name}`, pdf_path: fp.pdf_path, preview_path: fp.preview_path, page_no: fp.page_no, scale_den: fp.scale_den, width: fp.width, height: fp.height, geometry: oldSnap, sheet: fp.sheet ?? null }
  raw.history = [ver, ...(old.history ?? [])].slice(0, 3)
  // trang mặt bằng tổng: chuyển màu/vị trí ô tên sang khoá mới
  let sheet = fp.sheet ?? null
  if (sheet && co.map.size) {
    const items = { ...sheet.items }
    for (const [ok, nk] of co.map) if (sheet.items[ok]) { const { ax: _a, ay: _b, ...rest } = sheet.items[ok]; items[nk] = rest }
    sheet = { ...sheet, items }
  }
  await must(supabase.from('floor_plans').update({ pdf_path: pdfPath, preview_path: prevPath, width: pv.width, height: pv.height, scale_den: scaleDen, geometry: raw, sheet, status: 'ready' }).eq('id', fp.id))
  return `Đã cập nhật: ${nRooms} không gian, tỉ lệ 1:${scaleDen}${raw.scale_src === 'dim' ? ' (đọc từ dim)' : ''}, ${raw.doors ?? 0} cửa đi, ${raw.furn?.at.length ?? 0} đồ rời. Chuyển được ${co.carried}/${co.total} tên phòng/phép gộp${co.ok ? '' : ' – ' + co.why}. Bản cũ vẫn giữ để quay lại.`
}

/** Quay lại bản mặt bằng trước đó (đổi chỗ với bản hiện tại, không mất bản nào) */
export async function restoreFloorVersion(fp: FloorPlan): Promise<void> {
  const g = fp.geometry, prev = g?.history?.[0]; if (!g || !prev) throw new Error('Không có bản trước')
  const { history, ...cur } = g
  const now: FloorVersion = { at: new Date().toISOString(), note: 'Bản trước khi quay lại', pdf_path: fp.pdf_path, preview_path: fp.preview_path, page_no: fp.page_no, scale_den: fp.scale_den, width: fp.width, height: fp.height, geometry: cur, sheet: fp.sheet ?? null }
  const geometry: FloorGeom = { ...prev.geometry, history: [now, ...(history ?? []).slice(1)].slice(0, 3) }
  await must(supabase.from('floor_plans').update({ pdf_path: prev.pdf_path, preview_path: prev.preview_path, page_no: prev.page_no, width: prev.width, height: prev.height, scale_den: prev.scale_den, geometry, sheet: prev.sheet, status: 'ready' }).eq('id', fp.id))
}

export async function deleteFloorPlan(fp: FloorPlan) {
  await supabase.storage.from(BUCKET).remove([fp.pdf_path, ...(fp.preview_path ? [fp.preview_path] : [])])
  await must(supabase.from('floor_plans').delete().eq('id', fp.id))
}
