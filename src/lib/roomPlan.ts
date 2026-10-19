// Mặt bằng của phòng lấy từ "Mặt bằng gốc theo tầng": tìm tầng + vùng phòng trùng tên trong bản vẽ đã đọc → cắt ảnh quanh phòng (không cần ảnh làm sẵn).
import type { ProjectData } from './useProject'
import type { Room } from './types'
import { roomPolys } from './cadZones'
import { useEffect, useState } from 'react'
import { supabase, BUCKET } from './supabase'

/** Phòng đã vẽ trong "Soạn & dựng 3D" (toạ độ mét) – file nhẹ riêng cho từng tầng, ghi khi tự lưu */
export type PlanRooms = { w: number; h: number; rooms: { name: string; en?: string; poly: [number, number][] }[] }
export const roomsJsonPath = (pid: string, fid: string) => `${pid}/plan3d/${fid}.rooms.json`
export function usePlanRooms(d: ProjectData): Map<string, PlanRooms> {
  const [m, setM] = useState<Map<string, PlanRooms>>(new Map()), key = d.floors.map(f => f.id).join(',')
  useEffect(() => { let on = true; const pid = d.project?.id; if (!pid) return; (async () => { const out = new Map<string, PlanRooms>(); for (const f of d.floors) { try { const { data } = await supabase.storage.from(BUCKET).download(roomsJsonPath(pid, f.id)); if (data) out.set(f.id, JSON.parse(await data.text())) } catch { /* chưa có */ } } if (on) setM(out) })(); return () => { on = false } }, [key, d.project?.id]) // eslint-disable-line
  return m
}

const norm = (s?: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export type RoomPlan = { url: string; W: number; H: number; polys: [number, number][][]; floor: string; whole?: boolean }

export function roomPlanOf(d: ProjectData, room: Room & { floor?: string | null }, models?: Map<string, PlanRooms>): RoomPlan | null {
  if (!d.floors.length) return null
  const fl = norm(room.floor)
  const cands = d.floors.filter(f => f.geometry?.rooms?.length && f.preview_path)
  const order = [...cands.filter(f => fl && norm(f.floor_label) === fl), ...(fl ? [] : cands)]
  const names = [norm(room.name_vn), norm(room.name_en)].filter(Boolean)
  // ưu tiên phòng đã vẽ/đặt tên trong Soạn & dựng 3D
  const withModel = d.floors.filter(f => f.preview_path && models?.get(f.id))
  for (const f of [...withModel.filter(f => fl && norm(f.floor_label) === fl), ...(fl ? [] : withModel)]) {
    const mm = models!.get(f.id)!, url = d.urls[f.preview_path!]; if (!url) continue
    const hit = mm.rooms.filter(r => [norm(r.name), norm(r.en)].some(n => n && names.includes(n))); if (!hit.length) continue
    return { url, W: f.width ?? 1000, H: f.height ?? 700, polys: hit.map(r => r.poly.map(q => [q[0] / mm.w, q[1] / mm.h] as [number, number])), floor: f.floor_label }
  }
  for (const f of order) {
    const g = f.geometry!, url = d.urls[f.preview_path!]; if (!url) continue
    const hit = g.rooms.filter(r => r.names.some(n => names.includes(norm(n))))
    if (!hit.length) continue
    return { url, W: f.width ?? 1000, H: f.height ?? 700, polys: hit.flatMap(r => roomPolys(r)) as [number, number][][], floor: f.floor_label }
  }
  // chưa khớp tên phòng → hiện cả mặt bằng tầng (chưa tô phòng) để vẫn thấy vị trí chung
  const any = d.floors.filter(f => f.preview_path && d.urls[f.preview_path])
  const f = any.find(f => fl && norm(f.floor_label) === fl) ?? (any.length === 1 || !fl ? any[0] : undefined)
  if (f) return { url: d.urls[f.preview_path!], W: f.width ?? 1000, H: f.height ?? 700, polys: [], floor: f.floor_label, whole: true }
  return null
}
