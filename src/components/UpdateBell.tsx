import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

declare const __BUILD_ID__: string
const CUR = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'
type Info = { id: string; time?: string; note?: string }

/** Chuông thông báo: khi có bản cập nhật mới (version.json trên máy chủ khác bản đang chạy) → hiện chấm đỏ + nút “Tải lại”. */
export default function UpdateBell() {
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
        if (j.id && j.id !== CUR) { setInfo(j); let seen = ''; try { seen = sessionStorage.getItem('dmvl-upd-seen') ?? '' } catch { /* */ } if (seen !== j.id) setPop(true) }
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
          <div><b>Có bản cập nhật mới</b>{info.time && <span className="small muted"> · {new Date(info.time).toLocaleString('vi-VN')}</span>}</div>
          <div className="small muted">{info.note || 'Bấm “Tải lại” để dùng phiên bản mới nhất. Nên lưu phần đang nhập trước khi tải lại.'}</div>
          <button className="btn primary sm" onClick={reload}>⟳ Tải lại trang</button>
        </div> : <div className="small muted" style={{ padding: '8px 0' }}>Bạn đang dùng phiên bản mới nhất.</div>}
      </div>}
      {pop && info && createPortal(
        <div className="upd-bg">
          <div className="upd-box" role="alertdialog" aria-label="Có bản cập nhật mới">
            <div className="upd-ic">🔔</div>
            <h3>Có bản cập nhật mới</h3>
            <p>{info.note || 'Phần mềm vừa được nâng cấp. Bấm xác nhận để tải lại trang và dùng phiên bản mới nhất.'}</p>
            {info.time && <div className="small muted">Phát hành lúc {new Date(info.time).toLocaleString('vi-VN')}</div>}
            <p className="small muted">Dữ liệu đã nhập đều được lưu tự động. Nếu đang gõ dở, hãy bấm ra ngoài ô để lưu trước khi xác nhận.</p>
            <div className="upd-act"><button className="btn" onClick={later}>Để sau</button><button className="btn primary" autoFocus onClick={reload}>✓ Xác nhận & tải lại</button></div>
          </div>
        </div>, document.body)}
    </div>
  )
}
