// Thư viện vật liệu: tra cứu mã/map vật liệu/thông số các hãng đọc từ web công khai (chỉ người có quyền 'library').
// Cây: Nhóm vật liệu → Thương hiệu → Dòng nhóm sản phẩm; bên phải là lưới map vật liệu.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export type Mat = { id: string; brand: string; product_code: string; name: string | null; line: string | null; kind: string; url: string | null; image_url: string | null; tex_url: string | null; attrs: Record<string, string | null>; variants?: { sub: string; size: string; th: string }[] }
const COLS = 'id,brand,product_code,name,line,kind,url,image_url,tex_url,attrs'
export const GROUPS: { kind: string; label: string }[] = [
  { kind: 'wood', label: 'Gỗ & bề mặt gỗ công nghiệp' },
  { kind: 'floor', label: 'Sàn gỗ' },
  { kind: 'stone', label: 'Đá tự nhiên' },
  { kind: 'tile', label: 'Gạch ốp lát' },
  { kind: 'paint', label: 'Sơn' },
]
const COLORS = ['Trắng', 'Be', 'Xám', 'Đen', 'Nâu', 'Vàng', 'Đỏ', 'Xanh']
const STEP = 120
const cmp = (a: string, b: string) => a.localeCompare(b, 'vi')
type Sel = { kind: string; brand: string; fam: string }

async function loadAll(): Promise<Mat[]> {
  const out: Mat[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('materials').select(COLS).order('product_code').range(from, from + 999)
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
  const [open, setOpen] = useState<Mat | null>(null)
  const [fold, setFold] = useState<Record<string, boolean>>({})
  useEffect(() => { loadAll().then(setAll).catch(e => setErr(String(e.message ?? e))).finally(() => setLoading(false)) }, [])
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
      <h1>Thư viện vật liệu</h1>
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
                <div style={{ aspectRatio: '2/1', borderRadius: 6, background: '#eee', overflow: 'hidden' }}>
                  <img src={m.tex_url ?? ''} alt="" decoding="async" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                </div>
                <div style={{ fontWeight: 600, marginTop: 5, fontSize: 13 }}>{m.product_code}</div>
                <div className="small">{m.name}</div>
                <div className="small muted">{m.line}{m.attrs.color ? ' · ' + m.attrs.color : ''}</div>
              </div>
            ))}
          </div>
          {list.length > shown && <div style={{ textAlign: 'center', margin: 12 }}><button className="btn" onClick={() => setShown(shown + STEP)}>Xem thêm ({list.length - shown})</button></div>}
          {!loading && !list.length && <div className="card muted">Không có mã nào.</div>}
        </div>
      </div>
      {open && <MatDetail m={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

export function MatDetail({ m, onClose, onPick }: { m: Mat; onClose: () => void; onPick?: (m: Mat, v: { sub: string; size: string; th: string } | null) => void }) {
  const [vars, setVars] = useState<Mat['variants']>(m.variants)
  const [sub, setSub] = useState(''), [size, setSize] = useState(''), [th, setTh] = useState('')
  useEffect(() => { if (!m.variants) supabase.from('materials').select('variants').eq('id', m.id).single().then(({ data }) => setVars((data as any)?.variants ?? [])) }, [m])
  const subs = useMemo(() => [...new Set((vars ?? []).map(v => v.sub))], [vars])
  useEffect(() => { if (subs.length && !subs.includes(sub)) setSub(subs[0]) }, [subs]) // eslint-disable-line
  const ofSub = (vars ?? []).filter(v => v.sub === sub)
  const sizes = [...new Set(ofSub.map(v => v.size))], ths = [...new Set(ofSub.filter(v => !size || v.size === size).map(v => v.th))].sort((a, b) => +a - +b)
  const chosen = ofSub.find(v => v.size === size && v.th === th) ?? null
  const A = m.attrs
  return (
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ width: 'min(760px, 96vw)', maxHeight: '90vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3>{m.product_code} — {m.name}</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <img src={m.tex_url ?? ''} alt="" referrerPolicy="no-referrer" style={{ width: 340, maxWidth: '100%', aspectRatio: '2/1', objectFit: 'cover', borderRadius: 8, background: '#eee' }} />
          <div style={{ flex: '1 1 260px' }} className="small">
            <div><b>Hãng:</b> {m.brand}</div><div><b>Dòng:</b> {m.line}</div>
            {A.pattern && <div><b>Loại vân:</b> {A.pattern}</div>}{A.color && <div><b>Màu:</b> {A.color}</div>}{A.finish && <div><b>Bề mặt:</b> {A.finish}</div>}
            {A.special && <div><b>Tính năng:</b> {A.special}</div>}{A.solution && <div><b>Giải pháp:</b> {A.solution}</div>}{A.price_group && <div><b>Nhóm giá:</b> {A.price_group}</div>}
            {A.sizes && <div><b>Kích thước tấm:</b> {A.sizes} mm</div>}
            {m.url && <div style={{ marginTop: 6 }}><a href={m.url} target="_blank" rel="noreferrer">🔗 Xem trên website hãng</a></div>}
          </div>
        </div>
        {subs.length > 0 && <div className="card" style={{ marginTop: 8 }}>
          <b>Chọn quy cách</b>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <select value={sub} onChange={e => { setSub(e.target.value); setSize(''); setTh('') }}>{subs.map(s => <option key={s}>{s}</option>)}</select>
            <select value={size} onChange={e => { setSize(e.target.value); setTh('') }}><option value="">Kích thước (mm)</option>{sizes.map(s => <option key={s}>{s}</option>)}</select>
            <select value={th} onChange={e => setTh(e.target.value)}><option value="">Độ dày (mm)</option>{ths.map(s => <option key={s}>{s}</option>)}</select>
          </div>
        </div>}
        {onPick && <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}><button className="btn primary" onClick={() => onPick(m, chosen)}>Chọn mã này</button></div>}
      </div>
    </div>
  )
}
