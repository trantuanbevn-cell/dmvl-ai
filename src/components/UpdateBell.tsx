import { useEffect, useRef, useState } from 'react'

declare const __BUILD_ID__: string
const CUR = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'
type Info = { id: string; time?: string; note?: string }

/** Chuông thông báo: khi có bản cập nhật mới (version.json trên máy chủ khác bản đang chạy) → hiện chấm đỏ + nút “Tải lại”. */
export default function UpdateBell() {
  const [info, setInfo] = useState<Info | null>(null)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (CUR === 'dev') return
    const check = async () => {
      try {
        const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const j = (await r.json()) as Info
        if (j.id && j.id !== CUR) setInfo(j)
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
  const reload = () => { const u = new URL(location.href); u.searchParams.set('v', String(Date.now())); location.replace(u.toString()) }
  return (
    <div className="bell" ref={box}>
      <button className="btn ghost sm bell-btn" onClick={() => setOpen(o => !o)} title="Thông báo">🔔{info && <span className="bell-dot" />}</button>
      {open && <div className="bell-pop">
        <b>Thông báo</b>
        {info ? <div className="bell-item">
          <div><b>Có bản cập nhật mới</b>{info.time && <span className="small muted"> · {new Date(info.time).toLocaleString('vi-VN')}</span>}</div>
          <div className="small muted">{info.note || 'Bấm “Tải lại” để dùng phiên bản mới nhất. Nên lưu phần đang nhập trước khi tải lại.'}</div>
          <button className="btn primary sm" onClick={reload}>⟳ Tải lại trang</button>
        </div> : <div className="small muted" style={{ padding: '8px 0' }}>Bạn đang dùng phiên bản mới nhất.</div>}
      </div>}
    </div>
  )
}
