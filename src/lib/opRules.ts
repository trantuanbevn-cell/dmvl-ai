// Quy định vận hành của chủ đầu tư/thương hiệu (vd Marriott) gắn theo dự án: tìm các quy định áp cho một vật liệu theo phòng + vị trí (sàn/tường/trần/len).
import type { ProjectData } from './useProject'
import type { Room, ProjectRule } from './types'

const EL: Record<string, string> = { floor: 'floor', base: 'base', wall: 'wall', feature_wall: 'wall', ceiling: 'ceiling' }
export const EL_VN: Record<string, string> = { floor: 'Sàn', wall: 'Tường', ceiling: 'Trần', base: 'Len chân tường' }
export type RuleHit = { rule: ProjectRule; rooms: Room[]; els: string[] }

export function rulesFor(d: ProjectData, entryId: string): RuleHit[] {
  if (!d.rules.length) return []
  const occ = d.occ.filter(o => o.entry_id === entryId && o.room_id)
  const hits: RuleHit[] = []
  for (const rule of d.rules) {
    const rooms: Room[] = [], els = new Set<string>()
    for (const o of occ) {
      const el = EL[o.category ?? ''] ; if (!el || !rule.elements.includes(el) || !rule.room_ids.includes(o.room_id!)) continue
      const r = d.rooms.find(x => x.id === o.room_id); if (r && !rooms.includes(r)) rooms.push(r)
      els.add(el)
    }
    if (rooms.length) hits.push({ rule, rooms, els: [...els] })
  }
  return hits
}
