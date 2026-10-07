import type { ProjectData } from './useProject'
import type { CheckItem } from './rules'
import type { Room, Entry } from './types'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')

export type CheckResult = { item: CheckItem; level: 'required' | 'common'; ok: boolean; matches: string[] }
export function checkRoom(d: Pick<ProjectData, 'occ' | 'entries'>, room: Room, checklist: CheckItem[]): CheckResult[] {
  const entryById = new Map(d.entries.map(e => [e.id, e]))
  const inRoom = d.occ.filter(o => o.room_id === room.id).map(o => ({ o, e: entryById.get(o.entry_id) })).filter(x => x.e && x.e.status !== 'rejected') as { o: any; e: Entry }[]
  const out: CheckResult[] = []
  for (const item of checklist) {
    const lvl = item.req[room.room_type]
    if (!lvl || lvl === 'na') continue
    const cands = inRoom.filter(x => (x.o.category ?? x.e.category) === item.category || x.e.category === item.category)
    const kws = item.keywords.map(norm)
    const m = kws.length ? cands.filter(x => kws.some(k => norm(`${x.e.name_vn} ${x.e.name_en ?? ''} ${x.e.material_vn ?? ''} ${x.e.part_vn ?? ''}`).includes(k))) : cands
    out.push({ item, level: lvl, ok: m.length > 0, matches: [...new Set(m.map(x => x.e.code))] })
  }
  return out
}
