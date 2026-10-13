// Bảng "Vật Liệu Đề Xuất": trái = ảnh phối cảnh có khoanh vị trí; phải = CHỈ các mẫu thư viện khớp ≥90% (không lộ phần còn lại của thư viện).
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import type { ProjectData } from '../lib/useProject'
import type { Entry } from '../lib/types'
import OccCrop from './OccCrop'
import MaterialSuggest from './MaterialSuggest'
import { MatDetail, type Mat } from '../pages/Library'
import { bboxFeat, loadFeatMats, rank, SUGGEST_MIN, type Cand, type FMat } from '../lib/suggest'
import { applyPicks, sizeText, type Pick } from '../lib/suggestApply'

export default function SuggestDialog({ d, entry, occId, onClose }: { d: ProjectData; entry: Entry; occId?: string; onClose: () => void }) {
  const { isAdmin } = useAuth()
  const occs = useMemo(() => d.occ.filter(o => o.entry_id === entry.id && o.bbox && (o.page_id || o.view?.img)), [d.occ, entry.id])
  const [oid, setOid] = useState(occId ?? occs[0]?.id ?? '')
  const o = occs.find(x => x.id === oid) ?? occs[0]
  const [mats, setMats] = useState<FMat[] | null>(null)
  const [cands, setCands] = useState<Cand[] | null>(null)
  const [open, setOpen] = useState<Mat | null>(null), [picks, setPicks] = useState<Pick[]>([]), [busy, setBusy] = useState(false), [browse, setBrowse] = useState(false), [err, setErr] = useState('')
  useEffect(() => { loadFeatMats().then(setMats).catch(e => setErr(String(e.message ?? e))) }, [])
  const pg = o?.page_id ? d.pages.find(p => p.id === o.page_id) : undefined
  const url = pg ? d.urls[pg.image_path] : undefined
  const bkey = o?.bbox?.join(',')
  useEffect(() => {
    setCands(null)
    if (!mats || !o?.bbox || !url) { if (mats) setCands([]); return }
    let off = false
    bboxFeat(url, o.bbox).then(f => { if (!off) setCands(rank(f, mats, entry.group_code)) }).catch(e => { if (!off) { setErr(String(e.message ?? e)); setCands([]) } })
    return () => { off = true }
  }, [mats, url, bkey, entry.group_code]) // eslint-disable-line
  const addPick = (m: Mat, v: Pick['v']) => {
    setPicks(p => p.some(x => x.m.brand === m.brand) ? p.map(x => x.m.brand === m.brand ? { m, v } : x) : p.length >= 2 ? [p[0], { m, v }] : [...p, { m, v }])
    setOpen(null)
  }
  const apply = async () => { setBusy(true); const e = await applyPicks(entry, picks); setBusy(false); if (e) return alert(e.message); await d.reload(); onClose() }
  return (
    <div className="modal-bg center no-export" onMouseDown={onClose}>
      <div className="modal" style={{ width: 'min(1180px, 97vw)', height: '88vh', maxHeight: '88vh' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3>Vật Liệu Đề Xuất — {entry.code} {entry.name_vn}</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1, minHeight: 0 }}>
          <div className="card" style={{ overflow: 'auto' }}>
            <b>Phối cảnh (vị trí được khoanh)</b>
            {occs.length > 1 && <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>{occs.map(x => <span key={x.id} className={'chip' + (x.id === o?.id ? ' on' : '')} onClick={() => setOid(x.id)}>{d.rooms.find(r => r.id === x.room_id)?.code ?? 'Ảnh'}</span>)}</div>}
            {o ? <div style={{ marginTop: 8 }}><OccCrop d={d} o={o} height={420} maxWidth={560} /></div> : <p className="muted">Mã này chưa có ảnh phối cảnh để đối chiếu.</p>}
            <p className="small muted">Phần mềm so màu và bề mặt của vùng khoanh với map vật liệu thư viện, chỉ hiện mẫu khớp từ {Math.round(SUGGEST_MIN * 100)}%.</p>
          </div>
          <div className="card" style={{ overflow: 'auto' }}>
            <b>Vật liệu đề xuất {cands ? `(${cands.length})` : ''}</b>
            {err && <div className="note warn">⚠ {err}</div>}
            {(!mats || (!cands && !err)) && <p className="muted">Đang so khớp…</p>}
            {mats && !mats.length && <p className="muted">Thư viện chưa được phân tích ảnh (admin bấm “Phân tích ảnh thư viện” ở trang Thư viện).</p>}
            {cands && !cands.length && mats?.length ? <p className="muted">Không có mẫu thư viện nào khớp từ {Math.round(SUGGEST_MIN * 100)}%. Giữ thông tin hiện tại, người làm tự nhập mã/ảnh cho hạng mục này.</p> : null}
            <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, marginTop: 8 }}>
              {(cands ?? []).map(({ m, score }) => {
                const on = picks.some(p => p.m.id === m.id)
                return <div key={m.id} className="card" style={{ cursor: 'pointer', padding: 6, outline: on ? '2px solid var(--brown)' : undefined }} onClick={() => setOpen(m)}>
                  <div style={{ aspectRatio: '2/1', borderRadius: 6, background: '#eee', overflow: 'hidden' }}><img src={m.tex_url ?? ''} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>
                  <div style={{ fontWeight: 600, marginTop: 4, fontSize: 13 }}>{m.product_code} <span className="pill">{Math.round(score * 100)}%</span></div>
                  <div className="small">{m.name}</div>
                  <div className="small muted">{m.brand}{m.line ? ' · ' + m.line : ''}</div>
                </div>
              })}
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 10, alignItems: 'center', borderTop: '1px solid #e6dccf', paddingTop: 8, flexWrap: 'wrap' }}>
          <b>Đã chọn ({picks.length}/2):</b>
          {picks.map(p => <span key={p.m.brand} className="pill">{p.m.brand}: {p.v?.code || p.m.product_code}{sizeText(p) ? ' · ' + sizeText(p) : ''} <a onClick={() => setPicks(picks.filter(x => x !== p))} style={{ cursor: 'pointer' }}>✕</a></span>)}
          {!picks.length && <span className="muted small">Bấm mẫu → chọn kích thước → “Chọn vào danh mục”. Được chọn 2 hãng nếu map giống nhau.</span>}
          <span style={{ flex: 1 }} />
          {isAdmin && <button className="btn sm" onClick={() => setBrowse(true)}>Duyệt toàn thư viện (admin)</button>}
          <button className="btn primary" disabled={!picks.length || busy} onClick={apply}>{busy ? 'Đang lưu…' : 'Áp dụng vào danh mục'}</button>
        </div>
      </div>
      {open && <MatDetail m={open} onClose={() => setOpen(null)} onPick={addPick} pickLabel="Chọn vào danh mục" />}
      {browse && <MaterialSuggest entry={entry} onClose={() => setBrowse(false)} onDone={() => { d.reload(); onClose() }} />}
    </div>
  )
}
