import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../lib/auth'

declare const __BUILD_ID__: string
const CUR = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'
type Info = { id: string; time?: string; note?: string; scope?: string; silent?: boolean }

/** Chuông thông báo: khi có bản cập nhật mới (version.json trên máy chủ khác bản đang chạy) → hiện chấm đỏ + nút “Tải lại”. */
export default function UpdateBell() {
  const { can } = useAuth()
  const canRef = useRef(can); canRef.current = can
  const [info, setInfo] = useState<Info | null>(null)
  const [open, setOpen] = useState(false)
  const [pop, setPop] = useState(false)   // hộp thông báo đẩy giữa màn hình
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (CUR === 'dev') return
    const check = async () => {
      try {
        const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const j = (await r.json()) as Info
        if (j.id && j.id !== CUR && !j.silent && (!j.scope || canRef.current(j.scope))) {   // bản cập nhật riêng một tính năng chỉ báo cho người có quyền tính năng đó
           setInfo(j); let seen = ''; try { seen = sessionStorage.getItem('dmvl-upd-seen') ?? '' } catch { /* */ } if (seen !== j.id) setPop(true) }
      } catch { /* mất mạng: bỏ qua */ }
    }
    check()
    const t = setInterval(check, 90_000)
    const vis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [])
  useEffect(() => {
    const f = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f)
  }, [])
  const later = () => { setPop(false); try { if (info) sessionStorage.setItem('dmvl-upd-seen', info.id) } catch { /* */ } }
  const reload = () => { const u = new URL(location.href); u.searchParams.set('v', String(Date.now())); location.replace(u.toString()) }
  return (
    <div className="bell" ref={box}>
      <button className={'btn ghost sm bell-btn' + (info ? ' ring' : '')} onClick={() => setOpen(o => !o)} title="Thông báo">🔔{info && <span className="bell-dot" />}</button>
      {open && <div className="bell-pop">
        <b>Thông báo</b>
        {info ? <div className="bell-item">
          <div><b>Bản cập nhật mới</b>{info.time && <span className="small muted"> · {new Date(info.time).toLocaleString('vi-VN')}</span>}</div>
          {info.note && <div className="small muted">{info.note}</div>}
          <button className="btn primary sm" onClick={reload}>Cập nhật</button>
        </div> : <div className="small muted" style={{ padding: '8px 0' }}>Không có thông báo.</div>}
      </div>}
      {pop && info && createPortal(
        <div className="upd-bg">
          <div className="upd-box" role="status" aria-label="Bản cập nhật mới">
            <h3>Bản cập nhật mới</h3>
            {info.note && <p>{info.note}</p>}
            {info.time && <div className="small muted">{new Date(info.time).toLocaleString('vi-VN')}</div>}
            <div className="upd-act"><button className="btn" onClick={later}>Sau</button><button className="btn primary" onClick={reload}>Cập nhật</button></div>
          </div>
        </div>, document.body)}
    </div>
  )
}
