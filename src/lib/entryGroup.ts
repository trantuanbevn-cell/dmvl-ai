import type { Entry } from './types'
import { saveEntry } from './entryLink'
import { customSectionOfGroup } from './sections'
import { compOnGroupChange } from './compDefault'

/** Đổi nhóm vật liệu của một mã: mã nội bộ + ký hiệu bản vẽ đổi theo, hàng tự chuyển về đúng cụm (gỗ tự nhiên ↔ gỗ công nghiệp…) và đánh số tiếp trong nhóm mới.
 *  Chỉ đổi nhóm/mã/mục – giữ nguyên phòng, vị trí, hình ảnh và mọi thông tin khác. */
export async function changeGroup(e: Entry, group: string, all: Entry[]) {
  if (group === e.group_code) return null
  let max = 0
  for (const x of all) { const m = new RegExp('^' + group.replace(/[^A-Z0-9]/gi, '') + '-(\\d+)$').exec(x.code); if (m) max = Math.max(max, Number(m[1])) }
  const code = `${group}-${String(max + 1).padStart(2, '0')}`
  const patch: Record<string, unknown> = { group_code: group, code, section_key: customSectionOfGroup(group) }
  const comp = compOnGroupChange((e as Entry & { composition?: string | null }).composition, e.group_code, group)
  if (comp !== (e as Entry & { composition?: string | null }).composition) patch.composition = comp
  return saveEntry(e, patch)
}
