import { useEffect, useState } from 'react'
import { FLOORS, floorLabel } from '../lib/roomMatrix'

/** Ô nhập tầng tự do (gõ "Tầng 5", "B1", "Mái"…), có gợi ý từ các tầng đã dùng trong dự án và danh sách mẫu. Lưu khi rời ô / chọn gợi ý */
export default function FloorInput({ value, used, onCommit, id, width = '100%', placeholder = 'Tầng…' }: { value?: string | null; used: (string | null | undefined)[]; onCommit: (v: string | null) => void; id: string; width?: number | string; placeholder?: string }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => setV(value ?? ''), [value])
  const opts = [...new Set([...used.filter(Boolean) as string[], ...FLOORS.map(f => f.key)])]
  const commit = (x: string) => { const t = x.trim(); if (t !== (value ?? '')) onCommit(t || null) }
  return <>
    <input list={'fl-' + id} value={v} placeholder={placeholder} style={{ width }} onClick={e => e.stopPropagation()}
      onChange={e => { setV(e.target.value); if (opts.includes(e.target.value)) commit(e.target.value) }}
      onBlur={e => commit(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    <datalist id={'fl-' + id}>{opts.map(k => <option key={k} value={k}>{floorLabel(k)}</option>)}</datalist>
  </>
}
