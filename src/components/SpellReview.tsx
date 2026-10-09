import { useMemo, useState } from 'react'
import type { ProjectData } from '../lib/useProject'
import { applySpell, addSkip, type SpellItem } from '../lib/spellScan'
import { addUserWord } from '../lib/spell'
import { toast } from '../lib/toast'

/** Danh sách lỗi chính tả / dấu câu: xem trước → sau, sửa tay, chọn gợi ý, sửa tất cả các lỗi tự sửa được */
export default function SpellReview({ d, items, onClose, onOpenEntry }: { d: ProjectData; items: SpellItem[]; onClose: () => void; onOpenEntry: (id: string) => void }) {
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [gone, setGone] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const list = useMemo(() => items.filter(i => !gone.includes(i.key)), [items, gone])
  const auto = list.filter(i => i.after !== i.before)
  const val = (i: SpellItem) => edit[i.key] ?? i.after
  const done = async (i: SpellItem, text: string) => { await applySpell(d, i, text); setGone(g => [...g, i.key]) }
  const save = async (i: SpellItem) => { setBusy(true); try { await done(i, val(i)); d.reload() } catch (e) { toast(String(e)) } setBusy(false) }
  const all = async () => {
    setBusy(true)
    try { for (const i of auto) await done(i, val(i)); toast(`Đã sửa ${auto.length} mục`, 'ok'); await d.reload() } catch (e) { toast(String(e)) }
    setBusy(false)
  }
  const pick = (i: SpellItem, w: string, s: string) => setEdit(x => ({ ...x, [i.key]: val(i).replace(new RegExp(`(?<![\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u'), s) }))
  const skip = (i: SpellItem) => { addSkip(i.key); setGone(g => [...g, i.key]) }
  const ignoreWord = (i: SpellItem, w: string) => { addUserWord(w); toast(`Đã thêm “${w}” vào từ điển riêng`, 'ok'); setEdit(x => ({ ...x })); setGone(g => [...g, i.key]) }
  return (
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal qc-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>✍️ Chính tả & dấu câu · {list.length} mục</h3>
          <div className="row gap">{auto.length > 0 && <button className="btn primary" disabled={busy} onClick={all}>✓ Sửa tất cả tự động ({auto.length})</button>}<button className="btn ghost sm" onClick={onClose}>✕</button></div>
        </div>
        <p className="small muted">Phần mềm tự sửa dấu câu, khoảng trắng, viết hoa đầu câu, vị trí dấu thanh và lỗi gõ chắc chắn. Từ nghi sai nhưng chưa chắc thì hiện gợi ý để bạn bấm chọn. Tên hãng, mã, tên riêng giữa câu được bỏ qua.</p>
        {!list.length && <div className="ok-text">✓ Không còn lỗi chính tả hoặc dấu câu.</div>}
        {list.map(i => (
          <div key={i.key} className="sp-item">
            <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}><div><b>{i.label}</b> <span className="chk-tag chk-info">{i.fieldLabel}</span></div>
              <div className="row gap">{i.kind === 'entry' && <button className="btn ghost sm" onClick={() => onOpenEntry(i.id)}>Mở & sửa</button>}<button className="btn ghost sm" onClick={() => skip(i)}>Bỏ qua</button></div></div>
            {i.after !== i.before && <div className="sp-diff small"><span className="sp-old">{i.before}</span><span className="sp-arrow">→</span><span className="sp-new">{i.after}</span></div>}
            <textarea data-lang={i.lang === 'vi' ? 'vn' : i.lang === 'en' ? 'en' : 'name'} rows={Math.min(5, Math.max(1, Math.ceil(val(i).length / 90)))} value={val(i)} onChange={e => setEdit(x => ({ ...x, [i.key]: e.target.value }))} />
            {i.flags.length > 0 && <div className="sp-flags small">{i.flags.map(f => (
              <span key={f.word} className="sp-flag"><b>{f.word}</b>{f.suggestions.length ? ' → ' : ' (không có gợi ý) '}{f.suggestions.slice(0, 4).map(s => <a key={s} onClick={() => pick(i, f.word, s)}>{s}</a>)}<a className="sp-ign" title="Từ đúng (tên riêng, thuật ngữ) – thêm vào từ điển riêng" onClick={() => ignoreWord(i, f.word)}>✓ đúng</a></span>))}</div>}
            <div className="row gap" style={{ justifyContent: 'flex-end' }}><button className="btn primary sm" disabled={busy} onClick={() => save(i)}>{val(i) === i.before ? 'Giữ nguyên & ẩn' : '✓ Lưu bản sửa'}</button></div>
          </div>))}
      </div>
    </div>)
}
