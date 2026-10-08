import type { CropViewT } from './crop'
export type Project = { id: string; name: string; location: string | null; client: string | null; pdf_path: string | null; status: string; created_at: string; section_names?: Record<string, { vn?: string; en?: string }> | null }
export type Room = { id: string; project_id: string; code: string; name_vn: string; name_en: string | null; room_type: string; concept_counts: { label: string; qty: number; unit?: string }[]; analysis_status: string; analysis_log: string | null; sort: number; plan?: any | null; work_status?: 'todo' | 'doing' | 'done'; assigned_to?: string | null; work_by?: string | null; work_at?: string | null; dismissed_suggest?: string[] | null }
export type Page = { id: string; project_id: string; page_no: number; image_path: string; thumb_path: string | null; width: number | null; height: number | null; kind: string; room_id: string | null; page_text: string | null; analyzed: boolean; camera?: any | null; views?: any | null }
export type Candidate = { brand: string; product_code: string; product_name?: string; url: string; image_url?: string; reason_vn?: string; confidence?: number; verified?: boolean }
export type Entry = {
  id: string; project_id: string; code: string; group_code: string; category: string | null
  name_vn: string; name_en: string | null; part_vn: string | null; part_en: string | null
  material_vn: string | null; material_en: string | null; color_hex: string | null
  desc_vn: string | null; desc_en: string | null; perf_vn: string | null; perf_en: string | null; standards: string | null
  composition: string | null; parent_id: string | null
  brand: string | null; product_code: string | null; product_name: string | null; product_url: string | null; product_image_url: string | null; origin: string | null
  candidates: Candidate[]
  qty: number | null; unit: string | null; qty_flag: string | null; qty_note: string | null
  source: 'image' | 'inferred' | 'manual'; status: 'pending' | 'approved' | 'rejected' | 'review'
  note_vn: string | null; note_en: string | null; enriched: boolean; sort: number
  link_id?: string | null
  mat_view?: { img?: string | null; region?: number[] | null } | null
}
export type Occurrence = { id: string; entry_id: string; room_id: string | null; page_id: string | null; category: string | null; bbox: number[] | null; qty: number | null; confidence: number | null; note: string | null; view?: CropViewT | null }
export type ProjectRule = { id: string; project_id: string; room_ids: string[]; elements: string[]; title_vn: string | null; title_en: string | null; body_en: string | null; body_vn: string | null; source: string | null; sort: number }
export type Warning = { id: string; project_id: string; room_id: string | null; text: string; resolved: boolean }

export const STATUS_VN: Record<string, string> = { pending: 'Chờ duyệt', approved: 'Đã xác nhận', rejected: 'Loại bỏ', review: 'Cần TVTK xem lại' }
export const STATUS_EN: Record<string, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', review: 'Designer to review' }
export const SOURCE_VN: Record<string, string> = { image: 'Ảnh', inferred: 'Suy luận', manual: 'Thêm tay' }
export const SOURCE_EN: Record<string, string> = { image: 'Image', inferred: 'Inferred', manual: 'Manual' }
export type FloorRoom = { id: number; area_m2: number; poly: number[][]; cx: number; cy: number; names: string[]; label_area?: number; polys?: number[][][]; user?: boolean; merged?: number[] }
/** Gộp/đặt tên không gian do người dùng (hoặc gợi ý từ concept): members = tâm (0..1) của các phòng kín gốc – giữ nguyên khi tính lại bản vẽ */
export type ZoneMerge = { name: string; name_en?: string; members: [number, number][]; src?: 'user' | 'concept' }
export type ZoneSuggest = { name: string; members: [number, number][]; area: number; label_area: number; page_no: number }
export type ZoneCompare = { label: string; label_area: number; page_no: number; cad_ids: number[]; cad_area: number; page_id?: string }
export type FloorGeom = {
  w: number; h: number; m_per_pt: number; door_w: number; leaked: boolean; doors?: number
  wall_keys: string[]; classes: { key: string; layer: string; lw: number; fill: boolean; len: number; n: number }[]
  rooms: FloorRoom[]
  raw_rooms?: FloorRoom[]; merges?: ZoneMerge[]; suggest?: ZoneSuggest[]; compare?: ZoneCompare[]
}
export type FloorPlan = { id: string; project_id: string; floor_label: string; pdf_path: string; page_no: number; scale_den: number; width: number | null; height: number | null; preview_path: string | null; geometry: FloorGeom | null; status: string }
