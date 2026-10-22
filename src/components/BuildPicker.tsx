// Chọn cấu tạo lớp tường / trần / sàn bằng cách tích: khung → cốt → hoàn thiện (sơn: bả, lót, phủ) → tự sinh thông số kỹ thuật đúng vật liệu.
import { useEffect, useMemo, useState } from 'react'
import type { Entry } from '../lib/types'
import { hintsOf, PRESETS, groupOfBuild, SYSTEMS, systemOf, guessSystem, cleanSel, renderBuild, applyBuild, type BuildState, type System } from '../lib/construction'

/** Mô tả sẵn có (trừ dòng Kích thước) đưa vào ô "Mô tả thêm" để không mất chữ của người làm khi áp cấu tạo */
export type BuildSeed = Pick<Entry, 'name_vn' | 'desc_vn' | 'part_vn' | 'group_code' | 'category'> & { build?: BuildState | null }
const keepText = (e: Pick<Entry, 'desc_vn'>) => (e.desc_vn ?? '').split('\n').filter(l => l.trim() && !/^Kích thước\s*:/i.test(l.trim()) && !/^-\s/.test(l.trim())).join('\n').slice(0, 400)

/** Chế độ lưu: entry là mã đã có (nút Áp dụng cấu tạo). Chế độ nháp (draft): dùng khi đang tạo mã mới – chỉ trả lựa chọn ra ngoài, áp dụng sau khi mã được tạo. */
export default function BuildPicker({ entry, all, onDone, draft }: { entry: BuildSeed | Entry; all?: Entry[]; onDone?: () => void; draft?: (st: BuildState | null) => void }) {
  const init: BuildState = entry.build?.sys ? entry.build : { sys: guessSystem(entry), sel: {}, vars: {} }
  const [st, setSt] = useState<BuildState>(entry.build?.sys ? init : { ...init, extra: keepText(entry) }), [busy, setBusy] = useState(false), [quick, setQuick] = useState(false), [fine, setFine] = useState(false), [show, setShow] = useState(!!entry.build || !!draft)
  const sys = systemOf(st.sys), cl = useMemo(() => cleanSel(sys, st), [sys, st])
  const pv = useMemo(() => renderBuild(cl), [cl])
  useEffect(() => { draft?.(Object.values(cl.sel).some(a => a.length) ? cl : null) }, [cl]) // eslint-disable-line
  const layers = sys.layers.filter(l => !l.when || l.when(cl.sel))
  const toggle = (lk: string, ok: string, multi?: boolean) => setSt(s => {
    const cur = cleanSel(systemOf(s.sys), s).sel[lk] ?? []
    const next = cur.includes(ok) ? cur.filter(x => x !== ok) : multi ? [...cur, ok] : [ok]
    return cleanSel(systemOf(s.sys), { ...s, sel: { ...s.sel, [lk]: next } })
  })
  const setVar = (lk: string, ok: string, v: string) => setSt(s => ({ ...s, vars: { ...s.vars, [`${lk}/${ok}`]: v } }))
  const apply = async () => { setBusy(true); const er = await applyBuild(entry as Entry, cl, all ?? []); setBusy(false); if (er) return alert(er.message); onDone?.() }
  const grp = groupOfBuild(cl)
  const preset = (i: number) => { const p = PRESETS[i]; if (p) { const h = hintsOf(entry, p.sys); const sel = { ...p.sel, ...(h.type ? { type: h.type } : {}), ...(h.extra ? { extra: [...new Set([...(p.sel.extra ?? []), ...h.extra])] } : {}) }; setSt({ sys: p.sys, sel, vars: p.vars ?? {}, extra: st.extra }); setQuick(true); setFine(false) } }
  const chg = (k: System['k']) => { setSt({ sys: k, sel: {}, vars: {}, extra: st.extra }); setQuick(false); setFine(false) }
  return <div style={{ marginBottom: 12 }}>
    <div className="row between"><b>🧱 Cấu tạo lớp (tích chọn)</b><a className="small" style={{ cursor: 'pointer' }} onClick={() => setShow(!show)}>{show ? 'thu gọn' : 'mở'}</a></div>
    {show && <div className="card" style={{ padding: 8, marginTop: 6 }}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {SYSTEMS.map(x => <span key={x.k} className={'chip' + (x.k === st.sys ? ' on' : '')} onClick={() => chg(x.k)}>{x.vn}</span>)}
      </div>
      <select style={{ width: '100%', marginBottom: 6 }} value="" onChange={e => e.target.value && preset(Number(e.target.value) - 1)}>
        <option value="">⚡ Mẫu nhanh (vật liệu cơ bản – chọn sẵn các lớp, rồi tích sửa)…</option>
        {PRESETS.map((p, i) => p.sys === st.sys ? <option key={i} value={i + 1}>{p.label}</option> : null)}
      </select>
      {quick && <div className="small" style={{ marginBottom: 6 }}>✓ Đã chọn mẫu nhanh – không cần tích từng lớp. <a style={{ cursor: 'pointer' }} onClick={() => setFine(!fine)}>{fine ? 'ẩn các lớp' : '✎ sửa từng lớp'}</a></div>}
      {(!quick || fine) && layers.map(l => <div key={l.k} style={{ marginBottom: 8 }}>
        <div className="small"><b>{l.vn}</b>{l.multi ? <span className="muted"> (chọn nhiều)</span> : null}{l.hint && <span className="muted"> – {l.hint}</span>}</div>
        {l.opts.map(op => {
          const on = (cl.sel[l.k] ?? []).includes(op.k)
          return <div key={op.k} style={{ marginTop: 2 }}>
            <label className="small" style={{ cursor: 'pointer' }}>
              <input type={l.multi ? 'checkbox' : 'radio'} name={`${l.k}`} checked={on} onChange={() => toggle(l.k, op.k, l.multi)} onClick={() => { if (!l.multi && on) toggle(l.k, op.k) }} /> {op.vn}{op.tip && <span className="muted"> – {op.tip}</span>}
            </label>
            {on && op.vars && <select style={{ marginLeft: 8 }} value={cl.vars[`${l.k}/${op.k}`] ?? ''} onChange={e => setVar(l.k, op.k, e.target.value)}>
              <option value="">— chọn —</option>{op.vars.map(v => <option key={v}>{v}</option>)}
            </select>}
          </div>
        })}
      </div>)}
      <textarea rows={2} placeholder="Mô tả thêm (tự viết, sẽ nối vào cuối thông số)…" style={{ width: '100%' }} value={st.extra ?? ''} onChange={e => setSt({ ...st, extra: e.target.value })} />
      {(pv.vn.length > 0) && <div className="small" style={{ background: '#faf6ef', padding: 6, borderRadius: 6, marginTop: 6, whiteSpace: 'pre-wrap' }}>
        {pv.vn.map(l => (l.startsWith('  ') ? l : '- ' + l)).join('\n')}
        {pv.composition && <div className="muted">Cấu tạo: {pv.composition}</div>}
      </div>}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6, gap: 8, alignItems: 'center' }}>
        <span className="small" style={{ color: grp ? '#2f7d4f' : '#b45309' }}>{grp ? `✓ Đủ dữ liệu → nhóm ${grp}, tự chuyển ký hiệu/hạng mục` : 'Chưa tích đủ (cốt + hoàn thiện) → chưa phân loại, ô bên ngoài sẽ hiện đỏ'}</span>
        {draft ? <span className="small muted">Sẽ áp dụng khi bấm “Tạo mã mới”</span> : <button className="btn sm primary" disabled={busy || !pv.vn.length} onClick={apply}>{busy ? 'Đang lưu…' : 'Áp dụng cấu tạo'}</button>}
      </div>
    </div>}
  </div>
}
