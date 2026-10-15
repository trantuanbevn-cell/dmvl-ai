// AI BỔ SUNG ẢNH KHOANH CÒN THIẾU – chế độ AN TOÀN.
// Chỉ làm đúng một việc: với những cặp (vật liệu, phòng) ĐÃ CÓ trong danh mục nhưng chưa có ảnh khoanh, nhờ AI nhìn phối cảnh của phòng và chỉ ra vật liệu ở đâu,
// rồi ghi trang + khung vào CHÍNH vị trí đã có (chỉ khi vị trí đó chưa có khung). Không tạo mã, không tạo vị trí, không xoá, không đổi phòng/hạng mục/thông tin.
// AI không chắc / không thấy → bỏ qua. Phòng không có trang phối cảnh → bỏ qua. Luôn sao lưu trước khi chạy.
import { supabase, signedUrl } from './supabase'
import { callAI } from './ai'
import { autoBackup } from './backup'
import { cropBase64, normalizeAIBox } from './crop'
import type { ProjectData } from './useProject'
import type { Entry, Page, Occurrence, Room } from './types'
import type { PageViews } from './planPipeline'

const MIN_CONF = 0.65          // dưới ngưỡng này coi như không chắc → bỏ qua
const MAX_AREA = 0.55          // khung phủ quá nửa ảnh → coi là không cụ thể → bỏ qua
const BATCH = 16               // số hạng mục hỏi AI mỗi lần gọi
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export type LocateReport = { updated: { occ: string; entry: string; room: string; page: number; conf: number }[]; skipped: { entry: string; room: string; why: string }[]; rooms: number; calls: number; backup: string | null }

async function ask(payload: unknown, log: (m: string) => void) {
  for (let attempt = 1; ; attempt++) {
    try { return await callAI('locate_items', payload) }
    catch (e) {
      if (attempt < 4 && /429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|overloaded/i.test(String(e))) { const w = 20 * attempt; log(`Chạm giới hạn AI – chờ ${w}s rồi thử lại…`); await sleep(w * 1000); continue }
      throw e
    }
  }
}

/** Các cặp (mã, phòng) chưa có ảnh khoanh mà phòng có trang phối cảnh. roomIds/entryIds để giới hạn phạm vi (bỏ trống = tất cả) */
export function missingPairs(d: ProjectData, f: { roomIds?: string[]; entryIds?: string[] } = {}) {
  const live = new Map(d.entries.filter(e => e.status !== 'rejected').map(e => [e.id, e]))
  const roomOk = new Set(d.pages.filter(p => p.kind === 'render' && p.room_id).map(p => p.room_id!))
  const byPair = new Map<string, Occurrence[]>()
  for (const o of d.occ) { if (!o.room_id || !live.has(o.entry_id)) continue; const k = o.entry_id + '|' + o.room_id; byPair.set(k, [...(byPair.get(k) ?? []), o]) }
  const out: { entry: Entry; room: Room; occ: Occurrence }[] = []
  for (const [k, os] of byPair) {
    if (os.some(o => o.bbox)) continue                       // đã có ảnh khoanh
    const [eid, rid] = k.split('|')
    if (f.roomIds && !f.roomIds.includes(rid)) continue
    if (f.entryIds && !f.entryIds.includes(eid)) continue
    if (!roomOk.has(rid)) continue
    const room = d.rooms.find(r => r.id === rid); if (!room || /^\s*tất cả/i.test(room.name_vn ?? '')) continue
    out.push({ entry: live.get(eid)!, room, occ: os.find(o => !o.page_id) ?? os[0] })
  }
  return out
}

export async function locateMissingShots(d: ProjectData, f: { roomIds?: string[]; entryIds?: string[] }, log: (m: string) => void): Promise<LocateReport> {
  const rep: LocateReport = { updated: [], skipped: [], rooms: 0, calls: 0, backup: null }
  const project = d.project; if (!project) return rep
  const todo = missingPairs(d, f)
  if (!todo.length) return rep
  const bk = await autoBackup(project, 'Trước khi AI bổ sung ảnh khoanh còn thiếu'); rep.backup = bk ? 'đã sao lưu' : null
  const rooms = [...new Set(todo.map(t => t.room.id))]
  for (const rid of rooms) {
    const room = d.rooms.find(r => r.id === rid)!
    const mine = todo.filter(t => t.room.id === rid)
    const left = new Map(mine.map(t => [t.entry.id, t]))       // chưa tìm thấy
    const pages = d.pages.filter(p => p.kind === 'render' && p.room_id === rid).sort((a, b) => a.page_no - b.page_no)
    rep.rooms++
    for (const page of pages) {
      if (!left.size) break
      const url = await signedUrl(page.image_path)
      const views = page.views as PageViews | null
      // mỗi "ảnh" cần nhìn: cả trang, hoặc (slide nhiều ảnh) chỉ những ô thuộc phòng này
      const units: { rect: [number, number, number, number] | null }[] = []
      if (views && views.rects.length >= 2 && views.cams.length >= 2) {
        views.rects.forEach((r, vi) => { const cam = views.pair[vi] >= 0 ? views.cams[views.pair[vi]] : null; if (!cam?.room_id || cam.room_id === rid) units.push({ rect: [r.x, r.y, r.w, r.h] }) })
      } else units.push({ rect: null })
      for (const u of units) {
        const ids = [...left.keys()]
        for (let i = 0; i < ids.length; i += BATCH) {
          const part = ids.slice(i, i + BATCH).map(id => left.get(id)!)
          log(`${room.code} · trang ${page.page_no}: hỏi AI ${part.length} hạng mục…`)
          const b64 = await cropBase64(url, u.rect ?? [0, 0, 1, 1], 1600)
          let r
          try { r = await ask({ room: { name_vn: room.name_vn }, image: { base64: b64 }, items: part.map(t => ({ id: t.entry.id, code: t.entry.code, name_vn: t.entry.name_vn, material_vn: t.entry.material_vn, part_vn: t.entry.part_vn })) }, log) }
          catch (e) { log(`  lỗi AI: ${String(e).slice(0, 120)}`); continue }
          rep.calls++
          for (const L of (r.tool?.locations ?? []) as { id: string; found: boolean; box_2d?: number[]; confidence?: number }[]) {
            const t = left.get(L.id); if (!t || !L.found) continue
            const conf = Number(L.confidence ?? 0); if (conf < MIN_CONF) continue
            let box = normalizeAIBox({ box_2d: L.box_2d }); if (!box) continue
            if (box[2] * box[3] > MAX_AREA) continue
            if (u.rect) { const [rx, ry, rw, rh] = u.rect; box = [+(rx + box[0] * rw).toFixed(4), +(ry + box[1] * rh).toFixed(4), +(box[2] * rw).toFixed(4), +(box[3] * rh).toFixed(4)] }
            // GHI: chỉ vào đúng vị trí đã có, và chỉ khi nó chưa có khung (không bao giờ ghi đè)
            const { data, error } = await supabase.from('occurrences').update({ page_id: page.id, bbox: box, confidence: conf }).eq('id', t.occ.id).is('bbox', null).select('id')
            if (error) { log('  lỗi ghi: ' + error.message); continue }
            if (data?.length) { rep.updated.push({ occ: t.occ.id, entry: t.entry.code, room: room.code, page: page.page_no, conf }); left.delete(L.id) }
          }
          await sleep(2500)
        }
      }
    }
    for (const t of left.values()) rep.skipped.push({ entry: t.entry.code, room: room.code, why: pages.length ? 'AI không thấy / không chắc' : 'phòng chưa có ảnh phối cảnh' })
    log(`${room.code}: khoanh được ${mine.length - left.size}/${mine.length}`)
  }
  await d.reload()
  return rep
}
