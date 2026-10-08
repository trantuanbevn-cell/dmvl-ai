// Đọc mặt bằng + camera cho cả dự án – KHÔNG dùng AI. Kết quả lưu vào rooms.plan và pages.camera.
import { supabase, BUCKET, signedUrl } from './supabase'
import { loadCv } from './cv'
import { extractWords } from './pdf'
import { norm as normT } from './classify'
import { detectCameras, type Camera, orbFeatures, freeFeat, matchSimilarity, applyT, roomLabels, segmentRooms, dirWords, type Feat, type RoomRegion } from './plan'
import { renderRects, type Rect } from './renders'
import { roomPolys, inRoom, centroidOf } from './cadZones'
import { matchConceptToCad, inPoly } from './cadMatch'
import type { Project, Room, Page, Entry, Occurrence, FloorPlan, ZoneSuggest, ZoneCompare } from './types'

type Log = (msg: string) => void
const MAXW = 2000

export type PlanData = {
  page_id: string; page_no: number; w: number; h: number; k: number; px_per_m: number; basis: string
  regions: (Omit<RoomRegion, 'items'> & { fit: number })[]
  cad?: { floor_id: string; floor_label: string; lambda: number; T: { a: number; b: number; tx: number; ty: number }; inliers: number; rooms: { label: string; cad_room: number; cad_area: number; cad_names: string[] }[] }
  area_m2: number; counts: { chairs: number; tables: number }; items: { x: number; y: number; t: 'c' | 't' }[]
}
export type CameraData = {
  plan_page_id: string; plan_page_no: number; inliers: number
  cam: { x: number; y: number }; dir: { dx: number; dy: number }; half: number; range: number // toạ độ chuẩn hoá theo trang mặt bằng
  thumb: { x: number; y: number; w: number; h: number }; dir_vn: string
  cad?: { floor_label: string; room_id: number | null; names: string[]; area_m2: number | null; view_rooms: string[] }
  visible: { chairs: number; tables: number }; rooms_in_view: string[]
  label?: string; room_id?: string | null // nhãn A/B… và phòng mà camera đứng trong
  src?: { x: number; y: number } // vị trí camera trên ảnh slide (0..1)
}
/** Slide có nhiều ô phối cảnh: rects = các ô ảnh; cams = các camera trên mặt bằng; pair[i] = chỉ số camera của ô ảnh i (-1 = chưa rõ) */
export type PageViews = { rects: Rect[]; cams: CameraData[]; pair: number[]; pairing: 'ai' | 'assumed'; conf: number }

async function must<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message ?? String(error))
  return data
}

const iou = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (w <= 0 || h <= 0) return 0; const i = w * h; return i / (a.w * a.h + b.w * b.h - i) }
function roomOfPoint(found: { page: Page; reg: RoomRegion; room: Room }[], pageId: string, W: number, H: number, c: { x: number; y: number }): string | null {
  for (const f of found) if (f.page.id === pageId && f.reg.poly.length > 2 && inPoly(f.reg.poly.map(p => [p[0] * W, p[1] * H]), c.x, c.y)) return f.room.id
  return null
}

async function loadImage(path: string): Promise<ImageData> {
  const blob = await (await fetch(await signedUrl(path))).blob()
  const bmp = await createImageBitmap(blob)
  const s = Math.min(1, MAXW / bmp.width)
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(bmp, 0, 0, c.width, c.height)
  return g.getImageData(0, 0, c.width, c.height)
}

const toks = (s: string | null | undefined) => normT(s ?? '').split(' ').filter(w => w.length > 1)
function matchScore(label: string, room: Room) {
  const L = new Set(toks(label)); if (!L.size) return 0
  let best = 0
  for (const name of [room.name_vn, room.name_en]) {
    const R = toks(name); if (!R.length) continue
    let k = 0; for (const w of R) if (L.has(w)) k++
    best = Math.max(best, (k / Math.max(R.length, L.size)) * 0.6 + (k / R.length) * 0.4)
  }
  return best
}

export async function analyzePlans(project: Project, rooms: Room[], pages: Page[], log: Log) {
  if (!project.pdf_path) throw new Error('Dự án chưa có file PDF')
  log('Đang nạp bộ xử lý ảnh (lần đầu ~15 MB)...')
  const cv = await loadCv()
  log('Đang đọc chữ trong PDF...')
  const pdf = await (await supabase.storage.from(BUCKET).download(project.pdf_path)).data!.arrayBuffer()
  const words = await extractWords(pdf)

  // 1) Mặt bằng: nhãn + vùng phòng
  const planPages = pages.filter(p => p.kind === 'plan')
  const imgs = new Map<string, ImageData>()
  const found: { page: Page; reg: RoomRegion; room: Room; score: number }[] = []
  const planInfo = new Map<string, { k: number; basis: string; w: number; h: number }>()
  const floors = (await must(supabase.from('floor_plans').select('*').eq('project_id', project.id))) as FloorPlan[]
  const cadOf = new Map<string, NonNullable<PlanData['cad']> & { fp: FloorPlan }>()
  await supabase.from('warnings').delete().eq('project_id', project.id).like('text', '[Mặt bằng gốc]%')
  const zoneAcc = new Map<string, { suggest: ZoneSuggest[]; compare: ZoneCompare[] }>(floors.map(f => [f.id, { suggest: [], compare: [] }]))
  for (const pg of planPages) {
    log(`Mặt bằng trang ${pg.page_no}: đang tìm nhãn phòng...`)
    const img = await loadImage(pg.image_path); imgs.set(pg.id, img)
    const seeds = roomLabels(words[pg.page_no] ?? [], img)
    if (seeds.length < 1) { log(`  không thấy nhãn "TÊN / S=..M²" trên mặt bằng`); continue }
    log(`  ${seeds.length} nhãn – đang tách vùng (≈10 giây)...`)
    await new Promise(r => setTimeout(r, 30))
    let seg = segmentRooms(cv, img, seeds)
    // đối chiếu với mặt bằng gốc vector (nếu có): lấy tỉ lệ thật và diện tích thật
    let best: { fp: FloorPlan; m: NonNullable<ReturnType<typeof matchConceptToCad>> } | null = null
    for (const fp of floors) if (fp.geometry) { const m = matchConceptToCad(seeds, fp.geometry, seg.k); if (m && (!best || m.inliers + m.names * 0.5 > best.m.inliers + best.m.names * 0.5)) best = { fp, m } }
    if (best) {
      const g = best.fp.geometry!, kTrue = Math.pow(1 / (best.m.lambda * g.m_per_pt), 2)
      log(`  khớp mặt bằng gốc "${best.fp.floor_label}": ${best.m.inliers}/${seeds.length} nhãn trùng phòng, tỉ lệ thật ${(1 / (best.m.lambda * g.m_per_pt) / 1).toFixed(0)} px/m`)
      if (Math.abs(kTrue / seg.k - 1) > 0.1) { await new Promise(r => setTimeout(r, 30)); seg = segmentRooms(cv, img, seeds, kTrue) }
      cadOf.set(pg.id, { fp: best.fp, floor_id: best.fp.id, floor_label: best.fp.floor_label, lambda: best.m.lambda, T: best.m.T, inliers: best.m.inliers, rooms: best.m.pairs.map(pr => { const cr = g.rooms.find(r => r.id === pr.roomId)!; return { label: seeds[pr.li].label, cad_room: cr.id, cad_area: cr.area_m2, cad_names: cr.names } }) })
    } else if (floors.some(f => f.geometry)) log('  chưa khớp được với mặt bằng gốc nào (kiểm tra tầng/tỉ lệ đã tải)')
    planInfo.set(pg.id, { k: seg.k, basis: seg.kBasis, w: img.width, h: img.height })
    if (best) {
      // đối chiếu từng vùng phòng của concept với các không gian của bản vẽ gốc: không gian nào nằm trong vùng đó → so diện tích, gợi ý gộp + đặt tên
      const g = best.fp.geometry!, acc = zoneAcc.get(best.fp.id)!
      for (const reg of seg.rooms) {
        if (reg.poly.length < 3 || !reg.label) continue
        const lab = seeds.find(x => x.label === reg.label)?.area ?? reg.area_m2
        const mapped = reg.poly.map(p => { const c = applyT(best!.m.T, { x: p[0] * img.width, y: p[1] * img.height }); return [c.x / g.w, c.y / g.h] })
        const mem = g.rooms.filter(r => inPoly(mapped, r.cx, r.cy))
        if (!mem.length) continue
        const area = mem.reduce((a, r) => a + r.area_m2, 0)
        acc.compare.push({ label: reg.label, label_area: lab, page_no: pg.page_no, page_id: pg.id, cad_ids: mem.map(r => r.id), cad_area: +area.toFixed(1) })
        const done = mem.length === 1 && mem[0].user && mem[0].names[0] === reg.label
        if (!done && Math.abs(area - lab) / lab <= 0.3) acc.suggest.push({ name: reg.label, members: centroidOf(g, mem.map(r => r.id)), area: +area.toFixed(1), label_area: lab, page_no: pg.page_no })
      }
    }
    for (const reg of seg.rooms) {
      let best: Room | null = null, bs = 0
      for (const r of rooms) { const s = matchScore(reg.label, r); if (s > bs) { bs = s; best = r } }
      if (best && bs >= 0.5) found.push({ page: pg, reg, room: best, score: bs })
      else log(`  nhãn "${reg.label}" (${reg.area_m2} m²) chưa khớp phòng nào`)
    }
  }
  for (const fp of floors) if (fp.geometry) {
    const acc = zoneAcc.get(fp.id)!
    await supabase.from('floor_plans').update({ geometry: { ...fp.geometry, suggest: acc.suggest, compare: acc.compare } }).eq('id', fp.id)
    if (acc.compare.length) log(`  Mặt bằng gốc "${fp.floor_label}": ${acc.compare.length} vùng concept đối chiếu được, ${acc.suggest.length} gợi ý gộp/đặt tên (xem ở mục Mặt bằng gốc).`)
  }
  // 2) Gom theo phòng (chọn trang mặt bằng có điểm khớp tốt nhất) và lưu
  const planOf = new Map<string, PlanData>()
  for (const room of rooms) {
    const mine = found.filter(f => f.room.id === room.id); if (!mine.length) continue
    const bestPage = mine.reduce((a, b) => (b.score > a.score ? b : a)).page
    const regs = mine.filter(f => f.page.id === bestPage.id).map(f => f.reg)
    const info = planInfo.get(bestPage.id)!
    const counts = regs.reduce((s, r) => ({ chairs: s.chairs + r.counts.chairs, tables: s.tables + r.counts.tables }), { chairs: 0, tables: 0 })
    const data: PlanData = {
      page_id: bestPage.id, page_no: bestPage.page_no, w: info.w, h: info.h, k: info.k, px_per_m: Math.sqrt(info.k), basis: info.basis,
      regions: regs.map(({ items, ...r }) => r), area_m2: regs.reduce((s, r) => s + r.area_m2, 0), counts, items: regs.flatMap(r => r.items),
    }
    const cad = cadOf.get(bestPage.id)
    if (cad) {
      const { fp, ...c } = cad; data.cad = c
      for (const r of c.rooms.filter(x => mine.some(f => f.reg.label === x.label))) {
        const reg = regs.find(x => x.label === r.label)
        if (reg && Math.abs(reg.area_m2 - r.cad_area) / r.cad_area > 0.15) await supabase.from('warnings').insert({ project_id: project.id, room_id: room.id, text: `[Mặt bằng gốc] "${r.label}": concept ghi ${reg.area_m2} m², bản vẽ gốc ${fp.floor_label} đo được ${r.cad_area} m² – lệch ${Math.round((Math.abs(reg.area_m2 - r.cad_area) / r.cad_area) * 100)}%, cần kiểm tra.` })
      }
    }
    planOf.set(room.id, data)
    await must(supabase.from('rooms').update({ plan: data }).eq('id', room.id))
    log(`  ${room.code} ${room.name_vn}: ${data.area_m2} m², ~${counts.chairs} ghế, ~${counts.tables} bàn (trang ${bestPage.page_no})`)
  }
  for (const r of rooms) if (!planOf.has(r.id)) await supabase.from('rooms').update({ plan: null }).eq('id', r.id)

  // 3) Camera trên từng trang phối cảnh (một slide có thể có nhiều camera + nhiều ô ảnh)
  const feats = new Map<string, Feat>()
  const planFeat = (pg: Page) => { let f = feats.get(pg.id); if (!f) { f = orbFeatures(cv, imgs.get(pg.id)!); feats.set(pg.id, f) } return f }
  const renders = pages.filter(p => p.kind === 'render' && p.room_id)
  const usable = planPages.filter(p => imgs.has(p.id))
  let rects = new Map<number, Rect[]>()
  try { rects = await renderRects(pdf, renders.map(p => p.page_no)) } catch { /* không tách được ô ảnh → coi như 1 ảnh */ }
  let ok = 0
  for (const pg of renders) {
    const room = rooms.find(r => r.id === pg.room_id)!
    try {
      const img = await loadImage(pg.image_path)
      const prs = rects.get(pg.page_no) ?? []
      // đỏ nằm TRONG ô ảnh phối cảnh là màu của chính ảnh, không phải biểu tượng camera
      const cams = detectCameras(cv, img).filter(c => c.thumb.w >= 20 && !prs.some(r => c.x / img.width > r.x && c.x / img.width < r.x + r.w && c.y / img.height > r.y && c.y / img.height < r.y + r.h))
      if (!cams.length) { await supabase.from('pages').update({ camera: null, views: null }).eq('id', pg.id); log(`Trang ${pg.page_no}: không thấy biểu tượng camera`); continue }
      const pref = planOf.get(room.id)?.page_id
      const cand = [...usable].sort((a, b) => (a.id === pref ? -1 : 0) - (b.id === pref ? -1 : 0) || (a.room_id === room.id ? -1 : 0) - (b.room_id === room.id ? -1 : 0))
      const cache: { thumb: Camera['thumb']; hit: { page: Page; T: any; inliers: number } | null }[] = []
      const located: CameraData[] = []
      for (const [ci, cam] of cams.entries()) {
        // các camera cùng nằm trên một mặt bằng nhỏ → chỉ khớp ảnh một lần
        let ent = cache.find(c => iou(c.thumb, cam.thumb) > 0.5)
        if (!ent) {
          const tf = orbFeatures(cv, img, cam.thumb, 2500)
          let hit: { page: Page; T: any; inliers: number } | null = null
          for (const pp of cand.slice(0, 4)) {
            const m = matchSimilarity(cv, tf, planFeat(pp))
            if (m && (!hit || m.inliers > hit.inliers)) hit = { page: pp, T: m.T, inliers: m.inliers }
            if (m && m.inliers >= 40) break
          }
          freeFeat(tf)
          ent = { thumb: cam.thumb, hit }; cache.push(ent)
        }
        const thumbN = { x: cam.thumb.x / img.width, y: cam.thumb.y / img.height, w: cam.thumb.w / img.width, h: cam.thumb.h / img.height }
        const hit = ent.hit
        if (!hit) { log(`Trang ${pg.page_no}: thấy camera ${String.fromCharCode(65 + ci)} nhưng không ghép được vào mặt bằng`); continue }
        const pi = imgs.get(hit.page.id)!, W = pi.width, H = pi.height
        const c = applyT(hit.T, { x: cam.x, y: cam.y })
        let dx = hit.T.a * cam.dx - hit.T.b * cam.dy, dy = hit.T.b * cam.dx + hit.T.a * cam.dy
        const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl
        const info = planInfo.get(hit.page.id)
        const pxm = info ? Math.sqrt(info.k) : W / 60
        const range = 12 * pxm // px
        const half = Math.max(cam.half, 0.5)
        const vis = { chairs: 0, tables: 0 }
        for (const pd of planOf.values()) if (pd.page_id === hit.page.id) for (const it of pd.items) {
          const vx = it.x * W - c.x, vy = it.y * H - c.y, d = Math.hypot(vx, vy); if (d > range || d < 1) continue
          const ang = Math.acos(Math.max(-1, Math.min(1, (vx * dx + vy * dy) / d)))
          if (ang <= half) { if (it.t === 'c') vis.chairs++; else vis.tables++ }
        }
        const inView: string[] = []
        let here: string | null = null, hereD = 1e9
        for (const f of found) if (f.page.id === hit.page.id) {
          const sx = f.reg.seed.x * W - c.x, sy = f.reg.seed.y * H - c.y, d = Math.hypot(sx, sy)
          if (d < range && Math.acos(Math.max(-1, Math.min(1, (sx * dx + sy * dy) / Math.max(1, d)))) <= half) inView.push(f.reg.label)
          if (d < hereD) { hereD = d; here = f.room.id }
        }
        let cadInfo: CameraData['cad'] | undefined
        const cm = cadOf.get(hit.page.id)
        if (cm) {
          const g = cm.fp.geometry!, cp = applyT(cm.T, c)
          const R = g.rooms.map(r => ({ r, polys: roomPolys(r).map(pl => pl.map(p => [p[0] * g.w, p[1] * g.h])) }))
          const hr = R.find(x => x.polys.some(pl => inPoly(pl, cp.x, cp.y)))
          const rangePt = 12 / g.m_per_pt, cdx = cm.T.a * dx - cm.T.b * dy, cdy = cm.T.b * dx + cm.T.a * dy, cl = Math.hypot(cdx, cdy) || 1
          const vr: string[] = []
          for (const x of R) { const vx = x.r.cx * g.w - cp.x, vy = x.r.cy * g.h - cp.y, d = Math.hypot(vx, vy); if (d < 1 || d > rangePt) continue; if (Math.acos(Math.max(-1, Math.min(1, (vx * cdx + vy * cdy) / (d * cl)))) <= half) vr.push(`${x.r.names[0] ?? '#' + x.r.id} (${x.r.area_m2} m²)`) }
          cadInfo = { floor_label: cm.floor_label, room_id: hr?.r.id ?? null, names: hr?.r.names ?? [], area_m2: hr?.r.area_m2 ?? null, view_rooms: vr }
        }
        // phòng mà camera đang đứng: ưu tiên vùng phòng chứa điểm camera, nếu không thì theo tên trong bản vẽ gốc
        const camRoom = roomOfPoint(found, hit.page.id, W, H, c) ?? (cadInfo?.names.length ? rooms.map(r => ({ r, s: Math.max(0, ...cadInfo!.names.map(n => matchScore(n, r))) })).sort((a, b) => b.s - a.s).filter(x => x.s >= 0.5)[0]?.r.id ?? null : null)
        located.push({
          plan_page_id: hit.page.id, plan_page_no: hit.page.page_no, inliers: hit.inliers,
          cam: { x: c.x / W, y: c.y / H }, dir: { dx, dy }, half, range: range / W, thumb: thumbN,
          dir_vn: dirWords(dx, dy), cad: cadInfo, visible: vis, rooms_in_view: [...new Set(inView)],
          label: String.fromCharCode(65 + ci), room_id: camRoom ?? here ?? null, src: { x: cam.x / img.width, y: cam.y / img.height },
        })
      }
      if (!located.length) { await supabase.from('pages').update({ camera: { plan_page_id: null, thumb: { x: cams[0].thumb.x / img.width, y: cams[0].thumb.y / img.height, w: cams[0].thumb.w / img.width, h: cams[0].thumb.h / img.height } }, views: null }).eq('id', pg.id); continue }
      // ghép camera ↔ ô ảnh: theo thứ tự (AI sẽ kiểm lại khi phân tích phòng)
      const rs = rects.get(pg.page_no) ?? []
      let views: PageViews | null = null
      if (located.length >= 2 && rs.length >= 2) {
        const n = Math.min(located.length, rs.length)
        views = { rects: rs, cams: located, pair: rs.map((_, i) => (i < n ? i : -1)), pairing: 'assumed', conf: 0.4 }
      }
      await must(supabase.from('pages').update({ camera: located[0], views }).eq('id', pg.id)); ok++
      log(`Trang ${pg.page_no} (${room.code}): ${located.length} camera${rs.length >= 2 ? `, ${rs.length} ô ảnh` : ''} – ${located.map(c => `${c.label}: nhìn ${c.dir_vn}, ~${c.visible.chairs} ghế`).join(' | ')}`)
    } catch (e) { log(`Trang ${pg.page_no}: lỗi đọc camera – ${String(e)}`) }
  }
  feats.forEach(freeFeat)
  log(`Xong: ${planOf.size}/${rooms.length} phòng có số liệu mặt bằng, ${ok}/${renders.length} trang phối cảnh định vị được camera.`)
  await fillPlanQty(project)
}

// ------------------------------------------------------------------ dùng dữ liệu mặt bằng
const CHAIR = /gh[eế]|chair|stool|sofa/i, TABLE = /b[aà]n\b|table|desk/i
const isChair = (e: Entry) => e.group_code === 'FF' && /gh[eế]|chair|stool/i.test(`${e.name_vn} ${e.name_en ?? ''}`) && !TABLE.test(e.name_vn)
const isTable = (e: Entry) => e.group_code === 'FF' && TABLE.test(`${e.name_vn} ${e.name_en ?? ''}`) && !CHAIR.test(e.name_vn)

/** Điền số lượng ghế/bàn từ mặt bằng (ước lượng) + cảnh báo khi lệch nhiều so với số AI đếm trên phối cảnh */
export async function fillPlanQty(project: Project) {
  const rooms = await must(supabase.from('rooms').select('*').eq('project_id', project.id)) as (Room & { plan?: PlanData | null })[]
  const entries = await must(supabase.from('entries').select('*').eq('project_id', project.id)) as Entry[]
  if (!entries.length) return
  const occ = await must(supabase.from('occurrences').select('*').in('entry_id', entries.map(e => e.id))) as Occurrence[]
  await supabase.from('warnings').delete().eq('project_id', project.id).like('text', '[Mặt bằng]%')
  for (const e of entries) {
    const kind = isChair(e) ? 'chairs' : isTable(e) ? 'tables' : null; if (!kind) continue
    const inRooms = [...new Set(occ.filter(o => o.entry_id === e.id && o.room_id).map(o => o.room_id!))].map(id => rooms.find(r => r.id === id)).filter((r): r is Room & { plan: PlanData } => !!r?.plan)
    if (!inRooms.length) continue
    // Mỗi phòng chỉ có 1 loại ghế/bàn chính → nếu phòng có nhiều mã cùng loại, chỉ gợi ý trong ghi chú
    const parts = inRooms.map(r => ({ r, n: r.plan.counts[kind] }))
    const total = parts.reduce((s, p) => s + p.n, 0)
    const sameKind = (r: Room) => entries.filter(x => (kind === 'chairs' ? isChair(x) : isTable(x)) && occ.some(o => o.entry_id === x.id && o.room_id === r.id)).length
    const single = parts.every(p => sameKind(p.r) === 1)
    const note = `Đếm tự động trên mặt bằng: ${parts.map(p => `${p.r.code} ${p.n}`).join(', ')} (ước lượng, cần kiểm)${single ? '' : ' – phòng có nhiều loại cùng nhóm nên chưa tự điền'}`
    if (single && total > 0 && (e.qty == null || (e.qty_note ?? '').startsWith('Đếm tự động'))) {
      await supabase.from('entries').update({ qty: total, unit: e.unit ?? 'cái', qty_flag: 'warn', qty_note: note }).eq('id', e.id)
    } else if (!(e.qty_note ?? '').startsWith('Đếm tự động') && e.qty_flag !== 'ok') {
      await supabase.from('entries').update({ qty_note: note }).eq('id', e.id)
    }
    for (const p of parts) {
      const ai = occ.filter(o => o.entry_id === e.id && o.room_id === p.r.id && o.qty != null).reduce((s, o) => s + (o.qty ?? 0), 0)
      if (ai > 0 && p.n > 0 && Math.abs(ai - p.n) / Math.max(ai, p.n) > 0.4)
        await supabase.from('warnings').insert({ project_id: project.id, room_id: p.r.id, text: `[Mặt bằng] ${e.code} ${e.name_vn}: AI đếm ${ai} trên phối cảnh, mặt bằng ước tính ${p.n} – lệch nhiều, cần kiểm lại.` })
    }
  }
}

/** Đoạn mô tả mặt bằng/camera gửi kèm cho AI khi nhìn ảnh phối cảnh */
export function planContext(room: Room & { plan?: PlanData | null }, page: Page & { camera?: CameraData | null }, camOverride?: CameraData | null): string | null {
  const parts: string[] = []
  if (room.plan) parts.push(`Mặt bằng phòng (tự đo, ước lượng): ${Math.round(room.plan.area_m2)} m², khoảng ${room.plan.counts.chairs} ghế và ${room.plan.counts.tables} bàn.`)
  const c = camOverride ?? page.camera
  if (c?.plan_page_id) {
    parts.push(`Góc chụp: camera ${c.dir_vn} trên mặt bằng; trong tầm nhìn có khoảng ${c.visible.chairs} ghế, ${c.visible.tables} bàn.`)
    if (c.cad?.room_id) parts.push(`Theo bản vẽ gốc ${c.cad.floor_label}: camera đặt trong ${c.cad.names[0] ?? 'phòng #' + c.cad.room_id}${c.cad.area_m2 ? ` (${c.cad.area_m2} m²)` : ''}${c.cad.view_rooms.length ? `; trong tầm nhìn: ${c.cad.view_rooms.join(', ')}` : ''}.`)
    if (c.rooms_in_view.length) parts.push(`Khu vực trong tầm nhìn: ${c.rooms_in_view.join('; ')}.`)
  }
  return parts.length ? parts.join(' ') + ' Chỉ dùng làm tham chiếu để đếm đúng số lượng; vẫn chỉ liệt kê thứ nhìn thấy.' : null
}
