// "Vật Liệu Đề Xuất": chọn mẫu từ thư viện (nhóm → hãng → dòng, tìm theo mã/tên) đưa vào mã danh mục.
import { useEffect, useMemo, useState } from 'react'
import { loadAll, GROUPS, COLORS, MatDetail, type Mat } from '../pages/Library'
import type { Entry } from '../lib/types'
import { applyPicks, kindOfGroup, sizeText, type Pick } from '../lib/suggestApply'

const STEP = 90
export default function MaterialSuggest({ entry, used, onClose, onDone }: { entry: Entry; used?: { brand: string; code: string }[]; onClose: () => void; onDone: () => void }) {
  const [all, setAll] = useState<Mat[]>([]), [loading, setLoading] = useState(true)
  const [kind, setKind] = useState(kindOfGroup(entry.group_code) ?? 'tile'), [brand, setBrand] = useState(''), [fam, setFam] = useState('')
  const [line, setLine] = useState(''), [color, setColor] = useState(''), [q, setQ] = useState(''), [shown, setShown] = useState(STEP)
  const [tab, setTab] = useState<'all' | 'used'>('all')
  const [open, setOpen] = useState<Mat | null>(null), [picks, setPicks] = useState<Pick[]>([]), [busy, setBusy] = useState(false)
  useEffect(() => { loadAll().then(setAll).finally(() => setLoading(false)) }, [])
  useEffect(() => { setShown(STEP) }, [kind, brand, fam, line, color, q, tab])
  useEffect(() => { setLine('') }, [kind, brand, fam])
  const usedSet = useMemo(() => new Set((used ?? []).map(u => u.brand + '|' + u.code)), [used])
  const inKind = useMemo(() => all.filter(m => !kind || m.kind === kind), [all, kind])
  const brands = useMemo(() => { const c = new Map<string, Map<string, number>>(); inKind.forEach(m => { const f = c.get(m.brand) ?? new Map(); c.set(m.brand, f); const k = m.attrs.family || 'Khác'; f.set(k, (f.get(k) ?? 0) + 1) }); return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi')) }, [inKind])
  const inSel = useMemo(() => inKind.filter(m => (!brand || m.brand === brand) && (!fam || (m.attrs.family || 'Khác') === fam)), [inKind, brand, fam])
  const lines = useMemo(() => { const c = new Map<string, number>(); inSel.forEach(m => { const l = m.line || '—'; c.set(l, (c.get(l) ?? 0) + 1) }); return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi')) }, [inSel])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = tab === 'used' ? all.filter(m => usedSet.has(m.brand + '|' + m.product_code)) : inSel
    return base.filter(m => (tab === 'used' || ((!line || (m.line || '—') === line) && (!color || m.attrs.color === color))) && (!s || `${m.product_code} ${m.name ?? ''} ${m.brand}`.toLowerCase().includes(s)))
  }, [all, inSel, line, color, q, tab, usedSet])
  // tìm theo mã: nếu có chữ tìm mà nhóm hiện tại không có kết quả thì gợi ý tìm toàn thư viện
  const addPick = (m: Mat, v: Pick['v']) => {
    setPicks(p => p.some(x => x.m.brand === m.brand) ? p.map(x => x.m.brand === m.brand ? { m, v } : x) : p.length >= 2 ? [p[0], { m, v }] : [...p, { m, v }])
    setOpen(null)
  }
  const apply = async () => { setBusy(true); const e = await applyPicks(entry, picks); setBusy(false); if (e) return alert(e.message); onDone(); onClose() }
  const chip = (on: boolean): React.CSSProperties => ({ cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: on ? '#e9dccb' : 'transparent' })
  return (
    <div className="modal-bg center" onMouseDown={e => { e.stopPropagation(); onClose() }}>
      <div className="modal" style={{ width: 'min(1200px, 97vw)', height: '92vh', maxHeight: '92vh' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3>Vật Liệu Đề Xuất — {entry.code} {entry.name_vn}</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input autoFocus placeholder="Gõ mã / tên để tìm nhanh (MS 325, Oak…)" value={q} onChange={e => setQ(e.target.value)} style={{ width: 280 }} />
          <select value={color} onChange={e => setColor(e.target.value)}><option value="">Mọi màu</option>{COLORS.map(b => <option key={b}>{b}</option>)}</select>
          <span className={'chip' + (tab === 'all' ? ' on' : '')} onClick={() => setTab('all')}>Theo nhóm</span>
          <span className={'chip' + (tab === 'used' ? ' on' : '')} onClick={() => setTab('used')}>Đã dùng trong dự án này ({usedSet.size})</span>
          <span className="muted small">{loading ? 'Đang tải…' : `${list.length} mã`}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 12, flex: 1, minHeight: 0 }}>
          <div className="card" style={{ padding: 8, overflow: 'auto' }}>
            {GROUPS.map(g => {
              const on = kind === g.kind
              return <div key={g.kind}>
                <div style={{ ...chip(on && !brand), fontWeight: 700 }} onClick={() => { setKind(g.kind); setBrand(''); setFam(''); setTab('all') }}>{g.label}</div>
                {on && brands.map(([b, fams]) => <div key={b} style={{ marginLeft: 10 }}>
                  <div style={{ ...chip(brand === b && !fam), fontWeight: 600 }} onClick={() => { setBrand(b); setFam('') }}>{b} <span className="cnt">{[...fams.values()].reduce((x, y) => x + y, 0)}</span></div>
                  {brand === b && [...fams.entries()].sort((x, y) => x[0].localeCompare(y[0], 'vi')).map(([f, c]) => <div key={f} style={{ ...chip(fam === f), marginLeft: 12, fontSize: 13 }} onClick={() => setFam(f)}>{f} <span className="muted">({c})</span></div>)}
                </div>)}
              </div>
            })}
          </div>
          <div style={{ overflow: 'auto' }}>
            {tab === 'all' && lines.length > 1 && <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <span className={'chip' + (!line ? ' on' : '')} onClick={() => setLine('')}>Tất cả dòng</span>
              {lines.map(([l, c]) => <span key={l} className={'chip' + (line === l ? ' on' : '')} onClick={() => setLine(l)}>{l} <span className="cnt">{c}</span></span>)}
            </div>}
            <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
              {list.slice(0, shown).map(m => {
                const on = picks.some(p => p.m.id === m.id)
                return <div key={m.id} className="card" style={{ cursor: 'pointer', padding: 6, outline: on ? '2px solid var(--brown)' : undefined }} onClick={() => setOpen(m)}>
                  <div style={{ aspectRatio: '2/1', borderRadius: 6, background: '#eee', overflow: 'hidden' }}>
                    <img src={m.tex_url ?? ''} alt="" decoding="async" loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 4, fontSize: 13 }}>{m.product_code}</div>
                  <div className="small">{m.name}</div>
                  <div className="small muted">{m.brand}{m.line ? ' · ' + m.line : ''}</div>
                  {m.attrs.image_kind === 'render' && <div className="small" style={{ color: '#b45309' }}>⚠ chỉ có ảnh phối cảnh</div>}
                </div>
              })}
            </div>
            {list.length > shown && <div style={{ textAlign: 'center', margin: 12 }}><button className="btn" onClick={() => setShown(shown + STEP)}>Xem thêm ({list.length - shown})</button></div>}
            {!loading && !list.length && <div className="card muted">Không có mã nào. {q && tab === 'all' && <button className="btn sm" onClick={() => { setBrand(''); setFam(''); setKind('') }}>Tìm ở mọi nhóm</button>}</div>}
          </div>
        </div>
        <div className="row" style={{ gap: 10, alignItems: 'center', borderTop: '1px solid #e6dccf', paddingTop: 8, flexWrap: 'wrap' }}>
          <b>Đã chọn ({picks.length}/2):</b>
          {picks.map(p => <span key={p.m.brand} className="pill">{p.m.brand}: {p.v?.code || p.m.product_code}{sizeText(p) ? ' · ' + sizeText(p) : ''} <a onClick={() => setPicks(picks.filter(x => x !== p))} style={{ cursor: 'pointer' }}>✕</a></span>)}
          {!picks.length && <span className="muted small">Bấm vào mẫu → chọn kích thước → “Chọn vào danh mục”. Có thể chọn 2 hãng khác nhau nếu map giống nhau.</span>}
          <span style={{ flex: 1 }} />
          <button className="btn primary" disabled={!picks.length || busy} onClick={apply}>{busy ? 'Đang lưu…' : 'Áp dụng vào danh mục'}</button>
        </div>
      </div>
      {open && <MatDetail m={open} onClose={() => setOpen(null)} onPick={addPick} pickLabel="Chọn vào danh mục" />}
    </div>
  )
}
