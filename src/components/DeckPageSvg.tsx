import { PW, PH } from '../lib/sheetLayout'
import { wrapText, type DeckPage, type Theme } from '../lib/deck'

type P = { page: DeckPage; theme: Theme; project: string; no: number; url: (path: string) => string | undefined; onSlot?: (slot: string) => void }

/** Ô ảnh: tô nền, ảnh cắt vừa khung (slice); chưa có ảnh thì hiện khung gợi ý (.ui-only – không xuất ra PDF/PNG) */
function Slot({ x, y, w, h, label, href, theme, onClick, stroke, sw = 0, opacity = 1 }: { x: number; y: number; w: number; h: number; label: string; href?: string; theme: Theme; onClick?: () => void; stroke?: string; sw?: number; opacity?: number }) {
  const id = 'c' + Math.round(x) + '_' + Math.round(y) + '_' + Math.round(w)
  return <g onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }} opacity={opacity}>
    <rect x={x} y={y} width={w} height={h} fill={theme.slot} />
    {href && <><clipPath id={id}><rect x={x} y={y} width={w} height={h} /></clipPath><image href={href} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} /></>}
    {sw > 0 && <rect x={x} y={y} width={w} height={h} fill="none" stroke={stroke} strokeWidth={sw} />}
    {!href && <g className="ui-only"><rect x={x + 10} y={y + 10} width={w - 20} height={h - 20} fill="none" stroke="#8a8a8a" strokeWidth={2} strokeDasharray="10 8" />
      <text x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize={Math.min(30, w / 11)} fill="#777" fontFamily="Arial">＋ {label}</text></g>}
  </g>
}
/** Vị trí baseline của hộp chữ Canva: top + cỡ chữ × (lineHeight/2 + 0.34) */
const base = (top: number, size: number, lh: number) => top + size * (lh / 2 + 0.34)

function Header({ page, theme, mode }: { page: DeckPage; theme: Theme; mode: 'zone' | 'render' }) {
  const z = mode === 'zone'
  const tx = z ? 1242.7 + 522.4 / 2 : 1043.9 + 522.4 / 2
  return <g>
    {z ? <><rect x={1771.5} y={16.2} width={148.5} height={48.7} fill={theme.taupe} /><rect x={0} y={70.5} width={1236.8} height={48.7} fill={theme.taupe} /></>
      : <><rect x={1556.8} y={16.2} width={363.2} height={48.7} fill={theme.taupe} /><rect x={0} y={70.5} width={1043.9} height={48.7} fill={theme.taupe} /></>}
    <text x={tx} y={base(8.7, 53.3, 1.26)} textAnchor="middle" fontSize={46} letterSpacing={0} fill={theme.ink2} fontFamily={theme.serif}>{(page.brand ?? '').toUpperCase()}</text>
    <text x={z ? 1863.8 : 1896.3} y={base(z ? 79.2 : 74.8, 33.3, 1.05)} textAnchor="end" fontSize={33.3} fontWeight="bold" letterSpacing={0.7} fill={theme.ink2} fontFamily={theme.sans}>{(page.head ?? '').toUpperCase()}</text>
  </g>
}

export default function DeckPageSvg({ page, theme, project, url, onSlot }: P) {
  const img = (k: string) => (page.img?.[k] ? url(page.img[k]) : undefined)
  const slot = (k: string, label: string, x: number, y: number, w: number, h: number, extra: { stroke?: string; sw?: number; opacity?: number } = {}) =>
    <Slot x={x} y={y} w={w} h={h} label={label} href={img(k)} theme={theme} onClick={onSlot ? () => onSlot(k) : undefined} {...extra} />
  let body: React.ReactNode = null
  let bg = theme.bg
  if (page.type === 'cover') {
    bg = theme.bg2
    const t = wrapText(page.title ?? '', 86.6, 1000)
    body = <g>
      <rect x={1645.6} y={0} width={274.4} height={458.3} fill={theme.rust} />
      <rect x={1064.2} y={513.8} width={187.1} height={566.2} fill={theme.rust} />
      <rect x={1251.2} y={458.3} width={668.8} height={621.7} fill={theme.orange} />
      {slot('hero', 'Ảnh bìa (dọc)', 1115.4, 108, 696.6, 864, { stroke: '#fff', sw: 10 })}
      <rect x={1064.2} y={87.4} width={187.1} height={178.9} fill={theme.orange} />
      <rect x={0} y={902.1} width={654.5} height={69.9} fill={theme.orange} />
      <rect x={0} y={0} width={389.1} height={45.6} fill={theme.rust} />
      <text x={40.2} y={base(266.3, 36.9, 1.4)} fontSize={36.9} fill={theme.ink} fontFamily={theme.sans}>{(page.subtitle ?? '').toUpperCase()}</text>
      {t.map((l, i) => <text key={i} x={35} y={base(350.3 + i * 105.7, 86.6, 1.22)} fontSize={86.6} letterSpacing={-1} fill={theme.ink} fontFamily={theme.serif}>{l.toUpperCase()}</text>)}
      <text x={35} y={base(916.5, 34.7, 1.2)} fontSize={34.7} fill="#fff" fontFamily={theme.sans}>{page.body}</text>
      {!page.body && <text className="ui-only" x={35} y={base(916.5, 34.7, 1.2)} fontSize={26} fill="#fff" fontFamily={theme.sans}>{project}</text>}
    </g>
  } else if (page.type === 'zone') {
    const lines = (page.notes ?? '').split('\n').filter(l => l.trim())
    const cols = [lines.slice(0, 24), lines.slice(24, 48)]
    body = <g>
      {slot('plan', 'Mặt bằng phóng to (tải ảnh)', 37.7, 158.4, 1251.5, 874.1, { stroke: theme.red, sw: 4 })}
      <Header page={page} theme={theme} mode="zone" />
      {slot('key', 'Key-plan', 1350, 685, 562.8, 339.9, { opacity: 0.85 })}
      <text x={1343.2} y={base(147.7, 24.4, 1.4)} fontSize={24.4} fontWeight="bold" letterSpacing={1.7} fill={theme.red} fontFamily={theme.sans}>Ghi chú:</text>
      <text x={1343.2} y={base(147.7, 24.4, 1.4) + 30} fontSize={19.3} fontWeight="bold" fill={theme.text} fontFamily={theme.sans}>diện tích các khu vực</text>
      {cols.map((c, ci) => c.map((l, i) => { const [nm, ar] = l.split('|'); const x = 1343.2 + ci * 330, y = 236 + i * 19
        return <g key={ci + '_' + i}><text x={x} y={y} fontSize={12.5} fill={theme.text} fontFamily={theme.sans}>{(nm ?? '').trim()}</text><text x={x + 215} y={y} fontSize={12.5} fill={theme.text} fontFamily={theme.sans}>{(ar ?? '').trim()}</text></g> }))}
      <rect x={1661.3} y={890.4} width={199.4} height={134.6} rx={19} fill="none" stroke={theme.red} strokeWidth={4} className="ui-only" />
    </g>
  } else if (page.type === 'render') {
    const body2 = wrapText(page.body ?? '', 18, 360)
    body = <g>
      <rect x={0} y={139.9} width={442.2} height={913.9} fill={theme.panel} />
      {slot('main', 'Ảnh phối cảnh (tải ảnh)', 465.8, 139.9, 1431.8, 913.9)}
      {slot('key', 'Key-plan', 41.6, 735, 360, 300)}
      <Header page={page} theme={theme} mode="render" />
      <text x={41.6} y={base(245.4, 26.1, 1.4)} fontSize={26.1} fontWeight="bold" letterSpacing={3} fill={theme.text} fontFamily={theme.sans}>{(page.title ?? '').toUpperCase()}</text>
      <text x={41.6} y={base(245.4, 26.1, 1.4) + 36.6} fontSize={26.1} fontWeight="bold" letterSpacing={3} fill={theme.ink2} fontFamily={theme.sans}>{(page.subtitle ?? '').toUpperCase()}</text>
      <text x={41.6} y={base(329.3, 21.8, 1.4) + 12} fontSize={21.8} fontStyle="italic" letterSpacing={2.6} fill={theme.text} fontFamily={theme.sans}>{(page.area ?? '').toUpperCase()}</text>
      {body2.map((l, i) => <text key={i} x={41.6} y={400 + i * 26} fontSize={18} fill={theme.text} fontFamily={theme.sans}>{l}</text>)}
    </g>
  } else {
    bg = theme.bg2
    const t = wrapText(page.title ?? '', 86.6, 1000), b = wrapText(page.body ?? '', 30, 1000)
    body = <g>
      <rect x={0} y={0} width={389.1} height={45.6} fill={theme.rust} />
      <rect x={1645.6} y={0} width={274.4} height={458.3} fill={theme.rust} />
      <rect x={1251.2} y={458.3} width={668.8} height={621.7} fill={theme.orange} />
      <rect x={0} y={902.1} width={654.5} height={69.9} fill={theme.orange} />
      {t.map((l, i) => <text key={i} x={140} y={base(430 + i * 105.7, 86.6, 1.22)} fontSize={86.6} letterSpacing={-1} fill={theme.ink} fontFamily={theme.serif}>{l.toUpperCase()}</text>)}
      {b.map((l, i) => <text key={i} x={144} y={base(540 + t.length * 60 + i * 42, 30, 1.4)} fontSize={30} fill={theme.ink} fontFamily={theme.sans}>{l}</text>)}
    </g>
  }
  return <g><rect width={PW} height={PH} fill={bg} />{body}</g>
}
