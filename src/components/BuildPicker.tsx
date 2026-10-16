// Chọn cấu tạo lớp tường / trần / sàn bằng cách tích: khung → cốt → hoàn thiện (sơn: bả, lót, phủ) → tự sinh thông số kỹ thuật đúng vật liệu.
import { useMemo, useState } from 'react'
import type { Entry } from '../lib/types'
import { SYSTEMS, systemOf, guessSystem, cleanSel, renderBuild, applyBuild, type BuildState, type System } from '../lib/construction'

export default function BuildPicker({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  const init: BuildState = entry.build?.sys ? entry.build : { sys: guessSystem(entry), sel: {}, vars: {} }
  const [st, setSt] = useState<BuildState>(init), [busy, setBusy] = useState(false), [show, setShow] = useState(!!entry.build)
  const sys = systemOf(st.sys), cl = useMemo(() => cleanSel(sys, st), [sys, st])
  const pv = useMemo(() => renderBuild(cl), [cl])
  const layers = sys.layers.filter(l => !l.when || l.when(cl.sel))
  const toggle = (lk: string, ok: string, multi?: boolean) => setSt(s => {
    const cur = cleanSel(systemOf(s.sys), s).sel[lk] ?? []
    const next = cur.includes(ok) ? cur.filter(x => x !== ok) : multi ? [...cur, ok] : [ok]
    return cleanSel(systemOf(s.sys), { ...s, sel: { ...s.sel, [lk]: next } })
  })
  const setVar = (lk: string, ok: string, v: string) => setSt(s => ({ ...s, vars: { ...s.vars, [`${lk}/${ok}`]: v } }))
  const apply = async () => { setBusy(true); const er = await applyBuild(entry, cl); setBusy(false); if (er) return alert(er.message); onDone() }
  const chg = (k: System['k']) => setSt({ sys: k, sel: {}, vars: {}, extra: st.extra })
  return <div style={{ marginBottom: 12 }}>
    <div className="row between"><b>🧱 Cấu tạo lớp (tích chọn)</b><a className="small" style={{ cursor: 'pointer' }} onClick={() => setShow(!show)}>{show ? 'thu gọn' : 'mở'}</a></div>
    {show && <div className="card" style={{ padding: 8, marginTop: 6 }}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {SYSTEMS.map(x => <span key={x.k} className={'chip' + (x.k === st.sys ? ' on' : '')} onClick={() => chg(x.k)}>{x.vn}</span>)}
      </div>
      {layers.map(l => <div key={l.k} style={{ marginBottom: 8 }}>
        <div className="small"><b>{l.vn}</b>{l.multi ? <span className="muted"> (chọn nhiều)</span> : null}{l.hint && <span className="muted"> – {l.hint}</span>}</div>
        {l.opts.map(op => {
          const on = (cl.sel[l.k] ?? []).includes(op.k)
          return <div key={op.k} style={{ marginTop: 2 }}>
            <label className="small" style={{ cursor: 'pointer' }}>
              <input type={l.multi ? 'checkbox' : 'radio'} name={`${l.k}`} checked={on} onChange={() => toggle(l.k, op.k, l.multi)} onClick={() => { if (!l.multi && on) toggle(l.k, op.k) }} /> {op.vn}
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
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
        <button className="btn sm primary" disabled={busy || !pv.vn.length} onClick={apply}>{busy ? 'Đang lưu…' : 'Điền vào thông số kỹ thuật'}</button>
      </div>
    </div>}
  </div>
}
