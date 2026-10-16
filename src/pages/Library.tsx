// Thư viện vật liệu: tra cứu mã/map vật liệu/thông số các hãng đọc từ web công khai (chỉ người có quyền 'library').
// Cây: Nhóm vật liệu → Thương hiệu → Dòng nhóm sản phẩm; bên phải là lưới map vật liệu.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import LibraryImport from '../components/LibraryImport'
import { backfillFeats } from '../lib/suggest'
import { tagLibrary } from '../lib/aiMatch'

export type Mat = { id: string; brand: string; product_code: string; name: string | null; line: string | null; kind: string; url: string | null; image_url: string | null; tex_url: string | null; attrs: Record<string, string | null>; variants?: Var[] }
export type Var = { sub: string; size: string; th: string; edge?: string | null; page?: number; code?: string; url?: string; tex?: string }

/** Chuẩn hoá khổ về mm: "60x120cm" → "600×1200 mm"; "300x600" → "300×600 mm"; bỏ "KHÁC". */
export function normSizes(s?: string | null): string[] {
  if (!s) return []
  const out: string[] = [], re = /(\d+(?:[.,]\d+)?)\s*[x×X*]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm)?/g
  const tail = /\b(cm|mm)\b/i.exec(s)?.[1]?.toLowerCase()
  for (const m of s.matchAll(re)) {
    const a = parseFloat(m[1].replace(',', '.')), b = parseFloat(m[2].replace(',', '.'))
    const u = (m[3] ?? tail ?? (m[0].includes('*') || Math.max(a, b) > 200 ? 'mm' : 'cm')).toLowerCase(), k = u === 'cm' ? 10 : 1
    out.push(`${Math.round(a * k * 10) / 10}×${Math.round(b * k * 10) / 10} mm`)
  }
  return [...new Set(out)]
}
export const fmtSizes = (s?: string | null) => normSizes(s).join(', ')

const COLS = 'id,brand,product_code,name,line,kind,url,image_url,tex_url,attrs'
export const GROUPS: { kind: string; label: string }[] = [
  { kind: 'wood', label: 'Gỗ & bề mặt gỗ công nghiệp' },
  { kind: 'floor', label: 'Sàn gỗ' },
  { kind: 'stone', label: 'Đá tự nhiên' },
  { kind: 'tile', label: 'Gạch ốp lát' },
  { kind: 'paint', label: 'Sơn (bảng màu & hiệu ứng)' },
  { kind: 'moulding', label: 'Phào chỉ & ốp trang trí' },
  { kind: 'sanitary', label: 'Thiết bị vệ sinh' },
]
export const COLORS = ['Trắng', 'Be', 'Xám', 'Đen', 'Nâu', 'Vàng', 'Đỏ', 'Xanh']
const STEP = 120
const cmp = (a: string, b: string) => a.localeCompare(b, 'vi')
type Sel = { kind: string; brand: string; fam: string }

let allCache: { t: number; p: Promise<Mat[]> } | null = null
/** Tải toàn thư viện (hàng chục nghìn mã, mất 10–20 giây) – dùng chung một lần tải trong 5 phút giữa trang Thư viện và hộp tìm mẫu */
export function loadAll(force = false): Promise<Mat[]> {
  if (!force && allCache && Date.now() - allCache.t < 300000) return allCache.p
  const p = loadAllRaw(); allCache = { t: Date.now(), p }; p.catch(() => { if (allCache?.p === p) allCache = null }); return p
}
async function loadAllRaw(): Promise<Mat[]> {
  const out: Mat[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('materials').select(COLS).order('product_code').order('id').range(from, from + 999)
    if (error) throw error
    out.push(...((data ?? []) as Mat[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export default function Library() {
  const [all, setAll] = useState<Mat[]>([]), [loading, setLoading] = useState(true), [err, setErr] = useState('')
  const [sel, setSel] = useState<Sel>({ kind: 'wood', brand: '', fam: '' })
  const [line, setLine] = useState(''), [color, setColor] = useState(''), [q, setQ] = useState(''), [shown, setShown] = useState(STEP)
  const { isAdmin } = useAuth()
  const [imp, setImp] = useState(false), [reload, setReload] = useState(0)
  const [open, setOpen] = useState<Mat | null>(null)
  const [fold, setFold] = useState<Record<string, boolean>>({})
  const [fp, setFp] = useState<string>(''), [fstop, setFstop] = useState(false)
  const [tp, setTp] = useState('')
  const runTag = async (limit: number) => { (window as any).__tstop = false; setTp('AI đang đọc vân…'); try { const n = await tagLibrary((a, b, m) => setTp(m ?? `AI đã đọc vân ${a}/${b}`), () => (window as any).__tstop === true, limit); setTp(`Xong (${n} mã) – bấm lại để chạy tiếp`) } catch (e: any) { setTp('Lỗi: ' + (e.message ?? e)) } }
  const runFeat = async () => { setFstop(false); setFp('Đang phân tích…'); try { const n = await backfillFeats((a, b) => setFp(`Đã phân tích ${a}/${b}`), () => (window as any).__fstop === true); setFp(`Xong (${n} mã)`) } catch (e: any) { setFp('Lỗi: ' + (e.message ?? e)) } }
  useEffect(() => { loadAll(reload > 0).then(setAll).catch(e => setErr(String(e.message ?? e))).finally(() => setLoading(false)) }, [reload])
  useEffect(() => { setShown(STEP) }, [sel, line, color, q])
  useEffect(() => { setLine('') }, [sel])

  // đếm cho cây
  const tree = useMemo(() => {
    const t = new Map<string, Map<string, Map<string, number>>>()
    for (const m of all) {
      const b = t.get(m.kind) ?? new Map(); t.set(m.kind, b)
      const f = b.get(m.brand) ?? new Map(); b.set(m.brand, f)
      const fam = m.attrs.family || 'Khác'; f.set(fam, (f.get(fam) ?? 0) + 1)
    }
    return t
  }, [all])
  const inSel = useMemo(() => all.filter(m => m.kind === sel.kind && (!sel.brand || m.brand === sel.brand) && (!sel.fam || (m.attrs.family || 'Khác') === sel.fam)), [all, sel])
  const lines = useMemo(() => { const c = new Map<string, number>(); inSel.forEach(m => { const l = m.line || '—'; c.set(l, (c.get(l) ?? 0) + 1) }); return [...c.entries()].sort((a, b) => cmp(a[0], b[0])) }, [inSel])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return inSel.filter(m => (!line || (m.line || '—') === line) && (!color || m.attrs.color === color) && (!s || `${m.product_code} ${m.name ?? ''}`.toLowerCase().includes(s)))
  }, [inSel, line, color, q])
  const gl = GROUPS.find(g => g.kind === sel.kind)?.label ?? ''
  const crumb = [gl, sel.brand, sel.fam].filter(Boolean).join(' › ')

  return (
    <div className="page">
      <div className="row between"><h1>Thư viện vật liệu</h1>{isAdmin && <span className="row gap"><span className="small muted">{tp || fp}</span><button className="btn" title="AI đọc vân 24 mẫu/lần gọi; chạy thử 200 mẫu trước" onClick={() => runTag(200)}>🤖 AI đọc vân (thử 200)</button><button className="btn" onClick={() => runTag(Infinity)}>🤖 AI đọc vân (cả thư viện)</button><button className="btn ghost" onClick={() => { (window as any).__tstop = true }}>⏹</button><button className="btn" onClick={() => { (window as any).__fstop = false; runFeat() }}>🔍 Phân tích lại ảnh thư viện</button><button className="btn" onClick={() => setImp(true)}>⬆ Nhập thư viện từ file</button></span>}</div>
      <p className="muted small">Dữ liệu đọc từ website công khai của hãng (mã, map vật liệu, thông số, kích thước/độ dày, link gốc để đối chiếu).</p>
      {err && <div className="note warn">⚠ {err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 14, alignItems: 'start' }}>
        <div className="card" style={{ padding: 8, position: 'sticky', top: 8, maxHeight: '88vh', overflow: 'auto' }}>
          {GROUPS.map(g => {
            const brands = tree.get(g.kind), n = brands ? [...brands.values()].reduce((a, f) => a + [...f.values()].reduce((x, y) => x + y, 0), 0) : 0
            const on = sel.kind === g.kind
            return (
              <div key={g.kind} style={{ marginBottom: 4 }}>
                <div onClick={() => { setSel({ kind: g.kind, brand: '', fam: '' }); setFold({ ...fold, [g.kind]: false }) }} style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 6, fontWeight: 700, background: on && !sel.brand ? 'var(--brown)' : 'transparent', color: on && !sel.brand ? '#fff' : undefined, opacity: n ? 1 : .5 }}>
                  {g.label} <span className="cnt">{n}</span>
                </div>
                {on && !fold[g.kind] && brands && [...brands.entries()].sort((a, b) => cmp(a[0], b[0])).map(([b, fams]) => {
                  const bn = [...fams.values()].reduce((x, y) => x + y, 0), bon = sel.brand === b
                  return (
                    <div key={b} style={{ marginLeft: 10 }}>
                      <div onClick={() => setSel({ kind: g.kind, brand: b, fam: '' })} style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 6, fontWeight: 600, background: bon && !sel.fam ? '#e9dccb' : 'transparent' }}>{b} <span className="cnt">{bn}</span></div>
                      {bon && [...fams.entries()].sort((a, b) => cmp(a[0], b[0])).map(([f, c]) => (
                        <div key={f} onClick={() => setSel({ kind: g.kind, brand: b, fam: f })} style={{ cursor: 'pointer', marginLeft: 12, padding: '3px 8px', borderRadius: 6, fontSize: 13, background: sel.fam === f ? '#e9dccb' : 'transparent' }}>{f} <span className="muted">({c})</span></div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}
          <div className="small muted" style={{ padding: 8 }}>Đá tự nhiên, gạch, sơn: sẽ bổ sung khi đọc xong các hãng.</div>
        </div>
        <div>
          <div className="card row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <b>{crumb}</b>
            <span className="muted small">{loading ? 'Đang tải…' : `${list.length} mã`}</span>
            <span style={{ flex: 1 }} />
            <input placeholder="Tìm mã / tên (MS 325, Oak…)" value={q} onChange={e => setQ(e.target.value)} style={{ width: 220 }} />
            <select value={color} onChange={e => setColor(e.target.value)}><option value="">Mọi màu</option>{COLORS.map(b => <option key={b}>{b}</option>)}</select>
          </div>
          {lines.length > 1 && <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
            <span className={'chip' + (!line ? ' on' : '')} onClick={() => setLine('')}>Tất cả dòng</span>
            {lines.map(([l, c]) => <span key={l} className={'chip' + (line === l ? ' on' : '')} onClick={() => setLine(l)}>{l} <span className="cnt">{c}</span></span>)}
          </div>}
          <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            {list.slice(0, shown).map(m => (
              <div key={m.id} className="card" style={{ cursor: 'pointer', padding: 6 }} onClick={() => setOpen(m)}>
                <div style={{ aspectRatio: '2/1', borderRadius: 6, background: !m.tex_url && m.attrs.color ? m.attrs.color : '#eee', overflow: 'hidden' }}>
                  {m.tex_url && <img src={m.tex_url} alt="" decoding="async" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />}
                </div>
                <div style={{ fontWeight: 600, marginTop: 5, fontSize: 13 }}>{m.product_code}</div>
                <div className="small">{m.name}</div>
                <div className="small muted">{m.line}{m.attrs.color ? ' · ' + m.attrs.color : ''}</div>
                {m.attrs.image_kind === 'render' && <div className="small" style={{ color: '#b45309' }}>⚠ chỉ có ảnh phối cảnh</div>}
              </div>
            ))}
          </div>
          {list.length > shown && <div style={{ textAlign: 'center', margin: 12 }}><button className="btn" onClick={() => setShown(shown + STEP)}>Xem thêm ({list.length - shown})</button></div>}
          {!loading && !list.length && <div className="card muted">Không có mã nào.</div>}
        </div>
      </div>
      {imp && <LibraryImport onClose={() => setImp(false)} onDone={() => setReload(reload + 1)} />}
      {open && <MatDetail m={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

export function MatDetail({ m, onClose, onPick, pickLabel }: { m: Mat; onClose: () => void; onPick?: (m: Mat, v: Var | null) => void; pickLabel?: string }) {
  const [vars, setVars] = useState<Mat['variants']>(m.variants)
  const [sub, setSub] = useState(''), [size, setSize] = useState(''), [th, setTh] = useState(''), [sel, setSel] = useState('')
  useEffect(() => { if (!m.variants) supabase.from('materials').select('variants').eq('id', m.id).single().then(({ data }) => setVars((data as any)?.variants ?? [])) }, [m])
  const subs = useMemo(() => [...new Set((vars ?? []).map(v => v.sub))], [vars])
  useEffect(() => { if (subs.length && !subs.includes(sub)) setSub(subs[0]) }, [subs]) // eslint-disable-line
  const ofSub = (vars ?? []).filter(v => v.sub === sub)
  const sizes = [...new Set(ofSub.map(v => v.size))], ths = [...new Set(ofSub.filter(v => !size || v.size === size).map(v => v.th))].sort((a, b) => +a - +b)
  const chosen = ofSub.find(v => v.size === size && v.th === th) ?? (!sizes.some(Boolean) ? ofSub[0] : null) ?? null
  const edge = [...new Set(ofSub.map(v => v.edge).filter(Boolean))].join(', ')
  const A = m.attrs
  const coded = (vars ?? []).filter(v => v.code)
  const sizesTxt = coded.length ? [...new Set(coded.map(v => v.size).filter(Boolean))].join(', ') : fmtSizes(A.sizes)
  const pick = coded.find(v => v.code === sel) ?? null
  const strSizes = !(vars ?? []).length ? normSizes(A.sizes) : []
  const [asz, setAsz] = useState(''), [zoom, setZoom] = useState(false)
  const result: Var | null = pick ?? chosen ?? (asz ? { sub: '', size: asz, th: '' } : null)
  // khi chọn vào danh mục: mẫu có nhiều kích thước thì BẮT BUỘC chọn đúng 1 kích thước
  const need = coded.length > 1 ? 'kích thước / mã' : !coded.length && sizes.some(Boolean) && !chosen ? 'kích thước' + (ths.some(Boolean) ? ' và độ dày' : '') : strSizes.length > 1 && !asz ? 'kích thước' : ''
  return (
    <div className="modal-bg center" style={{ zIndex: 95 }} onMouseDown={e => { e.stopPropagation(); onClose() }}>
      <div className="modal" style={{ width: 'min(760px, 96vw)', maxHeight: '90vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        {zoom && <div onMouseDown={e => { e.stopPropagation(); setZoom(false) }} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(20,15,10,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 16 }}><img src={pick?.tex || m.tex_url || ''} alt="" referrerPolicy="no-referrer" style={{ maxWidth: '96vw', maxHeight: '94vh', objectFit: 'contain', borderRadius: 6, background: '#fff' }} /><span style={{ position: 'fixed', top: 14, right: 22, color: '#fff', fontSize: 13 }}>Bấm bất kỳ đâu để đóng</span></div>}
        <div className="row between"><h3>{m.product_code} — {m.name}</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {(pick?.tex || m.tex_url)
            ? <img src={pick?.tex || m.tex_url || ''} alt="" title="Bấm để phóng to map" onClick={() => setZoom(true)} referrerPolicy="no-referrer" style={{ cursor: 'zoom-in', width: 340, maxWidth: '100%', aspectRatio: '2/1', objectFit: 'cover', borderRadius: 8, background: '#eee' }} />
            : <div title={A.color ?? ''} style={{ width: 340, maxWidth: '100%', aspectRatio: '2/1', borderRadius: 8, background: A.color || '#eee', border: '1px solid #ddd' }} />}
          <div style={{ flex: '1 1 260px' }} className="small">
            <div><b>Hãng:</b> {m.brand}</div><div><b>Dòng:</b> {m.line}</div>
            {A.pattern && <div><b>Loại vân:</b> {A.pattern}</div>}{A.species && <div><b>Loại gỗ:</b> {A.species}</div>}{A.material && <div><b>Vật liệu:</b> {A.material}</div>}{A.color && <div><b>Màu:</b> {A.color}</div>}{A.finish && <div><b>Bề mặt:</b> {A.finish}</div>}
            {A.special && <div><b>Tính năng:</b> {A.special}</div>}{A.solution && <div><b>Giải pháp:</b> {A.solution}</div>}{A.price_group && <div><b>Nhóm giá:</b> {A.price_group}</div>}
            {(sizesTxt || A.sizes) && <div><b>Kích thước tấm:</b> {sizesTxt || A.sizes}</div>}
            {A.dims && <div><b>Kích thước SP:</b> {A.dims}</div>}            {A.thickness && <div><b>Độ dày:</b> {A.thickness}</div>}{A.grain && <div><b>Kiểu vân:</b> {A.grain}</div>}
            {A.finishes && <div><b>Bề mặt có sẵn:</b> {A.finishes}</div>}{A.usage && <div><b>Ứng dụng:</b> {A.usage}</div>}{A.worktop && <div><b>Mặt bàn:</b> {A.worktop}</div>}
            {A.alt_codes && <div><b>Mã khác cùng bộ sưu tập (màu/khổ khác):</b> {A.alt_codes}</div>}
            {A.note && <div className="muted">⚠ {A.note}</div>}{A.catalog_status && <div className="muted">⚠ {A.catalog_status}</div>}{A.catalog_page && <div><b>Trang catalog:</b> {A.catalog_page}</div>}
            {pick && <div style={{ marginTop: 6 }}><b>Mã đang chọn:</b> {pick.code} · {pick.size}{pick.sub ? ` · ${pick.sub}` : ''}</div>}
            {(pick?.url || m.url) && <div style={{ marginTop: 6 }}><a href={pick?.url || m.url || undefined} target="_blank" rel="noreferrer">🔗 Xem trên website hãng</a></div>}
          </div>
        </div>
        {coded.length > 0 && <div className="card" style={{ marginTop: 8 }}>
          <b>Kích thước và mã sản phẩm</b>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {coded.map(v => <button key={v.code} className={'btn sm' + (sel === v.code ? ' primary' : '')} onClick={() => setSel(sel === v.code ? '' : v.code!)}>{v.size} · {v.code}{v.sub ? ` (${v.sub})` : ''}</button>)}
          </div>
        </div>}
        {!coded.length && subs.length > 0 && <div className="card" style={{ marginTop: 8 }}>
          <b>Chọn quy cách{ofSub.some(v => !v.th) ? ' / bề mặt' : ''}</b>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {(subs.length > 1 || subs[0]) && <select value={sub} onChange={e => { setSub(e.target.value); setSize(''); setTh('') }}>{subs.map(s => <option key={s}>{s}</option>)}</select>}
            {sizes.some(Boolean) && <select value={size} onChange={e => { setSize(e.target.value); setTh('') }}><option value="">Kích thước</option>{sizes.filter(Boolean).map(s => <option key={s}>{s}</option>)}</select>}
            {ths.some(Boolean) && <select value={th} onChange={e => setTh(e.target.value)}><option value="">Độ dày (mm)</option>{ths.filter(Boolean).map(s => <option key={s}>{s}</option>)}</select>}
          </div>
        </div>}
        {strSizes.length > 1 && <div className="card" style={{ marginTop: 8 }}>
          <b>Kích thước</b>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{strSizes.map(z => <button key={z} className={'btn sm' + (asz === z ? ' primary' : '')} onClick={() => setAsz(asz === z ? '' : z)}>{z}</button>)}</div>
        </div>}
        {edge && <div className="small" style={{ marginTop: 6 }}>Mã nẹp cạnh: <b>{edge}</b></div>}
        {onPick && <div className="row" style={{ justifyContent: 'flex-end', gap: 8, alignItems: 'center', marginTop: 8 }}>
          {need && <span className="small" style={{ color: '#b45309' }}>Hãy chọn {need} để đưa vào danh mục (danh mục chỉ ghi đúng kích thước đã chọn)</span>}
          <button className="btn primary" disabled={!!need} onClick={() => onPick(m, result)}>{pickLabel ?? 'Chọn mã này'}</button></div>}
      </div>
    </div>
  )
}
