import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { intlPrefix, pickerFamilies, prefixLabel } from '../lib/sections'
import { allGroups } from '../lib/sections'

/** Chọn nhóm vật liệu = chọn tiền tố ký hiệu bản vẽ (liên kết 2 chiều): danh sách xếp theo họ vật liệu, có ô tìm */
export default function GroupPicker({ value, onPick, compact, disabled }: { value: string; onPick: (g: string) => void; compact?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState('')
  const btn = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0, w: 340 })
  const cur = allGroups().find(g => g.code === value)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [open])
  const fams = useMemo(() => {
    const t = q.trim().toLowerCase()
    return pickerFamilies().map(f => ({ ...f, groups: f.groups.filter(g => !t || `${intlPrefix(g.code)} ${g.code} ${g.vn} ${g.en} ${f.label}`.toLowerCase().includes(t)) })).filter(f => f.groups.length)
  }, [q, open]) // eslint-disable-line
  const show = () => {
    const r = btn.current!.getBoundingClientRect(), w = Math.max(compact ? 380 : r.width, 340)
    setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), y: Math.min(r.bottom + 4, window.innerHeight - 380), w }); setQ(''); setOpen(true)
  }
  return <>
    <button type="button" ref={btn} disabled={disabled} className={'grp-btn' + (compact ? ' compact' : '')} onClick={ev => { ev.stopPropagation(); show() }} title="Đổi nhóm vật liệu – ký hiệu bản vẽ và vị trí trong bảng đổi theo">
      {compact ? <>{intlPrefix(value)} ▾</> : <>{prefixLabel(intlPrefix(value))} – {cur?.vn ?? value} <span className="grp-caret">▾</span></>}
    </button>
    {open && createPortal(<div className="grp-bg" onMouseDown={() => setOpen(false)}>
      <div className="grp-pop" style={{ left: pos.x, top: pos.y, width: pos.w }} onMouseDown={e => e.stopPropagation()}>
        <input autoFocus placeholder="Tìm: gỗ, đá, EWD, melamine…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="grp-list">{fams.map(f => <div key={f.label}>
          <div className="grp-fam">{f.label}</div>
          {f.groups.map(g => <div key={g.code} className={'grp-item' + (g.code === value ? ' on' : '')} onClick={() => { setOpen(false); onPick(g.code) }}>
            <b>{intlPrefix(g.code)}</b><span className="grp-en">{prefixLabel(intlPrefix(g.code)).replace(/^[A-Z]+ /, '')}</span><span className="grp-vn">{g.vn}</span>
          </div>)}
        </div>)}{!fams.length && <div className="small muted" style={{ padding: 8 }}>Không có nhóm khớp.</div>}</div>
      </div>
    </div>, document.body)}
  </>
}
