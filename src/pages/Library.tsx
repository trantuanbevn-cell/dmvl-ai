// Thư viện vật liệu: tra cứu mã/ảnh/thông số các hãng đã đọc từ web công khai (chỉ người có quyền 'library').
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export type Mat = { id: string; brand: string; product_code: string; name: string | null; line: string | null; kind: string; url: string | null; image_url: string | null; tex_url: string | null; attrs: Record<string, string | null>; variants?: { sub: string; size: string; th: string }[] }
const COLS = 'id,brand,product_code,name,line,kind,url,image_url,tex_url,attrs'
const PAGE = 60

export default function Library() {
  const [q, setQ] = useState(''), [brand, setBrand] = useState(''), [fam, setFam] = useState(''), [color, setColor] = useState('')
  const [rows, setRows] = useState<Mat[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(0), [busy, setBusy] = useState(false)
  const [facets, setFacets] = useState<{ brands: string[]; fams: string[] }>({ brands: [], fams: [] })
  const [open, setOpen] = useState<Mat | null>(null)
  useEffect(() => { // danh sách hãng + dòng sản phẩm
    supabase.from('materials').select('brand,attrs->>family').limit(5000).then(({ data }) => {
      const d = (data ?? []) as any[]
      setFacets({ brands: [...new Set(d.map(x => x.brand))].sort(), fams: [...new Set(d.map(x => x.family).filter(Boolean))].sort() })
    })
  }, [])
  useEffect(() => { setPage(0) }, [q, brand, fam, color])
  useEffect(() => {
    let dead = false
    const t = setTimeout(async () => {
      setBusy(true)
      let qq = supabase.from('materials').select(COLS, { count: 'exact' })
      if (brand) qq = qq.eq('brand', brand)
      if (fam) qq = qq.eq('attrs->>family', fam)
      if (color) qq = qq.eq('attrs->>color', color)
      const s = q.trim().replace(/[%,()]/g, ' ')
      if (s) qq = qq.or(`product_code.ilike.%${s}%,name.ilike.%${s}%,line.ilike.%${s}%`)
      const { data, count } = await qq.order('product_code').range(page * PAGE, page * PAGE + PAGE - 1)
      if (!dead) { setRows((data ?? []) as Mat[]); setTotal(count ?? 0); setBusy(false) }
    }, 250)
    return () => { dead = true; clearTimeout(t) }
  }, [q, brand, fam, color, page])
  const COLORS = ['Trắng', 'Be', 'Xám', 'Đen', 'Nâu', 'Vàng', 'Đỏ', 'Xanh']
  return (
    <div className="page">
      <h1>Thư viện vật liệu</h1>
      <p className="muted small">Dữ liệu đọc từ website công khai của hãng (mã, ảnh, thông số, kích thước/độ dày, link). Mọi mã đều kèm link gốc để đối chiếu.</p>
      <div className="card row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Tìm mã hoặc tên (vd MS 325, Oak, trắng…)" value={q} onChange={e => setQ(e.target.value)} style={{ flex: '1 1 260px' }} />
        <select value={brand} onChange={e => setBrand(e.target.value)}><option value="">Mọi hãng</option>{facets.brands.map(b => <option key={b}>{b}</option>)}</select>
        <select value={fam} onChange={e => setFam(e.target.value)}><option value="">Mọi dòng</option>{facets.fams.map(b => <option key={b}>{b}</option>)}</select>
        <select value={color} onChange={e => setColor(e.target.value)}><option value="">Mọi màu</option>{COLORS.map(b => <option key={b}>{b}</option>)}</select>
        <span className="muted small">{busy ? 'Đang tìm…' : `${total} mã`}</span>
      </div>
      <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {rows.map(m => (
          <div key={m.id} className="card" style={{ cursor: 'pointer', padding: 8 }} onClick={() => setOpen(m)}>
            <img src={m.image_url ?? ''} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, background: '#eee' }} onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
            <div style={{ fontWeight: 600, marginTop: 6 }}>{m.product_code}</div>
            <div className="small">{m.name}</div>
            <div className="small muted">{m.brand} · {m.attrs.family}{m.attrs.color ? ' · ' + m.attrs.color : ''}</div>
          </div>
        ))}
      </div>
      {total > PAGE && <div className="row" style={{ gap: 8, justifyContent: 'center', margin: 12 }}>
        <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Trước</button>
        <span className="small">Trang {page + 1}/{Math.ceil(total / PAGE)}</span>
        <button className="btn sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Sau ›</button>
      </div>}
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
          <img src={m.tex_url || m.image_url || ''} alt="" style={{ width: 260, maxWidth: '100%', borderRadius: 8, background: '#eee' }} />
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
