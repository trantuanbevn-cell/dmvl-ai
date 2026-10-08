import { supabase, BUCKET, signedUrl, signedUrls } from './supabase'
import { renderPdf, cleanText } from './pdf'
import { callAI } from './ai'
import { sampleColor, normalizeAIBox } from './crop'
import { GROUPS, CATEGORIES } from './codes'
import { autoBackup } from './backup'
import { classifyLocal, norm as normT } from './classify'
import { inferForRoom } from './infer'
import { specPatch } from './specs'
import { planContext, fillPlanQty } from './planPipeline'
import type { Rect } from './renders'
import { autoMerge } from './merge'
import { libFill, loadLibrary, syncLibrary } from './matLibrary'
import { cropBase64, cropCanvas } from './crop'
import type { PageViews, CameraData } from './planPipeline'
import type { Project, Room, Page, Entry, Occurrence } from './types'

type Log = (msg: string) => void
const GROUP_SET = new Set(GROUPS.map(g => g.code))
const CAT_SET = new Set(CATEGORIES.map(c => c.key))
const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim()

async function must<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message ?? String(error))
  return data
}

// ---------------------------------------------------------------- 1. Tải PDF → ảnh trang
export async function uploadPdf(project: Project, file: File, log: Log) {
  await autoBackup(project, 'Tự động trước khi tải PDF mới')
  log(`Đang tải PDF lên kho (${(file.size / 1e6).toFixed(1)} MB)...`)
  const pdfPath = `${project.id}/source.pdf`
  await must(supabase.storage.from(BUCKET).upload(pdfPath, file, { upsert: true, contentType: 'application/pdf' }))
  await must(supabase.from('pages').delete().eq('project_id', project.id))
  await must(supabase.from('rooms').delete().eq('project_id', project.id))
  await must(supabase.from('entries').delete().eq('project_id', project.id))
  log('Đang đọc và chuyển từng trang thành ảnh...')
  const pages = await renderPdf(file, (i, n) => log(`  Trang ${i}/${n}`))
  for (const p of pages) {
    const base = `${project.id}/pages/p${pad(p.page_no, 3)}`
    await must(supabase.storage.from(BUCKET).upload(`${base}.jpg`, p.large, { upsert: true, contentType: 'image/jpeg' }))
    await must(supabase.storage.from(BUCKET).upload(`${base}_t.jpg`, p.thumb, { upsert: true, contentType: 'image/jpeg' }))
    await must(supabase.from('pages').insert({ project_id: project.id, page_no: p.page_no, image_path: `${base}.jpg`, thumb_path: `${base}_t.jpg`, width: p.width, height: p.height, page_text: cleanText(p.text) }))
    log(`  Đã lưu trang ${p.page_no}`)
  }
  await must(supabase.from('projects').update({ pdf_path: pdfPath, status: 'pages_ready' }).eq('id', project.id))
  log(`Xong: ${pages.length} trang.`)
}

// ---------------------------------------------------------------- 2a. Phân loại trang + gom phòng KHÔNG dùng AI
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())
export async function classifyLocalPages(project: Project, log: Log) {
  await autoBackup(project, 'Tự động trước khi phân loại lại trang')
  const pages = await must(supabase.from('pages').select('*').eq('project_id', project.id).order('page_no')) as Page[]
  const res = classifyLocal(pages.map(p => ({ page_no: p.page_no, text: p.page_text })))
  await must(supabase.from('warnings').delete().eq('project_id', project.id))
  await must(supabase.from('rooms').delete().eq('project_id', project.id))
  const rooms = new Map<string, { room: Room; counts: any[]; mismatch: Set<string>; pages: number[] }>()
  let n = 0
  for (const r of res) {
    if (!r.room_key) continue
    let x = rooms.get(r.room_key)
    if (!x) {
      n++
      const room = await must(supabase.from('rooms').insert({
        project_id: project.id, code: `R${pad(n)}`, name_vn: r.room_name_vn ?? r.room_title, name_en: titleCase(r.room_title ?? ''), room_type: r.room_type, sort: n,
      }).select().single()) as Room
      x = { room, counts: [], mismatch: new Set(), pages: [] }
      rooms.set(r.room_key, x)
    }
    x.pages.push(r.page_no)
    if (r.box_title && normT(r.box_title) !== r.room_key) x.mismatch.add(r.box_title)
    else if (!x.counts.length && r.counts.length) x.counts = r.counts
  }
  // Số liệu giống hệt phòng khác → nghi chép nhầm
  const list = [...rooms.values()]
  for (const x of list) {
    const warn: string[] = []
    if (x.mismatch.size) warn.push(`Ô số liệu trên trang ghi tên "${[...x.mismatch].join(', ')}" – khác tiêu đề phòng, có thể bị chép nhầm từ phòng khác. Không dùng số liệu này để đếm.`)
    const dup = x.counts.length ? list.find(y => y !== x && y.counts.length && JSON.stringify(y.counts.map(c => [c.label, c.qty])) === JSON.stringify(x.counts.map(c => [c.label, c.qty]))) : undefined
    if (dup && list.indexOf(dup) < list.indexOf(x)) warn.push(`Số liệu trùng hoàn toàn với ${dup.room.code} ${dup.room.name_vn} – nghi chép nhầm, đã bỏ qua.`)
    const counts = warn.length ? [] : x.counts
    await must(supabase.from('rooms').update({ concept_counts: counts }).eq('id', x.room.id))
    for (const w of warn) await must(supabase.from('warnings').insert({ project_id: project.id, room_id: x.room.id, text: w }))
  }
  for (const r of res) {
    const page = pages.find(p => p.page_no === r.page_no)!
    await must(supabase.from('pages').update({ kind: r.kind, room_id: r.room_key ? rooms.get(r.room_key)!.room.id : null }).eq('id', page.id))
  }
  await must(supabase.from('projects').update({ status: 'classified' }).eq('id', project.id))
  const unknown = res.filter(r => r.kind === 'unknown').length
  log(`Xong (không dùng AI): ${rooms.size} phòng, ${res.filter(r => r.kind === 'render').length} trang phối cảnh, ${res.filter(r => r.kind === 'plan').length} mặt bằng.` + (unknown ? ` ${unknown} trang không có chữ – hãy gán tay hoặc dùng "AI phân loại".` : ''))
}

// ---------------------------------------------------------------- 2b. Phân loại bằng AI (chỉ dùng cho PDF scan không có chữ)
export async function classifyPages(project: Project, log: Log) {
  await autoBackup(project, 'Tự động trước khi AI phân loại trang')
  const pages = await must(supabase.from('pages').select('*').eq('project_id', project.id).order('page_no')) as Page[]
  const urls = await signedUrls(pages.map(p => p.thumb_path ?? p.image_path))
  const results: any[] = []
  const known: string[] = []
  for (let i = 0; i < pages.length; i += 8) {
    const batch = pages.slice(i, i + 8)
    log(`AI đang phân loại trang ${batch[0].page_no}–${batch[batch.length - 1].page_no}...`)
    const r = await callAI('classify_pages', {
      known_rooms: known,
      pages: batch.map(p => ({ page_no: p.page_no, url: urls[p.thumb_path ?? p.image_path], text: p.page_text })),
    })
    for (const pg of r.tool?.pages ?? []) {
      results.push(pg)
      if (pg.room_name_vn && !known.includes(pg.room_name_vn)) known.push(pg.room_name_vn)
    }
  }
  // Tạo phòng theo thứ tự xuất hiện
  await must(supabase.from('rooms').delete().eq('project_id', project.id))
  const roomByKey = new Map<string, Room>()
  let n = 0
  for (const pg of results) {
    if (!pg.room_name_vn || pg.kind === 'cover' || pg.kind === 'moodboard') continue
    const key = norm(pg.room_name_vn)
    let room = roomByKey.get(key)
    if (!room) {
      n++
      room = await must(supabase.from('rooms').insert({
        project_id: project.id, code: `R${pad(n)}`, name_vn: pg.room_name_vn, name_en: pg.room_name_en ?? null,
        room_type: pg.room_type ?? 'other', concept_counts: pg.concept_counts ?? [], sort: n,
      }).select().single()) as Room
      roomByKey.set(key, room)
    } else if ((!room.concept_counts || room.concept_counts.length === 0) && pg.concept_counts?.length) {
      room.concept_counts = pg.concept_counts
      await must(supabase.from('rooms').update({ concept_counts: pg.concept_counts }).eq('id', room.id))
    }
  }
  for (const pg of results) {
    const page = pages.find(p => p.page_no === pg.page_no); if (!page) continue
    const room = pg.room_name_vn ? roomByKey.get(norm(pg.room_name_vn)) : undefined
    await must(supabase.from('pages').update({ kind: pg.kind ?? 'other', room_id: room?.id ?? null }).eq('id', page.id))
  }
  await must(supabase.from('projects').update({ status: 'classified' }).eq('id', project.id))
  log(`Xong: ${roomByKey.size} phòng.`)
}

// ---------------------------------------------------------------- 3. Phân tích phòng
// AI CHỈ làm 1 việc: nhìn từng ảnh phối cảnh và liệt kê vật liệu/đồ đạc + khung vị trí.
// Màu, suy luận hạng mục thiếu, thông số kỹ thuật, tính chất, tiêu chuẩn: phần mềm tự làm.
type AIItem = {
  ref: string; parent_ref?: string; match_code?: string; group_code: string; category: string; name_vn: string; name_en?: string
  part_vn?: string; material_vn: string; material_en?: string; bbox?: number[]; box_2d?: number[]; qty?: number; unit?: string; qty_basis?: string; confidence?: number
}

class CodeBook {
  max = new Map<string, number>()
  byCode = new Map<string, Entry>()
  constructor(entries: Entry[]) { for (const e of entries) this.add(e) }
  add(e: Entry) {
    this.byCode.set(e.code, e)
    const m = /^([A-Z]+)-(\d+)/.exec(e.code)
    if (m) this.max.set(m[1], Math.max(this.max.get(m[1]) ?? 0, Number(m[2])))
  }
  next(group: string) { const n = (this.max.get(group) ?? 0) + 1; this.max.set(group, n); return `${group}-${pad(n)}` }
}

function qtyFlag(it: { qty?: number; qty_basis?: string; unit?: string }): { flag: string; note: string } {
  if (it.qty != null && (it.qty_basis === 'concept_text' || it.qty_basis === 'counted_plan')) return { flag: 'ok', note: it.qty_basis === 'concept_text' ? 'Theo số liệu concept' : 'Đếm trên mặt bằng' }
  if (it.qty != null && it.qty_basis === 'counted_render') return { flag: 'warn', note: 'Đếm trên phối cảnh – cần kiểm tra' }
  if ((it.unit ?? '').includes('m')) return { flag: 'warn', note: 'Đo trên mặt bằng / mặt đứng' }
  return { flag: 'warn', note: 'Chưa xác định – nhập tay' }
}

/** Ghép trùng không cần AI: cùng nhóm + tên/vật liệu gần giống */
function similar(a: string, b: string) {
  const A = new Set(normT(a).split(' ').filter(w => w.length > 1)), B = new Set(normT(b).split(' ').filter(w => w.length > 1))
  if (!A.size || !B.size) return 0
  let k = 0; A.forEach(w => { if (B.has(w)) k++ })
  return k / Math.min(A.size, B.size)
}

/** Làm sạch mọi chuỗi trong kết quả AI trước khi lưu (tránh lỗi "unsupported Unicode escape sequence") */
function cleanItem<T extends Record<string, any>>(o: T): T {
  const r: any = {}
  for (const [k, v] of Object.entries(o)) r[k] = typeof v === 'string' ? cleanText(v).trim() : v
  return r
}

async function applyItems(project: Project, room: Room, rawItems: AIItem[], page: Page, book: CodeBook, log: Log, view?: { rect: Rect; roomId?: string | null }) {
  const items = rawItems.filter(i => i && i.name_vn).map(cleanItem)
  const refToEntry = new Map<string, Entry>()
  const ordered = [...items.filter(i => !i.parent_ref), ...items.filter(i => i.parent_ref)]
  let created = 0, linked = 0
  for (const it of ordered) {
    const group = GROUP_SET.has(it.group_code) ? it.group_code : 'DC'
    const category = CAT_SET.has(it.category) ? it.category : 'decor'
    let entry = it.match_code && group !== 'AW' ? book.byCode.get(it.match_code.trim()) : undefined
    if (!entry && group !== 'AW') {
      // tự ghép với mã đã có nếu cùng nhóm và mô tả gần như trùng
      for (const e of book.byCode.values()) if (e.group_code === group && similar(`${e.name_vn} ${e.material_vn ?? ''}`, `${it.name_vn} ${it.material_vn}`) >= 0.8) { entry = e; break }
    }
    const q = qtyFlag(it)
    if (!entry) {
      entry = await must(supabase.from('entries').insert({
        project_id: project.id, code: book.next(group), group_code: group, category,
        name_vn: it.name_vn, name_en: it.name_en ?? null, part_vn: it.part_vn ?? null,
        material_vn: it.material_vn ?? null, material_en: it.material_en ?? null,
        qty: it.qty ?? null, unit: it.unit ?? null, qty_flag: q.flag, qty_note: q.note, source: 'image', status: 'pending',
        sort: book.max.get(group) ?? 0,
      }).select().single()) as Entry
      try { const fill = libFill(await loadLibrary(), entry); if (fill) { await must(supabase.from('entries').update(fill).eq('id', entry.id)); Object.assign(entry, fill) } } catch { /* */ }
      book.add(entry); created++
    } else {
      linked++
      if (it.qty != null && it.qty_basis === 'concept_text' && entry.qty == null) {
        await must(supabase.from('entries').update({ qty: it.qty, qty_flag: q.flag, qty_note: q.note }).eq('id', entry.id))
        entry.qty = it.qty
      }
    }
    refToEntry.set(it.ref, entry)
    let box = normalizeAIBox(it)
    if (box && view) { const r = view.rect; box = [+(r.x + box[0] * r.w).toFixed(4), +(r.y + box[1] * r.h).toFixed(4), +(box[2] * r.w).toFixed(4), +(box[3] * r.h).toFixed(4)] }
    const ok = !!box
    await must(supabase.from('occurrences').insert({
      entry_id: entry.id, room_id: view?.roomId ?? room.id, page_id: ok ? page.id : null, category, origin: 'ai',
      bbox: box, qty: it.qty ?? null, confidence: it.confidence ?? null,
    }))
    if (it.parent_ref) {
      const parent = refToEntry.get(it.parent_ref)
      if (parent && parent.id !== entry.id) {
        const line = `${it.part_vn || it.name_vn}: ${entry.code}`
        if (!(parent.composition ?? '').includes(entry.code)) {
          parent.composition = parent.composition ? `${parent.composition}; ${line}` : line
          await must(supabase.from('entries').update({ composition: parent.composition }).eq('id', parent.id))
        }
        if (!entry.parent_id) await must(supabase.from('entries').update({ parent_id: parent.id }).eq('id', entry.id))
      }
    }
  }
  log(`    +${created} mã mới, ${linked} lần gắn vào mã đã có`)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
/** Gọi AI có giãn cách + tự thử lại khi chạm hạn mức miễn phí (429) */
async function callAIPaced(task: string, payload: unknown, log: Log) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await callAI(task, payload)
      if (r.usage) log(`    (token: vào ${r.usage.input_tokens ?? '?'}, ra ${r.usage.output_tokens ?? '?'})`)
      return r
    } catch (e) {
      const msg = String(e)
      if (attempt < 4 && /429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|overloaded/i.test(msg)) {
        const wait = 20 * attempt
        log(`    Chạm giới hạn tốc độ miễn phí – chờ ${wait}s rồi thử lại (${attempt}/3)...`)
        await sleep(wait * 1000)
        continue
      }
      throw e
    }
  }
}

/** Ghép từng ô ảnh với camera đúng trên mặt bằng bằng AI (1 lần/trang, lưu lại); lỗi thì giữ cách ghép theo thứ tự */
async function pairViews(room: Room, page: Page, v: PageViews, url: string, log: Log) {
  if (v.pairing === 'ai') return
  try {
    const t = v.cams[0].thumb, pad = 0.01
    const reg = [Math.max(0, t.x - pad), Math.max(0, t.y - pad), Math.min(1, t.w + 2 * pad), Math.min(1, t.h + 2 * pad)]
    const cv = await cropCanvas(url, reg, 900)
    const g = cv.getContext('2d')!
    g.font = `bold ${Math.round(cv.width / 14)}px sans-serif`; g.lineWidth = 4
    for (const c of v.cams) if (c.src) {
      const x = ((c.src.x - reg[0]) / reg[2]) * cv.width, y = ((c.src.y - reg[1]) / reg[3]) * cv.height
      g.strokeStyle = '#fff'; g.fillStyle = '#0033cc'; g.strokeText(c.label ?? '?', x + 8, y - 8); g.fillText(c.label ?? '?', x + 8, y - 8)
    }
    const plan = { base64: cv.toDataURL('image/jpeg', 0.9).split(',')[1] }
    const renders = await Promise.all(v.rects.map(async (r, i) => ({ idx: i + 1, base64: await cropBase64(url, [r.x, r.y, r.w, r.h], 700) })))
    const res = await callAIPaced('match_views', { plan, cams: v.cams.map(c => ({ label: c.label })), renders, context: `Phòng: ${room.name_vn}.` }, log)
    const ms = (res.tool?.matches ?? []) as { render: number; camera: string; confidence?: number; reason?: string }[]
    const pair = v.rects.map(() => -1), used = new Set<number>(); let conf = 0, n = 0
    for (const m of ms.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))) {
      const ri = m.render - 1, ci = v.cams.findIndex(c => c.label === String(m.camera).trim().toUpperCase())
      if (ri < 0 || ri >= pair.length || ci < 0 || used.has(ci) || pair[ri] >= 0 || (m.confidence ?? 0) < 0.5) continue
      pair[ri] = ci; used.add(ci); conf += m.confidence ?? 0; n++
    }
    if (n) {
      v.pair = pair; v.pairing = 'ai'; v.conf = +(conf / n).toFixed(2)
      await must(supabase.from('pages').update({ views: v, camera: v.cams[pair.find(x => x >= 0)!] }).eq('id', page.id))
      log(`    Ghép camera↔ảnh (AI): ${pair.map((c, i) => `ảnh ${i + 1}→${c >= 0 ? v.cams[c].label : '?'}`).join(', ')}`)
    } else log('    AI chưa chắc cách ghép camera↔ảnh – dùng thứ tự trái→phải (cần kiểm tra)')
  } catch (e) { log(`    Không ghép được bằng AI (${String(e).slice(0, 80)}) – dùng thứ tự trái→phải`) }
}

/** Vị trí do phân tích tạo ra (xoá được khi chạy lại): origin='ai', hoặc dòng cũ chưa đánh dấu có trang & chưa chỉnh tay */
const AI_OCC = 'origin.eq.ai,and(origin.is.null,page_id.not.is.null,view.is.null)'
export async function analyzeRoom(project: Project, room: Room, log: Log) {
  await must(supabase.from('rooms').update({ analysis_status: 'running' }).eq('id', room.id))
  try {
    // trang của phòng này + trang slide dùng chung (một ảnh/camera trong slide thuộc phòng này dù trang gán cho phòng khác)
    const every = await must(supabase.from('pages').select('*').eq('project_id', project.id).order('page_no')) as Page[]
    const all = every.filter(p => p.room_id === room.id || (p.views as PageViews | null)?.cams?.some(c => c.room_id === room.id))
    let pages = all.filter(p => p.kind === 'render')
    if (!pages.length) pages = all.filter(p => p.kind === 'plan')
    if (!pages.length) throw new Error('Phòng chưa có trang phối cảnh nào')
    // Chạy lại AN TOÀN: chỉ xoá các vị trí do phân tích tạo ra. Giữ lại vị trí/hình người dùng tự thêm hoặc đã chỉnh tay, và KHÔNG xoá mã vật liệu nào
    // (mã cũ vẫn còn nên AI nhận lại đúng mã đã sửa thông tin; mã không còn nhận ra sẽ hiện ở tab Kiểm tra “chưa gán phòng”).
    await must(supabase.from('occurrences').delete().eq('room_id', room.id).or(AI_OCC))

    for (const [i, page] of pages.entries()) {
      const entries = await must(supabase.from('entries').select('*').eq('project_id', project.id)) as Entry[]
      const book = new CodeBook(entries)
      log(`  ${room.code} · trang ${page.page_no} (${i + 1}/${pages.length}) – AI đang nhìn ảnh...`)
      const url = await signedUrl(page.image_path)
      const views = page.views as PageViews | null
      const multi = !!(views && views.rects.length >= 2 && views.cams.length >= 2)
      if (!multi) await must(supabase.from('occurrences').delete().eq('page_id', page.id).or(AI_OCC)) // trang 1 ảnh: làm lại sạch; slide nhiều phòng chỉ xoá phần của phòng này (đã xoá ở trên)
      if (views && views.rects.length >= 2 && views.cams.length >= 2) {
        await pairViews(room, page, views, url, log)
        const roomIds = new Set((await must(supabase.from('rooms').select('id').eq('project_id', project.id)) as { id: string }[]).map(x => x.id))
        for (const [vi, rect] of views.rects.entries()) {
          const cam = views.pair[vi] >= 0 ? views.cams[views.pair[vi]] : null
          const label = cam?.label ?? `${vi + 1}`
          if (cam?.room_id && cam.room_id !== room.id && roomIds.has(cam.room_id)) continue // ảnh này thuộc phòng khác của slide – phòng đó tự phân tích phần của nó
          const ents = (await must(supabase.from('entries').select('*').eq('project_id', project.id)) as Entry[])
          const bk = new CodeBook(ents)
          log(`    Ảnh ${vi + 1}/${views.rects.length} (camera ${cam ? label : 'chưa rõ'}) – AI đang nhìn...`)
          const rr = await callAIPaced('analyze_page', {
            room: { name_vn: room.name_vn, room_type: room.room_type, concept_counts: room.concept_counts },
            page: { page_no: page.page_no, base64: await cropBase64(url, [rect.x, rect.y, rect.w, rect.h], 1600), view_label: label, plan_context: planContext(room, page, cam) },
            existing: ents.filter(e => e.source === 'image').map(e => ({ code: e.code, name_vn: e.name_vn, material_vn: e.material_vn })),
          }, log)
          const its = (rr.tool?.items ?? []) as AIItem[]
          log(`      AI nhận diện ${its.length} hạng mục`)
          const rid = cam?.room_id && roomIds.has(cam.room_id) ? cam.room_id : room.id
          await applyItems(project, room, its, page, bk, log, { rect, roomId: rid })
          await sleep(3000)
        }
        await must(supabase.from('pages').update({ analyzed: true }).eq('id', page.id))
        if (i < pages.length - 1) await sleep(4000)
        continue
      }
      const r = await callAIPaced('analyze_page', {
        room: { name_vn: room.name_vn, room_type: room.room_type, concept_counts: room.concept_counts },
        page: { page_no: page.page_no, url, plan_context: planContext(room, page) },
        existing: entries.filter(e => e.source === 'image').map(e => ({ code: e.code, name_vn: e.name_vn, material_vn: e.material_vn })),
      }, log)
      const items = (r.tool?.items ?? []) as AIItem[]
      log(`    AI nhận diện ${items.length} hạng mục`)
      await applyItems(project, room, items, page, book, log)
      await must(supabase.from('pages').update({ analyzed: true }).eq('id', page.id))
      if (i < pages.length - 1) await sleep(4000) // giãn cách để nằm trong hạn mức miễn phí
    }
    await fillColors(project, room)
    try { const m = await autoMerge(await must(supabase.from('entries').select('*').eq('project_id', project.id)) as Entry[]); if (m) log(`  ${room.code} – tự gộp ${m} mã trùng (cùng vật liệu, khác góc nhìn)`) } catch (e) { log(`  (không tự gộp được mã trùng: ${String(e).slice(0, 80)})`) }
    await fillPlanQty(project)
    const added = await applyInference(project, room)
    log(`  ${room.code} – quy tắc suy luận thêm ${added} hạng mục (không dùng AI)`)
    await writeSpecs(project)
    try { await syncLibrary(project.id, await must(supabase.from('entries').select('*').eq('project_id', project.id)) as Entry[]) } catch { /* */ }
    await must(supabase.from('rooms').update({ analysis_status: 'done', analysis_log: null }).eq('id', room.id))
  } catch (e) {
    await supabase.from('rooms').update({ analysis_status: 'error', analysis_log: String(e) }).eq('id', room.id)
    throw e
  }
}

/** Lấy màu chủ đạo từ điểm ảnh của vùng crop (không dùng AI) */
export async function fillColors(project: Project, room?: Room) {
  const entries = await must(supabase.from('entries').select('*').eq('project_id', project.id).is('color_hex', null)) as Entry[]
  if (!entries.length) return
  let q = supabase.from('occurrences').select('*').in('entry_id', entries.map(e => e.id)).not('bbox', 'is', null)
  if (room) q = q.eq('room_id', room.id)
  const occ = await must(q) as Occurrence[]
  const pages = await must(supabase.from('pages').select('*').eq('project_id', project.id)) as Page[]
  const urls = await signedUrls(pages.map(p => p.image_path))
  for (const e of entries) {
    const o = occ.filter(x => x.entry_id === e.id).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]
    const pg = o ? pages.find(p => p.id === o.page_id) : undefined
    if (!o || !pg) continue
    const hex = await sampleColor(urls[pg.image_path], o.bbox!)
    if (hex) await must(supabase.from('entries').update({ color_hex: hex }).eq('id', e.id))
  }
}

/** Áp bộ quy tắc suy luận cho phòng (không dùng AI) – trả về số hạng mục thêm mới */
export async function applyInference(project: Project, room: Room): Promise<number> {
  const entries = await must(supabase.from('entries').select('*').eq('project_id', project.id)) as Entry[]
  const occ = await must(supabase.from('occurrences').select('*').eq('room_id', room.id)) as Occurrence[]
  // bỏ các dòng suy luận cũ của phòng (giữ dòng đã xác nhận)
  const oldInf = occ.filter(o => entries.find(e => e.id === o.entry_id && e.source === 'inferred' && e.status === 'pending'))
  if (oldInf.length) await must(supabase.from('occurrences').delete().in('id', oldInf.map(o => o.id)))
  const ids = new Set(occ.filter(o => !oldInf.includes(o)).map(o => o.entry_id))
  const inRoom = entries.filter(e => ids.has(e.id) && e.status !== 'rejected')
  const book = new CodeBook(entries)
  let added = 0
  for (const x of inferForRoom(room, inRoom)) {
    let e = entries.find(y => y.source === 'inferred' && y.group_code === x.group && y.name_vn === x.name_vn)
    if (!e) {
      e = await must(supabase.from('entries').insert({
        project_id: project.id, code: book.next(x.group), group_code: x.group, category: x.category, name_vn: x.name_vn, name_en: x.name_en,
        material_vn: x.material_vn, qty: x.qty ?? null, unit: x.unit ?? null, qty_flag: x.qty ? 'warn' : 'warn', qty_note: x.qty ? 'Theo số cửa – kiểm tra' : 'Nhập tay',
        source: 'inferred', status: 'pending', note_vn: `SUY LUẬN: ${x.reason}`, note_en: 'Inferred – not shown in render, logically required.',
      }).select().single()) as Entry
      book.add(e); entries.push(e)
    }
    await must(supabase.from('occurrences').insert({ entry_id: e.id, room_id: room.id, category: x.category, note: x.reason, origin: 'ai' }))
    added++
  }
  await cleanupOrphans(project)
  return added
}

/** Viết mô tả, tính chất theo không gian, tiêu chuẩn từ mẫu (không dùng AI) */
export async function writeSpecs(project: Project, opts: { ids?: string[]; force?: boolean } = {}) {
  let entries = await must(supabase.from('entries').select('*').eq('project_id', project.id)) as Entry[]
  entries = opts.ids ? entries.filter(e => opts.ids!.includes(e.id)) : entries.filter(e => opts.force || !e.enriched)
  if (!entries.length) return 0
  const rooms = await must(supabase.from('rooms').select('*').eq('project_id', project.id)) as Room[]
  const occ = await must(supabase.from('occurrences').select('entry_id,room_id').in('entry_id', entries.map(e => e.id))) as Occurrence[]
  for (const e of entries) {
    const rs = rooms.filter(r => occ.some(o => o.entry_id === e.id && o.room_id === r.id))
    await must(supabase.from('entries').update(specPatch(e, rs)).eq('id', e.id))
  }
  return entries.length
}

/** Xoá các mã do AI/quy tắc sinh ra mà không còn xuất hiện ở phòng nào */
export async function cleanupOrphans(project: Project) {
  const entries = await must(supabase.from('entries').select('id,source,status').eq('project_id', project.id)) as Entry[]
  if (!entries.length) return
  const occ = await must(supabase.from('occurrences').select('entry_id').in('entry_id', entries.map(e => e.id))) as Occurrence[]
  const used = new Set(occ.map(o => o.entry_id))
  const orphan = entries.filter(e => !used.has(e.id) && e.source !== 'manual' && e.status === 'pending').map(e => e.id)
  if (orphan.length) await must(supabase.from('entries').delete().in('id', orphan))
}

/** Chọn một sản phẩm từ thư viện cho mã */
export async function applyProduct(entry: Entry, p: { brand: string; product_code: string; product_name?: string | null; url?: string | null; image_url?: string | null }) {
  await must(supabase.from('entries').update({
    brand: p.brand, product_code: p.product_code, product_name: p.product_name ?? null, product_url: p.url ?? null, product_image_url: p.image_url ?? null,
  }).eq('id', entry.id))
}

// ---------------------------------------------------------------- Thêm tay
export type ManualExtra = Partial<Pick<Entry, 'material_vn' | 'material_en' | 'color_hex' | 'part_vn' | 'part_en' | 'parent_id' | 'name_en' | 'desc_vn' | 'desc_en' | 'perf_vn' | 'perf_en' | 'standards' | 'brand' | 'product_name' | 'origin' | 'unit'>>
/** Các trường được sao chép khi nhân đôi một vật liệu (không chép mã hãng/link/ảnh mẫu vì thường khác nhau) */
export const cloneExtra = (e: Entry): ManualExtra => ({ name_en: e.name_en, part_vn: e.part_vn, part_en: e.part_en, parent_id: e.parent_id, material_vn: e.material_vn ?? undefined, material_en: e.material_en, color_hex: e.color_hex, desc_vn: e.desc_vn, desc_en: e.desc_en, perf_vn: e.perf_vn, perf_en: e.perf_en, standards: e.standards, brand: e.brand, product_name: null, origin: e.origin, unit: e.unit })
export async function addManualEntry(project: Project, room: Room | null, group: string, name: string, category: string, extra: ManualExtra = {}) {
  // nhiều người cùng thêm: nếu trùng mã (người khác vừa lấy) thì lấy mã kế tiếp và thử lại
  for (let attempt = 0; attempt < 5; attempt++) {
    const entries = await must(supabase.from('entries').select('code').eq('project_id', project.id)) as Entry[]
    const book = new CodeBook(entries as Entry[])
    const { data, error } = await supabase.from('entries').insert({
      project_id: project.id, code: book.next(group), group_code: group, category, name_vn: name, source: 'manual', status: 'pending', qty_flag: 'warn', qty_note: 'Nhập tay', ...extra,
    }).select().single()
    if (error) { if (error.code === '23505' && attempt < 4) continue; throw new Error(error.message) }
    const e = data as Entry
    if (room) await must(supabase.from('occurrences').insert({ entry_id: e.id, room_id: room.id, category, origin: 'manual' }))
    return e
  }
  throw new Error('Không tạo được mã mới, hãy thử lại')
}
