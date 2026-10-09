import { PW, PH } from '../lib/sheetLayout'
import { wrapText, type DeckPage, type Theme } from '../lib/deck'

type P = { page: DeckPage; theme: Theme; project: string; no: number; url: (path: string) => string | undefined; onSlot?: (slot: string) => void }

function Slot({ x, y, w, h, label, href, theme, onClick }: { x: number; y: number; w: number; h: number; label: string; href?: string; theme: Theme; onClick?: () => void }) {
  return <g onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
    <rect x={x} y={y} width={w} height={h} fill={theme.slot} />
    {href ? <image href={href} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" />
      : <g className="ui-only"><rect x={x + 8} y={y + 8} width={w - 16} height={h - 16} fill="none" stroke="#8a8a8a" strokeWidth={2} strokeDasharray="10 8" />
        <text x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize={Math.min(30, w / 12)} fill="#777" fontFamily="Arial">＋ {label}</text></g>}
  </g>
}
function Header({ page, theme, left = 40 }: { page: DeckPage; theme: Theme; left?: number }) {
  return <g>
    <rect x={0} y={92} width={Math.max(60, left + 560 - 22)} height={42} fill={theme.band} />
    <rect x={1818} y={34} width={64} height={44} fill={theme.band} />
    <text x={left + 560} y={78} fontSize={60} letterSpacing={2} fill={theme.ink} fontFamily={theme.serif}>{page.title}</text>
    <text x={left + 560} y={124} fontSize={32} fontWeight="bold" letterSpacing={1} fill={theme.ink} fontFamily={theme.serif}>{page.subtitle}</text>
  </g>
}
export default function DeckPageSvg({ page, theme, project, no, url, onSlot }: P) {
  const img = (k: string) => (page.img?.[k] ? url(page.img[k]) : undefined)
  const slot = (k: string, label: string, x: number, y: number, w: number, h: number) => <Slot x={x} y={y} w={w} h={h} label={label} href={img(k)} theme={theme} onClick={onSlot ? () => onSlot(k) : undefined} />
  const num = <g><rect x={1866} y={PH - 42} width={26} height={22} fill="#7d7d7d" /><text x={1879} y={PH - 26} fontSize={14} fill="#fff" textAnchor="middle" fontFamily="Arial">{no}</text></g>
  let body: React.ReactNode = null
  if (page.type === 'cover') {
    const t = wrapText(page.title ?? '', 84, 640)
    body = <g>
      {slot('hero', 'Ảnh bìa', 760, 0, PW - 760, PH)}
      <rect x={0} y={PH / 2 - 190} width={740} height={44} fill={theme.band} />
      {t.map((l, i) => <text key={i} x={60} y={PH / 2 - 60 + i * 100} fontSize={84} fill={theme.ink} fontFamily={theme.serif} letterSpacing={2}>{l}</text>)}
      <text x={60} y={PH / 2 - 60 + t.length * 100 + 10} fontSize={34} fontWeight="bold" fill={theme.ink} fontFamily={theme.serif} letterSpacing={2}>{page.subtitle}</text>
      <text x={60} y={PH - 70} fontSize={26} fill={theme.ink} fontFamily={theme.sans}>{project}</text>
    </g>
  } else if (page.type === 'zone') {
    const notes = wrapText(page.notes ?? '', 22, 440)
    body = <g>
      <Header page={page} theme={theme} />
      {slot('plan', 'Mặt bằng phóng to (tải ảnh)', 40, 170, 1380, PH - 170 - 50)}
      {slot('key', 'Key-plan', 1450, 170, 430, 330)}
      <text x={1450} y={560} fontSize={26} fontWeight="bold" fill={theme.ink} fontFamily={theme.sans} letterSpacing={2}>GHI CHÚ</text>
      <rect x={1450} y={572} width={430} height={3} fill={theme.band} />
      {notes.map((l, i) => <text key={i} x={1450} y={612 + i * 32} fontSize={22} fill={theme.ink} fontFamily={theme.sans}>{l}</text>)}
      {num}
    </g>
  } else if (page.type === 'render') {
    const t = wrapText(page.title ?? '', 44, 440), b = wrapText(page.body ?? '', 22, 440)
    body = <g>
      <rect x={0} y={0} width={560} height={PH} fill={theme.panel} />
      {t.map((l, i) => <text key={i} x={50} y={110 + i * 54} fontSize={44} fill={theme.panelInk} fontFamily={theme.serif}>{l}</text>)}
      {page.subtitle && <text x={50} y={110 + t.length * 54 + 4} fontSize={24} fontWeight="bold" fill={theme.panelInk} fontFamily={theme.serif} letterSpacing={1}>{page.subtitle}</text>}
      {b.map((l, i) => <text key={i} x={50} y={110 + t.length * 54 + 70 + i * 32} fontSize={22} fill={theme.panelInk} fontFamily={theme.sans}>{l}</text>)}
      {slot('key', 'Key-plan', 50, PH - 400, 460, 340)}
      {slot('main', 'Ảnh phối cảnh (tải ảnh)', 590, 40, PW - 590 - 40, PH - 80)}
      {num}
    </g>
  } else {
    body = <g>
      <rect x={0} y={PH / 2 - 60} width={PW / 2 - 300} height={42} fill={theme.band} />
      <text x={PW / 2 - 260} y={PH / 2 - 20} fontSize={70} fill={theme.ink} fontFamily={theme.serif} letterSpacing={2}>{page.title}</text>
      {wrapText(page.body ?? '', 28, 1000).map((l, i) => <text key={i} x={PW / 2 - 260} y={PH / 2 + 50 + i * 40} fontSize={28} fill={theme.ink} fontFamily={theme.sans}>{l}</text>)}
    </g>
  }
  return <g><rect width={PW} height={PH} fill={theme.bg} />{body}</g>
}
