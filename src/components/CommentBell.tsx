import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useComments, type Comment } from '../lib/comments'

const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước` }
export const jumpUrl = (c: Comment) => `/p/${c.project_id}/materials?focus=${c.entry_id ?? ''}&cmt=${c.id}&t=${Date.now()}`

/** Hộp nhận xét: nhận xét người khác gửi cho tôi (để đó xem sau được), bấm "Mở" là tới đúng hạng mục/cột */
export default function CommentBell() {
  const { inbox, sent, open, unseen, markSeen, setDone } = useComments()
  const [show, setShow] = useState(false), [tab, setTab] = useState<'in' | 'out'>('in'), [all, setAll] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  useEffect(() => { const f = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setShow(false) }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f) }, [])
  const rows = (tab === 'in' ? inbox : sent).filter(c => all || c.status === 'open')
  const go = (c: Comment) => { markSeen(c.id); setShow(false); nav(jumpUrl(c)) }
  return (
    <div className="bell" ref={box}>
      <button className={'btn ghost sm bell-btn' + (unseen ? ' ring' : '')} onClick={() => setShow(o => !o)} title="Nhận xét gửi cho bạn">💬{open > 0 && <span className="cm-n">{open}</span>}</button>
      {show && <div className="bell-pop cm-pop">
        <div className="row between"><b>Nhận xét</b><label className="small"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> hiện cả đã xử lý</label></div>
        <div className="row gap sm-gap" style={{ margin: '6px 0' }}>
          <button className={'chip' + (tab === 'in' ? ' on' : '')} onClick={() => setTab('in')}>Gửi cho tôi ({open})</button>
          <button className={'chip' + (tab === 'out' ? ' on' : '')} onClick={() => setTab('out')}>Tôi đã gửi</button>
        </div>
        {!rows.length && <div className="small muted" style={{ padding: '8px 0' }}>{tab === 'in' ? 'Không có nhận xét nào đang chờ.' : 'Chưa có nhận xét nào.'}</div>}
        <div className="cm-list">{rows.map(c => (
          <div key={c.id} className={'cm-item' + (c.status === 'done' ? ' done' : '') + (tab === 'in' && c.status === 'open' && !c.seen_at ? ' new' : '')}>
            <div className="small muted">{tab === 'in' ? <b>{c.author_name ?? '?'}</b> : 'Gửi đi'} · {ago(c.created_at)}{c.status === 'done' ? ' · ✓ đã xử lý' : ''}</div>
            <div className="small"><b>{c.entry_code ?? 'Bảng'}</b>{c.col ? ` · ${c.col}` : ''}</div>
            <div className="cm-body">{c.body}</div>
            <div className="row gap sm-gap">
              <button className="btn primary sm" onClick={() => go(c)}>Mở đúng chỗ</button>
              {tab === 'in' || c.status === 'open' ? <button className="btn sm" onClick={() => setDone(c.id, c.status === 'open')}>{c.status === 'open' ? '✓ Đã xử lý' : '↺ Mở lại'}</button> : null}
            </div>
          </div>))}</div>
        <div className="small muted" style={{ marginTop: 6 }}>Chưa xử lý thì cứ để đó – nhận xét vẫn nằm ở đây, bạn xem sau được.</div>
      </div>}
    </div>
  )
}
