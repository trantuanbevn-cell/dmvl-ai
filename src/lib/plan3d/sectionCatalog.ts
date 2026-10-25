// Gán ngược vật liệu từ DANH MỤC vào mặt cắt: phòng trên mặt bằng ↔ phòng trong danh mục (theo tên) → mã sàn / tường / trần của phòng đó
import type { ProjectData } from '../useProject'
import type { Entry } from '../types'
import { norm } from '../similar'
import { renderBuild } from '../construction'
import type { MatFor, MatInfo } from './section'

const ROLE: Record<'floor' | 'wall' | 'ceil', RegExp> = { floor: /\b(san|floor|flooring)\b/, wall: /\b(tuong|vach|wall)\b/, ceil: /\b(tran|ceiling)\b/ }
const roleOf = (e: Entry): ('floor' | 'wall' | 'ceil') | null => {
  const t = norm(`${e.part_vn ?? ''} ${e.part_en ?? ''} ${e.category ?? ''}`)
  for (const r of ['floor', 'wall', 'ceil'] as const) if (ROLE[r].test(t)) return r
  const n = norm(e.name_vn)
  for (const r of ['floor', 'wall', 'ceil'] as const) if (ROLE[r].test(n)) return r
  return null
}
function layersOf(e: Entry): string[] {
  if (!e.build) return []
  try { return renderBuild(e.build).composition.split(' + ').map(s => s.trim()).filter(Boolean) } catch { return [] }
}
export function catalogMatFor(d: ProjectData): MatFor {
  const cache = new Map<string, MatInfo | undefined>()
  return (role, roomName) => {
    const key = role + '|' + norm(roomName)
    if (cache.has(key)) return cache.get(key)
    const nm = norm(roomName).trim()
    const rm = nm ? (d.rooms.find(r => norm(r.name_vn).trim() === nm) ?? d.rooms.find(r => norm(r.name_en).trim() === nm)) : undefined
    let out: MatInfo | undefined
    if (rm) {
      const ids = new Set(d.occ.filter(o => o.room_id === rm.id).map(o => o.entry_id))
      const es = d.entries.filter(e => ids.has(e.id) && e.status !== 'rejected' && roleOf(e) === role)
      const e = es.find(x => x.build) ?? es.find(x => x.color_hex) ?? es[0]
      if (e) { const ly = layersOf(e); out = { name: `${e.name_vn}${e.material_vn ? ' – ' + e.material_vn : ''}`.slice(0, 80), color: e.color_hex ?? undefined, code: e.code, layers: ly, full: ly.length >= 2, src: 'catalog' } }
    }
    cache.set(key, out); return out
  }
}
