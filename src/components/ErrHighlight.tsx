import { createContext, useContext, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** Lỗi đang cần chỉ ra trong bảng vật liệu (mở từ phần kiểm lỗi): ô nào, đoạn chữ nào – tô đỏ đúng chỗ đó */
export type ErrHl = { entryId: string; field: string; text?: string | null; why?: string }
export const ErrHlCtx = createContext<ErrHl | null>(null)
export const useErrHl = (entryId: string, field: string) => { const h = useContext(ErrHlCtx); return h && h.entryId === entryId && h.field === field ? h : null }

const COPY = ['fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'fontVariant', 'fontStretch', 'fontKerning', 'fontFeatureSettings', 'textRendering', 'textTransform', 'textIndent', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'textAlign', 'wordSpacing', 'tabSize'] as const
/** Lớp nền nằm DƯỚI ô chữ (ô chữ trong suốt): chép đúng chữ + kiểu chữ của ô, đoạn lỗi được tô nền đỏ → thấy đỏ đúng vị trí trong ô, vẫn sửa trực tiếp được */
export function HlBackdrop({ target, value, hl }: { target: RefObject<HTMLTextAreaElement | HTMLInputElement | null>; value: string; hl: ErrHl }) {
  const box = useRef<HTMLDivElement>(null)
  const [st, setSt] = useState<React.CSSProperties>({})
  useLayoutEffect(() => {
    const t = target.current; if (!t) return
    const sync = () => { const cs = getComputedStyle(t), o: any = {}
      for (const k of COPY) o[k] = (cs as any)[k]
      o.left = t.offsetLeft; o.top = t.offsetTop; o.width = t.offsetWidth; o.height = t.offsetHeight
      setSt(o) }
    sync(); const raf = requestAnimationFrame(sync)   // ô tự giãn cao sau khi vẽ → đo lại
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null; ro?.observe(t)
    return () => { cancelAnimationFrame(raf); ro?.disconnect() }
  }, [target, value])
  // cuộn tới đúng ô lỗi (một lần khi mở)
  useLayoutEffect(() => { const t = target.current; if (t) setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150) }, [target])
  const i = hl.text ? value.indexOf(hl.text) : -1
  return <div ref={box} aria-hidden className="hl-back" style={st}>
    {i >= 0 ? <>{value.slice(0, i)}<mark>{value.slice(i, i + hl.text!.length)}</mark>{value.slice(i + hl.text!.length)}</> : value}{'​'}
  </div>
}
