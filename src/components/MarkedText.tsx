import type { ReactNode } from 'react'

type Op = { t: 'eq' | 'del' | 'ins'; s: string }
/** So sánh từng ký tự giữa bản gốc và bản đã sửa */
function diffOps(a: string, b: string): Op[] {
  let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++
  let q = 0; while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++
  const A = a.slice(p, a.length - q), B = b.slice(p, b.length - q)
  const ops: Op[] = []
  if (p) ops.push({ t: 'eq', s: a.slice(0, p) })
  if (A.length * B.length <= 3_000_000 && (A || B)) {
    const n = A.length, m = B.length, w = m + 1, L = new Uint16Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * w + j] = A[i] === B[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1])
    let i = 0, j = 0
    const push = (t: Op['t'], c: string) => { const l = ops[ops.length - 1]; if (l && l.t === t) l.s += c; else ops.push({ t, s: c }) }
    while (i < n && j < m) { if (A[i] === B[j]) { push('eq', A[i]); i++; j++ } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) { push('del', A[i]); i++ } else { push('ins', B[j]); j++ } }
    while (i < n) push('del', A[i++]); while (j < m) push('ins', B[j++])
  } else { if (A) ops.push({ t: 'del', s: A }); if (B) ops.push({ t: 'ins', s: B }) }
  if (q) ops.push({ t: 'eq', s: a.slice(a.length - q) })
  return ops
}
const vis = (s: string) => s.replace(/ /g, '·').replace(/ /g, '·').replace(/\t/g, '→').replace(/\n/g, '↵\n')

/** Hiện bản gốc và BÔI ĐỎ đúng chỗ sai: ký tự thừa/sai (kể cả dấu cách thừa – hiện thành chấm đỏ), chỗ thiếu (vạch đỏ), từ nghi sai */
export function MarkedBefore({ before, after, flags }: { before: string; after: string; flags?: string[] }) {
  const ops = diffOps(before, after)
  const out: ReactNode[] = []
  ops.forEach((o, k) => {
    if (o.t === 'eq') out.push(...flagSplit(o.s, flags, k))
    else if (o.t === 'del') out.push(<mark key={k} className="mk-bad" title={/^\s+$/.test(o.s) ? 'Khoảng trắng thừa' : 'Sai / thừa'}>{vis(o.s)}</mark>)
    else out.push(<mark key={k} className="mk-miss" title={`Thiếu: “${o.s.replace(/ /g, '␣')}”`}>{/^\s+$/.test(o.s) ? '' : ''}</mark>)
  })
  return <div className="mk-text">{out}</div>
}
function flagSplit(s: string, flags: string[] | undefined, k: number): ReactNode[] {
  if (!flags?.length) return [s]
  const re = new RegExp(`(?<![\\p{L}])(${flags.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}])`, 'gu')
  const parts = s.split(re)
  return parts.map((t, i) => (i % 2 ? <mark key={k + '-' + i} className="mk-bad" title="Nghi sai chính tả">{t}</mark> : t))
}

/** Hiện nguyên nội dung ô và bôi đỏ đoạn AI chỉ ra */
export function MarkedField({ value, snippet }: { value: string; snippet?: string | null }) {
  if (!snippet || !value.includes(snippet)) return <div className="mk-text">{value}</div>
  const i = value.indexOf(snippet)
  return <div className="mk-text">{value.slice(0, i)}<mark className="mk-bad">{vis(snippet)}</mark>{value.slice(i + snippet.length)}</div>
}
