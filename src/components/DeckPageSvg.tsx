import { PW, PH } from '../lib/sheetLayout'
import { wrapEl, fontStack, type DeckPage, type El, type Theme } from '../lib/deck'

type P = { page: DeckPage; theme: Theme; project?: string; no?: number; url: (path: string) => string | undefined; hideId?: string }

const rot = (e: El, h: number) => (e.r ? `rotate(${e.r} ${e.x + e.w / 2} ${e.y + h / 2})` : undefined)

export function ElView({ e, theme, url, hide }: { e: El; theme: Theme; url: (p: string) => string | undefined; hide?: boolean }) {
  if (e.k === 'text') {
    const size = e.size ?? 24, lh = e.lh ?? 1.3, lines = hide ? [] : wrapEl(e, theme)
    const x = e.al === 'middle' ? e.x + e.w / 2 : e.al === 'end' ? e.x + e.w : e.x
    return <g data-id={e.id} transform={rot(e, lines.length * size * lh)} opacity={e.op ?? 1}>
      <rect x={e.x} y={e.y} width={e.w} height={Math.max(wrapEl(e, theme).length * size * lh, 10)} fill="transparent" />
      {lines.map((l, i) => <text key={i} x={x} y={e.y + i * size * lh + size * (lh / 2 + 0.34)} textAnchor={e.al ?? 'start'} fontSize={size} fontWeight={e.b ? 'bold' : 'normal'} fontStyle={e.i ? 'italic' : 'normal'} letterSpacing={e.ls ?? 0} fill={e.c ?? '#000'} fontFamily={fontStack(theme, e)} xmlSpace="preserve">{l}</text>)}
    </g>
  }
  const href = e.k === 'image' && e.src ? url(e.src) : undefined
  const cid = 'cl' + e.id
  return <g data-id={e.id} transform={rot(e, e.h)} opacity={e.op ?? 1}>
    <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={e.rx ?? 0} fill={e.fill ?? 'none'} />
    {href && <><clipPath id={cid}><rect x={e.x} y={e.y} width={e.w} height={e.h} rx={e.rx ?? 0} /></clipPath><image href={href} x={e.x} y={e.y} width={e.w} height={e.h} preserveAspectRatio={e.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'} clipPath={`url(#${cid})`} /></>}
    {e.k === 'image' && !href && <g className="ui-only"><rect x={e.x + 10} y={e.y + 10} width={Math.max(0, e.w - 20)} height={Math.max(0, e.h - 20)} fill="none" stroke="#8a8a8a" strokeWidth={2} strokeDasharray="10 8" />
      <text x={e.x + e.w / 2} y={e.y + e.h / 2} textAnchor="middle" fontSize={Math.min(30, e.w / 11)} fill="#777" fontFamily="Arial">＋ {e.label ?? 'Ảnh'}</text></g>}
    {(e.sw ?? 0) > 0 && <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={e.rx ?? 0} fill="none" stroke={e.stroke ?? '#000'} strokeWidth={e.sw} />}
  </g>
}

/** Vẽ 1 trang (không có khung chọn) – dùng cho bản xem nhỏ, xuất PDF/PNG */
export default function DeckPageSvg({ page, theme, url, hideId }: P) {
  return <g><rect width={PW} height={PH} fill={page.bg ?? theme.bg} />{(page.els ?? []).map(e => <ElView key={e.id} e={e} theme={theme} url={url} hide={e.id === hideId} />)}</g>
}
