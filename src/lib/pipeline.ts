import { supabase, BUCKET, signedUrl, signedUrls } from './supabase'
import { renderPdf } from './pdf'
import { callAI } from './ai'
import { cropBase64 } from './crop'
import { GROUPS, CATEGORIES } from './codes'
import { loadSettings } from './settings'
import type { Project, Room, Page, Entry, Occurrence, Candidate } from './types'

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
    await must(supabase.from('pages').insert({ project_id: project.id, page_no: p.page_no, image_path: `${base}.jpg`, thumb_path: `${base}_t.jpg`, width: p.width, height: p.height, page_text: p.text }))
    log(`  Đã lưu trang ${p.page_no}`)
  }
  await must(supabase.from('projects').update({ pdf_path: pdfPath, status: 'pages_ready' }).eq('id', project.id))
  log(`Xong: ${pages.length} trang.`)
}

// ---------------------------------------------------------------- 2. Phân loại trang + gom phòng
export async function classifyPages(project: Project, log: Log) {
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
type AIItem = {
  ref: string; parent_ref?: string; match_code?: string; group_code: string; category: string; name_vn: string; name_en?: string
  part_vn?: string; part_en?: string; material_vn: string; material_en?: string; color_hex?: string; bbox?: number[]; page_no?: number
  qty?: number; unit?: string; qty_basis?: string; source: 'image' | 'inferred'; reason?: string; confidence: number
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

function qtyFlag(it: AIItem): { flag: string; note: string } {
  if (it.qty != null && (it.qty_basis === 'concept_text' || it.qty_basis === 'counted_plan')) return { flag: 'ok', note: it.qty_basis === 'concept_text' ? 'Theo số liệu concept' : 'Đếm trên mặt bằng' }
  if (it.qty != null && it.qty_basis === 'counted_render') return { flag: 'warn', note: 'Đếm trên phối cảnh – cần kiểm tra' }
  if ((it.unit ?? '').includes('m')) return { flag: 'warn', note: 'Đo trên mặt bằng / mặt đứng' }
  return { flag: 'warn', note: 'Chưa xác định – nhập tay' }
}

async function applyItems(project: Project, room: Room, items: AIItem[], pageByNo: Map<number, Page>, defaultPage: Page | null, book: CodeBook, log: Log) {
  const refToEntry = new Map<string, Entry>()
  const ordered = [...items.filter(i => !i.parent_ref), ...items.filter(i => i.parent_ref)]
  let created = 0, linked = 0
  for (const it of ordered) {
    const group = GROUP_SET.has(it.group_code) ? it.group_code : 'DC'
    const category = CAT_SET.has(it.category) ? it.category : 'decor'
    let entry = it.match_code ? book.byCode.get(it.match_code.trim()) : undefined
    const q = qtyFlag(it)
    if (!entry) {
      const code = book.next(group)
      entry = await must(supabase.from('entries').insert({
        project_id: project.id, code, group_code: group, category,
        name_vn: it.name_vn, name_en: it.name_en ?? null, part_vn: it.part_vn ?? null, part_en: it.part_en ?? null,
        material_vn: it.material_vn ?? null, material_en: it.material_en ?? null,
        color_hex: /^#[0-9a-f]{6}$/i.test(it.color_hex ?? '') ? it.color_hex : null,
        qty: it.qty ?? null, unit: it.unit ?? null, qty_flag: q.flag, qty_note: q.note,
        source: it.source === 'inferred' ? 'inferred' : 'image', status: 'pending',
        note_vn: it.source === 'inferred' && it.reason ? `SUY LUẬN: ${it.reason}` : null,
        sort: book.max.get(group) ?? 0,
      }).select().single()) as Entry
      book.add(entry); created++
    } else {
      linked++
      // cộng dồn số lượng khi có ở nhiều phòng
      if (it.qty != null) {
        const newQty = (entry.qty ?? 0) + it.qty
        const flag = entry.qty_flag === 'ok' && q.flag === 'ok' ? 'ok' : 'warn'
        await must(supabase.from('entries').update({ qty: newQty, qty_flag: flag }).eq('id', entry.id))
        entry.qty = newQty; entry.qty_flag = flag
      }
    }
    refToEntry.set(it.ref, entry)
    const page = (it.page_no != null ? pageByNo.get(it.page_no) : undefined) ?? defaultPage
    await must(supabase.from('occurrences').insert({
      entry_id: entry.id, room_id: room.id, page_id: it.bbox?.length === 4 ? page?.id ?? null : null, category,
      bbox: it.bbox?.length === 4 ? it.bbox : null, qty: it.qty ?? null, confidence: it.confidence ?? null,
      note: it.source === 'inferred' ? it.reason ?? 'Suy luận' : null,
    }))
    // Gắn vật liệu cấu thành vào đồ chứa nó
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

export async function analyzeRoom(project: Project, room: Room, log: Log, opts: { review?: boolean } = { review: true }) {
  const settings = await loadSettings()
  await must(supabase.from('rooms').update({ analysis_status: 'running' }).eq('id', room.id))
  try {
    const pages = (await must(supabase.from('pages').select('*').eq('room_id', room.id).order('page_no')) as Page[])
      .filter(p => p.kind === 'render' || p.kind === 'plan')
    if (!pages.length) throw new Error('Phòng chưa có trang phối cảnh/mặt bằng nào')
    const pageByNo = new Map(pages.map(p => [p.page_no, p]))
    const rulesTxt = settings.rules.map(r => `- Khi: ${r.trigger} → ${r.item} [${r.group}]`)
    // Đồ đã có ở phòng này thì xoá để chạy lại sạch
    await must(supabase.from('occurrences').delete().eq('room_id', room.id))
    await must(supabase.from('warnings').delete().eq('room_id', room.id))
    await cleanupOrphans(project)

    // render trước, plan sau (plan chủ yếu để đếm số lượng)
    const order = [...pages.filter(p => p.kind === 'render'), ...pages.filter(p => p.kind === 'plan')]
    for (const page of order) {
      const entries = await must(supabase.from('entries').select('*').eq('project_id', project.id)) as Entry[]
      const book = new CodeBook(entries)
      log(`  ${room.code} · trang ${page.page_no} (${page.kind}) – AI đang bóc tách...`)
      const url = await signedUrl(page.image_path)
      const r = await callAI('analyze_page', {
        room: { name_vn: room.name_vn, room_type: room.room_type, concept_counts: room.concept_counts },
        page: { page_no: page.page_no, kind: page.kind, url, text: page.page_text },
        existing: entries.map(e => ({ code: e.code, name_vn: e.name_vn, material_vn: e.material_vn })),
        rules: rulesTxt,
      }, n => { if (n % 4000 < 40) log(`    ...${n} ký tự`) })
      const items = (r.tool?.items ?? []) as AIItem[]
      log(`    AI trả ${items.length} hạng mục`)
      await applyItems(project, room, items.map(i => ({ ...i, page_no: page.page_no })), pageByNo, page, book, log)
      for (const w of r.tool?.warnings ?? []) await must(supabase.from('warnings').insert({ project_id: project.id, room_id: room.id, text: `Trang ${page.page_no}: ${w}` }))
      if ((!room.concept_counts || !room.concept_counts.length) && r.tool?.concept_counts?.length) {
        room.concept_counts = r.tool.concept_counts
        await must(supabase.from('rooms').update({ concept_counts: room.concept_counts }).eq('id', room.id))
      }
      await must(supabase.from('pages').update({ analyzed: true }).eq('id', page.id))
    }

    if (opts.review !== false) {
      log(`  ${room.code} – AI soát lại lần 2 (tìm hạng mục còn thiếu)...`)
      const entries = await must(supabase.from('entries').select('*').eq('project_id', project.id)) as Entry[]
      const occ = await must(supabase.from('occurrences').select('entry_id,category').eq('room_id', room.id)) as Occurrence[]
      const ids = new Set(occ.map(o => o.entry_id))
      const current = entries.filter(e => ids.has(e.id)).map(e => ({ code: e.code, category: e.category, name_vn: e.name_vn, source: e.source }))
      const checklist = settings.checklist.filter(c => c.req[room.room_type] && c.req[room.room_type] !== 'na')
        .map(c => `${c.req[room.room_type] === 'required' ? '[BẮT BUỘC]' : '[thường có]'} ${c.label}`)
      const renderPages = pages.filter(p => p.kind === 'render').slice(0, 10)
      const urls = await signedUrls(renderPages.map(p => p.image_path))
      const r = await callAI('review_room', {
        room: { name_vn: room.name_vn, room_type: room.room_type },
        current, checklist, rules: rulesTxt,
        pages: renderPages.map(p => ({ page_no: p.page_no, url: urls[p.image_path] })),
      })
      const items = (r.tool?.items ?? []) as AIItem[]
      log(`    Soát lại: thêm ${items.length} hạng mục`)
      await applyItems(project, room, items, pageByNo, null, new CodeBook(entries), log)
      for (const w of r.tool?.warnings ?? []) await must(supabase.from('warnings').insert({ project_id: project.id, room_id: room.id, text: w }))
    }
    await must(supabase.from('rooms').update({ analysis_status: 'done', analysis_log: null }).eq('id', room.id))
  } catch (e) {
    await supabase.from('rooms').update({ analysis_status: 'error', analysis_log: String(e) }).eq('id', room.id)
    throw e
  }
}

/** Xoá các mã do AI sinh ra mà không còn xuất hiện ở phòng nào (sau khi chạy lại) */
export async function cleanupOrphans(project: Project) {
  const entries = await must(supabase.from('entries').select('id,source,status').eq('project_id', project.id)) as Entry[]
  if (!entries.length) return
  const occ = await must(supabase.from('occurrences').select('entry_id').in('entry_id', entries.map(e => e.id))) as Occurrence[]
  const used = new Set(occ.map(o => o.entry_id))
  const orphan = entries.filter(e => !used.has(e.id) && e.source !== 'manual' && e.status === 'pending').map(e => e.id)
  if (orphan.length) await must(supabase.from('entries').delete().in('id', orphan))
}

// ---------------------------------------------------------------- 4. Viết thông số kỹ thuật
export async function enrichEntries(project: Project, log: Log, onlyIds?: string[]) {
  const settings = await loadSettings()
  let entries = await must(supabase.from('entries').select('*').eq('project_id', project.id).order('code')) as Entry[]
  entries = onlyIds ? entries.filter(e => onlyIds.includes(e.id)) : entries.filter(e => !e.enriched && e.status !== 'rejected')
  if (!entries.length) { log('Không có mã nào cần viết thông số.'); return }
  const rooms = await must(supabase.from('rooms').select('*').eq('project_id', project.id)) as Room[]
  const occ = await must(supabase.from('occurrences').select('entry_id,room_id').in('entry_id', entries.map(e => e.id))) as Occurrence[]
  const perfTxt = settings.perf.map(p => `${p.space} / ${p.surface}: ${p.vn} (${p.ref})`).join('\n')
  for (let i = 0; i < entries.length; i += 8) {
    const batch = entries.slice(i, i + 8)
    log(`AI viết thông số ${batch.map(e => e.code).join(', ')}...`)
    const r = await callAI('enrich_entries', {
      project: { name: project.name },
      perf_table: perfTxt,
      entries: batch.map(e => ({
        code: e.code, group_code: e.group_code, name_vn: e.name_vn, part_vn: e.part_vn, material_vn: e.material_vn, composition: e.composition,
        source: e.source, current_note: e.note_vn,
        rooms: [...new Set(occ.filter(o => o.entry_id === e.id).map(o => o.room_id))].map(id => { const rm = rooms.find(x => x.id === id); return rm ? `${rm.name_vn} (${rm.room_type})` : '' }),
      })),
    })
    for (const s of r.tool?.entries ?? []) {
      const e = batch.find(x => x.code === s.code); if (!e) continue
      const note = [e.note_vn, s.note_vn].filter(Boolean).join(' · ') || null
      await must(supabase.from('entries').update({
        desc_vn: s.desc_vn, desc_en: s.desc_en, perf_vn: s.perf_vn, perf_en: s.perf_en, standards: s.standards ?? null,
        unit: e.unit ?? s.unit ?? null, note_vn: note, note_en: [e.note_en, s.note_en].filter(Boolean).join(' · ') || null, enriched: true,
      }).eq('id', e.id))
    }
  }
  log('Xong phần viết thông số.')
}

// ---------------------------------------------------------------- 5. Đề xuất mã thực tế
export async function bestOccurrence(entryId: string): Promise<{ occ: Occurrence; page: Page } | null> {
  const occ = await must(supabase.from('occurrences').select('*').eq('entry_id', entryId).not('bbox', 'is', null)) as Occurrence[]
  if (!occ.length) return null
  occ.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
  const page = await must(supabase.from('pages').select('*').eq('id', occ[0].page_id!).single()) as Page
  return { occ: occ[0], page }
}

export async function suggestProducts(entry: Entry): Promise<Candidate[]> {
  let crop: { base64: string; media_type: string } | undefined
  const best = await bestOccurrence(entry.id)
  if (best?.occ.bbox) {
    const url = await signedUrl(best.page.image_path)
    crop = { base64: await cropBase64(url, best.occ.bbox, 800), media_type: 'image/jpeg' }
  }
  const lib = await must(supabase.from('library_products').select('brand').eq('group_code', entry.group_code).limit(20)) as { brand: string }[]
  const r = await callAI('suggest_products', {
    entry: { code: entry.code, group_code: entry.group_code, name_vn: entry.name_vn, material_vn: entry.material_vn, desc_vn: entry.desc_vn, color_hex: entry.color_hex },
    crop, preferred_brands: [...new Set(lib.map(l => l.brand))],
  })
  const cands = ((r.tool?.candidates ?? []) as Candidate[]).slice(0, 3).map(c => ({ ...c, verified: false }))
  await must(supabase.from('entries').update({ candidates: cands }).eq('id', entry.id))
  return cands
}

export async function chooseCandidate(entry: Entry, c: Candidate) {
  await must(supabase.from('entries').update({
    brand: c.brand, product_code: c.product_code, product_name: c.product_name ?? null, product_url: c.url, product_image_url: c.image_url ?? null,
  }).eq('id', entry.id))
  await supabase.from('library_products').upsert({
    group_code: entry.group_code, brand: c.brand, product_code: c.product_code, product_name: c.product_name ?? null,
    url: c.url, image_url: c.image_url ?? null, color_hex: entry.color_hex, verified: true,
  }, { onConflict: 'brand,product_code' })
}

// ---------------------------------------------------------------- Thêm tay
export async function addManualEntry(project: Project, room: Room | null, group: string, name: string, category: string) {
  const entries = await must(supabase.from('entries').select('code').eq('project_id', project.id)) as Entry[]
  const book = new CodeBook(entries as Entry[])
  const e = await must(supabase.from('entries').insert({
    project_id: project.id, code: book.next(group), group_code: group, category, name_vn: name, source: 'manual', status: 'pending', qty_flag: 'warn', qty_note: 'Nhập tay',
  }).select().single()) as Entry
  if (room) await must(supabase.from('occurrences').insert({ entry_id: e.id, room_id: room.id, category }))
  return e
}
