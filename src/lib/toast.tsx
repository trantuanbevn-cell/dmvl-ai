import { useEffect, useState } from 'react'

type T = { id: number; text: string; kind: 'ok' | 'info' }
/** Gửi thông báo nhỏ góc màn hình từ bất kỳ đâu */
export const toast = (text: string, kind: T['kind'] = 'info') => window.dispatchEvent(new CustomEvent('dmvl-toast', { detail: { text, kind } }))

export function Toaster() {
  const [list, setList] = useState<T[]>([])
  useEffect(() => {
    let n = 0
    const on = (ev: Event) => {
      const { text, kind } = (ev as CustomEvent).detail, id = ++n
      setList(l => [...l.slice(-3), { id, text, kind }])
      setTimeout(() => setList(l => l.filter(x => x.id !== id)), 7000)
    }
    window.addEventListener('dmvl-toast', on); return () => window.removeEventListener('dmvl-toast', on)
  }, [])
  return <div className="toasts">{list.map(t => <div key={t.id} className={'toast ' + t.kind} onClick={() => setList(l => l.filter(x => x.id !== t.id))}>{t.text}</div>)}</div>
}
