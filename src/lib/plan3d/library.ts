// Thư viện dựng sẵn cho soạn mặt bằng 3D: cửa đi · cửa sổ · tường (cấu tạo lớp) · cột · vật liệu hoàn thiện sàn/trần/tường.
// Tất cả sinh bằng tham số (không cần tải file ngoài): đổi loại, kích thước, vật liệu là 3D đổi theo.
import * as THREE from 'three'
import type { Door } from './model'

export type Pattern = 'solid' | 'wood' | 'tile' | 'marble' | 'concrete' | 'metal' | 'fabric' | 'glass' | 'stone' | 'brick' | 'paint' | 'image'
export type Finish = { id: string; group: 'Sàn' | 'Trần' | 'Tường' | 'Cửa / khung' | 'Của tôi'; name: string; color: string; pattern: Pattern; size?: number; grout?: string; alt?: string; rough?: number; metal?: number; opacity?: number; img?: string }
const F = (id: string, group: Finish['group'], name: string, color: string, pattern: Pattern, extra: Partial<Finish> = {}): Finish => ({ id, group, name, color, pattern, ...extra })
export const FINISHES: Finish[] = [
  // Sàn
  F('f-oak', 'Sàn', 'Sàn gỗ sồi tự nhiên', '#c8a272', 'wood', { size: 1.2, alt: '#b78f5e' }),
  F('f-walnut', 'Sàn', 'Sàn gỗ óc chó', '#6b4a33', 'wood', { size: 1.2, alt: '#5a3c28' }),
  F('f-ash', 'Sàn', 'Sàn gỗ tần bì sáng', '#e1cfae', 'wood', { size: 1.2, alt: '#d4bf98' }),
  F('f-herring', 'Sàn', 'Sàn gỗ xương cá', '#b88b5b', 'wood', { size: 1.2, alt: '#a67a4c' }),
  F('f-t60w', 'Sàn', 'Gạch porcelain 600x600 trắng', '#ecebe7', 'tile', { size: 0.6, grout: '#c9c7c1' }),
  F('f-t60g', 'Sàn', 'Gạch porcelain 600x600 xám', '#9c9c9a', 'tile', { size: 0.6, grout: '#7d7d7b' }),
  F('f-t80b', 'Sàn', 'Gạch bóng kiếng 800x800 be', '#dcd1bd', 'tile', { size: 0.8, grout: '#bfb49f' }),
  F('f-t30', 'Sàn', 'Gạch chống trơn 300x300', '#b9a58b', 'tile', { size: 0.3, grout: '#8c7b66' }),
  F('f-mw', 'Sàn', 'Đá marble trắng vân mây', '#eeeeea', 'marble', { size: 1.2, alt: '#b9bcc0' }),
  F('f-mb', 'Sàn', 'Đá marble đen vân vàng', '#26262a', 'marble', { size: 1.2, alt: '#b79a55' }),
  F('f-gr', 'Sàn', 'Đá granite xám', '#7f8083', 'stone', { size: 0.8 }),
  F('f-conc', 'Sàn', 'Bê tông mài', '#a9a9a6', 'concrete', { size: 1.2 }),
  F('f-epoxy', 'Sàn', 'Sơn epoxy xám', '#8e9498', 'solid', { rough: 0.35 }),
  F('f-carpet', 'Sàn', 'Thảm trải sàn xám', '#6d7076', 'fabric', { size: 0.4 }),
  F('f-vinyl', 'Sàn', 'Sàn vinyl vân gỗ', '#b9996d', 'wood', { size: 1.0, alt: '#a98a60' }),
  F('f-terraz', 'Sàn', 'Terrazzo', '#d9d4ca', 'stone', { size: 0.8, alt: '#8f8a80' }),
  // Trần
  F('c-paint', 'Trần', 'Trần thạch cao sơn trắng', '#f6f5f2', 'paint'),
  F('c-paintg', 'Trần', 'Trần thạch cao sơn xám nhạt', '#d9dadb', 'paint'),
  F('c-tile', 'Trần', 'Trần thả tấm khoáng 600x600', '#eeeeea', 'tile', { size: 0.6, grout: '#c8c8c2' }),
  F('c-alu', 'Trần', 'Trần nhôm Clip-in', '#cfd2d4', 'metal', { size: 0.6, metal: 0.6, rough: 0.4 }),
  F('c-wood', 'Trần', 'Trần gỗ lam', '#b98b5a', 'wood', { size: 1.2, alt: '#a97b4d' }),
  F('c-black', 'Trần', 'Trần sơn đen (kỹ thuật lộ)', '#26282b', 'paint'),
  F('c-conc', 'Trần', 'Trần bê tông thô', '#a3a39f', 'concrete', { size: 1.2 }),
  F('c-fab', 'Trần', 'Trần bọc vải tiêu âm', '#c9c4b8', 'fabric', { size: 0.4 }),
  // Tường
  F('w-white', 'Tường', 'Sơn trắng', '#f3f1ec', 'paint'),
  F('w-cream', 'Tường', 'Sơn kem', '#e8dcc5', 'paint'),
  F('w-grey', 'Tường', 'Sơn xám ấm', '#b9b5ad', 'paint'),
  F('w-green', 'Tường', 'Sơn xanh rêu', '#7d8b6e', 'paint'),
  F('w-blue', 'Tường', 'Sơn xanh navy', '#2f4660', 'paint'),
  F('w-wood', 'Tường', 'Ốp gỗ óc chó', '#6b4a33', 'wood', { size: 1.2, alt: '#5a3c28' }),
  F('w-oak', 'Tường', 'Ốp gỗ sồi', '#c8a272', 'wood', { size: 1.2, alt: '#b78f5e' }),
  F('w-mw', 'Tường', 'Ốp đá marble trắng', '#eeeeea', 'marble', { size: 1.2, alt: '#b9bcc0' }),
  F('w-tile', 'Tường', 'Gạch men 300x600 trắng', '#f1f1ee', 'tile', { size: 0.3, grout: '#cfcfca' }),
  F('w-tileg', 'Tường', 'Gạch men 300x600 xanh', '#6f9ea4', 'tile', { size: 0.3, grout: '#4f7a80' }),
  F('w-brick', 'Tường', 'Gạch thẻ lộ', '#a8553e', 'brick', { size: 0.6 }),
  F('w-conc', 'Tường', 'Bê tông trần', '#a9a9a6', 'concrete', { size: 1.2 }),
  F('w-stone', 'Tường', 'Ốp đá tự nhiên', '#7d7468', 'stone', { size: 0.8 }),
  F('w-fab', 'Tường', 'Bọc vải / da', '#a1927f', 'fabric', { size: 0.4 }),
  F('w-glass', 'Tường', 'Kính trong', '#a5cfda', 'glass', { opacity: 0.35, rough: 0.05 }),
  F('w-mirror', 'Tường', 'Gương', '#c7d2d8', 'metal', { metal: 0.9, rough: 0.05 }),
  // Cửa / khung
  F('d-oak', 'Cửa / khung', 'Gỗ sồi', '#c8a272', 'wood', { size: 1.2, alt: '#b78f5e' }),
  F('d-walnut', 'Cửa / khung', 'Gỗ óc chó', '#6b4a33', 'wood', { size: 1.2, alt: '#5a3c28' }),
  F('d-white', 'Cửa / khung', 'Sơn trắng', '#f1f0ec', 'paint'),
  F('d-black', 'Cửa / khung', 'Sơn đen / thép đen', '#25272a', 'paint', { rough: 0.5 }),
  F('d-alu', 'Cửa / khung', 'Nhôm anod bạc', '#bfc3c6', 'metal', { metal: 0.7, rough: 0.35 }),
  F('d-alub', 'Cửa / khung', 'Nhôm sơn tĩnh điện xám đen', '#3b3e42', 'metal', { metal: 0.5, rough: 0.45 }),
  F('d-steel', 'Cửa / khung', 'Inox xước', '#aab0b4', 'metal', { metal: 0.9, rough: 0.3 }),
  F('d-brass', 'Cửa / khung', 'Đồng thau', '#b08d57', 'metal', { metal: 0.9, rough: 0.3 }),
  F('d-glass', 'Cửa / khung', 'Kính cường lực trong', '#a5cfda', 'glass', { opacity: 0.35, rough: 0.05 }),
  F('d-glassf', 'Cửa / khung', 'Kính mờ', '#cfe0e4', 'glass', { opacity: 0.7, rough: 0.5 }),
  F('d-hpl', 'Cửa / khung', 'HPL vân gỗ sáng', '#d8c4a0', 'wood', { size: 1.2, alt: '#c9b48d' }),
  F('d-fire', 'Cửa / khung', 'Thép sơn chống cháy xám', '#8b9094', 'paint', { rough: 0.5, metal: 0.3 }),
]
export const finishOf = (id: string | undefined, custom: Finish[] = []) => (id ? [...custom, ...FINISHES].find(f => f.id === id) : undefined)

// ---- Cửa & cửa sổ ----
export type DoorLeaf = 'flush' | 'panel' | 'panel6' | 'glass' | 'glassHalf' | 'louver' | 'sliding' | 'fold' | 'none' | 'fixed' | 'casement' | 'awning'
export type DoorSpec = { id: string; group: 'Cửa đi' | 'Cửa kính' | 'Cửa sổ' | 'Khác'; name: string; kind: Door['kind']; w: number; h: number; sill: number; leaf: DoorLeaf; frame: number; leafFinish: string; frameFinish: string; panes?: number; fire?: boolean; handle?: boolean }
const D = (id: string, group: DoorSpec['group'], name: string, kind: Door['kind'], w: number, h: number, sill: number, leaf: DoorLeaf, frame: number, leafFinish: string, frameFinish: string, extra: Partial<DoorSpec> = {}): DoorSpec => ({ id, group, name, kind, w, h, sill, leaf, frame, leafFinish, frameFinish, handle: true, ...extra })
export const DOOR_LIB: DoorSpec[] = [
  D('dr-flush09', 'Cửa đi', 'Cửa đi một cánh phẳng 900', 'door', 0.9, 2.1, 0, 'flush', 0.06, 'd-white', 'd-white'),
  D('dr-flush08', 'Cửa đi', 'Cửa đi một cánh phẳng 800 (WC)', 'door', 0.8, 2.1, 0, 'flush', 0.06, 'd-white', 'd-white'),
  D('dr-flush10', 'Cửa đi', 'Cửa đi một cánh phẳng 1000', 'door', 1.0, 2.2, 0, 'flush', 0.06, 'd-oak', 'd-oak'),
  D('dr-oak09', 'Cửa đi', 'Cửa gỗ sồi veneer 900', 'door', 0.9, 2.2, 0, 'flush', 0.07, 'd-oak', 'd-oak'),
  D('dr-wal09', 'Cửa đi', 'Cửa gỗ óc chó 900', 'door', 0.9, 2.2, 0, 'flush', 0.07, 'd-walnut', 'd-walnut'),
  D('dr-pan09', 'Cửa đi', 'Cửa panô cổ điển 900', 'door', 0.9, 2.2, 0, 'panel', 0.09, 'd-white', 'd-white'),
  D('dr-pan6', 'Cửa đi', 'Cửa panô 6 ô gỗ óc chó', 'door', 0.9, 2.2, 0, 'panel6', 0.09, 'd-walnut', 'd-walnut'),
  D('dr-dbl16', 'Cửa đi', 'Cửa đi hai cánh 1600', 'double', 1.6, 2.2, 0, 'flush', 0.07, 'd-oak', 'd-oak'),
  D('dr-dbl18', 'Cửa đi', 'Cửa đi hai cánh 1800', 'double', 1.8, 2.4, 0, 'panel', 0.08, 'd-walnut', 'd-walnut'),
  D('dr-dbl12', 'Cửa đi', 'Cửa đi hai cánh 1200', 'double', 1.2, 2.1, 0, 'flush', 0.06, 'd-white', 'd-white'),
  D('dr-fire09', 'Cửa đi', 'Cửa thép chống cháy EI60 900', 'door', 0.9, 2.1, 0, 'flush', 0.08, 'd-fire', 'd-fire', { fire: true }),
  D('dr-fire12', 'Cửa đi', 'Cửa thép chống cháy 1200 (hai cánh lệch)', 'double', 1.2, 2.1, 0, 'flush', 0.08, 'd-fire', 'd-fire', { fire: true }),
  D('dr-lou09', 'Cửa đi', 'Cửa đi lá sách thông gió 900', 'door', 0.9, 2.1, 0, 'louver', 0.06, 'd-white', 'd-white'),
  D('dr-bk', 'Cửa đi', 'Cửa hậu cần / bếp 1000 (inox)', 'door', 1.0, 2.1, 0, 'flush', 0.07, 'd-steel', 'd-steel'),
  D('dg-glass09', 'Cửa kính', 'Cửa kính khung nhôm một cánh 900', 'door', 0.9, 2.2, 0, 'glass', 0.05, 'd-glass', 'd-alub'),
  D('dg-glass12', 'Cửa kính', 'Cửa kính khung nhôm hai cánh 1200', 'double', 1.2, 2.2, 0, 'glass', 0.05, 'd-glass', 'd-alub'),
  D('dg-glass18', 'Cửa kính', 'Cửa kính khung nhôm hai cánh 1800', 'double', 1.8, 2.4, 0, 'glass', 0.05, 'd-glass', 'd-alub'),
  D('dg-frameless', 'Cửa kính', 'Cửa kính cường lực không khung 900', 'door', 0.9, 2.4, 0, 'glass', 0.02, 'd-glass', 'd-steel'),
  D('dg-half', 'Cửa kính', 'Cửa gỗ ô kính nửa trên 900', 'door', 0.9, 2.2, 0, 'glassHalf', 0.07, 'd-oak', 'd-oak'),
  D('dg-slide18', 'Cửa kính', 'Cửa trượt kính 2 cánh 1800', 'slide', 1.8, 2.4, 0, 'sliding', 0.05, 'd-glass', 'd-alub', { handle: false }),
  D('dg-slide24', 'Cửa kính', 'Cửa trượt kính 2 cánh 2400', 'slide', 2.4, 2.4, 0, 'sliding', 0.05, 'd-glass', 'd-alub', { handle: false }),
  D('dg-slide30', 'Cửa kính', 'Cửa trượt kính 4 cánh 3000', 'slide', 3.0, 2.4, 0, 'sliding', 0.05, 'd-glass', 'd-alub', { handle: false, panes: 4 }),
  D('dg-fold', 'Cửa kính', 'Cửa xếp trượt gấp 4 cánh 3000', 'slide', 3.0, 2.4, 0, 'fold', 0.05, 'd-glass', 'd-alub', { handle: false, panes: 4 }),
  D('dg-door-wood-slide', 'Cửa kính', 'Cửa trượt gỗ (chuồng) 1800', 'slide', 1.8, 2.2, 0, 'sliding', 0.05, 'd-oak', 'd-oak', { handle: false }),
  D('ws-fixed', 'Cửa sổ', 'Cửa sổ kính cố định 1500', 'window', 1.5, 1.4, 0.9, 'fixed', 0.05, 'd-glass', 'd-alub', { handle: false }),
  D('ws-fixedL', 'Cửa sổ', 'Ô kính cố định lớn 2400', 'window', 2.4, 2.1, 0.3, 'fixed', 0.05, 'd-glass', 'd-alub', { handle: false }),
  D('ws-cas1', 'Cửa sổ', 'Cửa sổ mở quay một cánh 800', 'window', 0.8, 1.4, 0.9, 'casement', 0.05, 'd-glass', 'd-alub'),
  D('ws-cas2', 'Cửa sổ', 'Cửa sổ mở quay hai cánh 1400', 'window', 1.4, 1.4, 0.9, 'casement', 0.05, 'd-glass', 'd-alub', { panes: 2 }),
  D('ws-cas3', 'Cửa sổ', 'Cửa sổ mở quay ba cánh 2100', 'window', 2.1, 1.4, 0.9, 'casement', 0.05, 'd-glass', 'd-alub', { panes: 3 }),
  D('ws-slide', 'Cửa sổ', 'Cửa sổ trượt 2 cánh 1600', 'window', 1.6, 1.3, 1.0, 'sliding', 0.05, 'd-glass', 'd-alub', { handle: false }),
  D('ws-awn', 'Cửa sổ', 'Cửa sổ hất 1000', 'window', 1.0, 0.6, 1.7, 'awning', 0.05, 'd-glass', 'd-alub', { handle: false }),
  D('ws-wood', 'Cửa sổ', 'Cửa sổ gỗ chia ô 1200', 'window', 1.2, 1.4, 0.9, 'casement', 0.07, 'd-glass', 'd-oak', { panes: 2 }),
  D('ws-wc', 'Cửa sổ', 'Cửa sổ lá sách WC 600', 'window', 0.6, 0.6, 1.6, 'louver', 0.04, 'd-alu', 'd-alu', { handle: false }),
  D('op-cased', 'Khác', 'Ô trống chừa lối đi 1200', 'opening', 1.2, 2.4, 0, 'none', 0.05, 'd-white', 'd-white', { handle: false }),
  D('op-wide', 'Khác', 'Ô trống rộng 2000', 'opening', 2.0, 2.6, 0, 'none', 0.05, 'd-white', 'd-white', { handle: false }),
  D('op-pass', 'Khác', 'Ô lấy đồ / quầy pass 1200', 'opening', 1.2, 0.9, 0.95, 'none', 0.04, 'd-steel', 'd-steel', { handle: false }),
]
export const doorSpec = (id?: string, custom: DoorSpec[] = []) => [...custom, ...DOOR_LIB].find(d => d.id === id)

// ---- Tường (cấu tạo lớp) ----
export type Layer = { name: string; t: number; hatch: 'plaster' | 'brick' | 'concrete' | 'gypsum' | 'glass' | 'wood' | 'air' | 'stone' | 'steel' | 'insul' }
/** frame: đố/khung vách kính – w = bản rộng đố (m), color; bare = chỉ khe nối (kính không khung) */
export type WallType = { key: string; label: string; color: string; t: number; glass?: boolean; layers: Layer[]; finish?: string; frame?: { w: number; color: string; rail: number }; panel?: number }
const L = (name: string, t: number, hatch: Layer['hatch']): Layer => ({ name, t, hatch })
export const WALL_TYPES: WallType[] = [
  { key: 'brick', label: 'Tường gạch xây 100 (trát 2 mặt)', color: '#e4d9c3', t: 0.14, layers: [L('Vữa trát', 0.015, 'plaster'), L('Gạch ống 80', 0.08, 'brick'), L('Vữa trát', 0.015, 'plaster')] },
  { key: 'brick200', label: 'Tường gạch xây 200 (trát 2 mặt)', color: '#e4d9c3', t: 0.24, layers: [L('Vữa trát', 0.02, 'plaster'), L('Gạch ống 180', 0.18, 'brick'), L('Vữa trát', 0.02, 'plaster')] },
  { key: 'brick220', label: 'Tường gạch đặc 220', color: '#dccfb8', t: 0.26, layers: [L('Vữa trát', 0.02, 'plaster'), L('Gạch đặc 220', 0.22, 'brick'), L('Vữa trát', 0.02, 'plaster')] },
  { key: 'aac100', label: 'Tường gạch nhẹ AAC 100', color: '#ddd9d0', t: 0.13, layers: [L('Vữa mỏng', 0.015, 'plaster'), L('Gạch AAC 100', 0.1, 'insul'), L('Vữa mỏng', 0.015, 'plaster')] },
  { key: 'concrete', label: 'Bê tông cốt thép 200', color: '#9a9a9a', t: 0.2, layers: [L('BTCT', 0.2, 'concrete')] },
  { key: 'concrete300', label: 'Bê tông cốt thép 300', color: '#939393', t: 0.3, layers: [L('BTCT', 0.3, 'concrete')] },
  { key: 'partition', label: 'Vách ngăn vệ sinh (compact HPL 18)', color: '#c9ced4', t: 0.04, layers: [L('Compact HPL 18', 0.04, 'gypsum')], finish: undefined },
  { key: 'gypsum', label: 'Vách thạch cao 1 lớp (khung 75)', color: '#efece4', t: 0.1, layers: [L('Thạch cao 12.5', 0.0125, 'gypsum'), L('Khung xương + bông', 0.075, 'insul'), L('Thạch cao 12.5', 0.0125, 'gypsum')] },
  { key: 'gypsum2', label: 'Vách thạch cao 2 lớp chống ẩm (khung 75)', color: '#e6e8e3', t: 0.125, layers: [L('Thạch cao 2x12.5', 0.025, 'gypsum'), L('Khung xương + bông', 0.075, 'insul'), L('Thạch cao 2x12.5', 0.025, 'gypsum')] },
  { key: 'gypsumfire', label: 'Vách chống cháy EI90 (2 lớp, khung 100)', color: '#dcdedb', t: 0.15, layers: [L('Thạch cao chống cháy 2x15', 0.03, 'gypsum'), L('Khung xương + bông', 0.09, 'insul'), L('Thạch cao chống cháy 2x15', 0.03, 'gypsum')] },
  { key: 'glass', label: 'Vách kính cường lực 12 không khung', color: '#9cc9d6', t: 0.012, glass: true, layers: [L('Kính cường lực 12', 0.012, 'glass')], finish: 'w-glass', frame: { w: 0.008, color: '#d9e6ea', rail: 0.03 }, panel: 1.2 },
  { key: 'glass10', label: 'Vách kính cường lực 10 + thanh U nhôm', color: '#9cc9d6', t: 0.01, glass: true, layers: [L('Kính cường lực 10', 0.01, 'glass')], finish: 'w-glass', frame: { w: 0.01, color: '#b9bcc0', rail: 0.04 }, panel: 1.0 },
  { key: 'glassal', label: 'Vách kính khung nhôm (đố 50)', color: '#9cc9d6', t: 0.05, glass: true, layers: [L('Kính 8', 0.008, 'glass'), L('Khung nhôm', 0.042, 'steel')], finish: 'w-glass', frame: { w: 0.05, color: '#4a4d52', rail: 0.06 }, panel: 1.2 },
  { key: 'crittall', label: 'Vách kính khung thép đen (kiểu Crittall)', color: '#9cc9d6', t: 0.04, glass: true, layers: [L('Kính 6', 0.006, 'glass'), L('Khung thép', 0.034, 'steel')], finish: 'w-glass', frame: { w: 0.035, color: '#1d1d1f', rail: 0.05 }, panel: 0.9 },
  { key: 'curtain', label: 'Vách kính mặt dựng (curtain wall)', color: '#9cc9d6', t: 0.1, glass: true, layers: [L('Kính hộp 24', 0.024, 'glass'), L('Khung nhôm', 0.076, 'steel')], finish: 'w-glass', frame: { w: 0.06, color: '#3a3d42', rail: 0.08 }, panel: 1.5 },
  { key: 'wood', label: 'Vách ốp gỗ (khung gỗ + MDF)', color: '#b58b5a', t: 0.08, layers: [L('Veneer gỗ', 0.006, 'wood'), L('Ván MDF', 0.018, 'wood'), L('Khung xương', 0.05, 'air'), L('Thạch cao', 0.0125, 'gypsum')], finish: 'w-wood' },
  { key: 'stone', label: 'Ốp đá trên tường gạch', color: '#7d7468', t: 0.24, layers: [L('Đá ốp 20', 0.02, 'stone'), L('Vữa keo', 0.02, 'plaster'), L('Gạch ống 180', 0.18, 'brick'), L('Vữa trát', 0.02, 'plaster')], finish: 'w-stone' },
  { key: 'tiled', label: 'Tường gạch ốp gạch men (khu ướt)', color: '#d8d6cf', t: 0.17, layers: [L('Gạch men 8', 0.008, 'stone'), L('Vữa keo', 0.012, 'plaster'), L('Gạch ống 100', 0.1, 'brick'), L('Vữa trát', 0.02, 'plaster')], finish: 'w-tile' },
]
export const wallTypeOf = (k: string) => WALL_TYPES.find(x => x.key === k) ?? WALL_TYPES[0]

// ---- Cột ----
export type ColSpec = { id: string; name: string; shape: 'rect' | 'round' | 'H'; w: number; d: number; kind: string; finish?: string }
export const COL_LIB: ColSpec[] = [
  { id: 'cl-r30', name: 'Cột vuông BTCT 300', shape: 'rect', w: 0.3, d: 0.3, kind: 'concrete' },
  { id: 'cl-r40', name: 'Cột vuông BTCT 400', shape: 'rect', w: 0.4, d: 0.4, kind: 'concrete' },
  { id: 'cl-r60', name: 'Cột vuông BTCT 600', shape: 'rect', w: 0.6, d: 0.6, kind: 'concrete' },
  { id: 'cl-r3060', name: 'Cột chữ nhật BTCT 300x600', shape: 'rect', w: 0.3, d: 0.6, kind: 'concrete' },
  { id: 'cl-o40', name: 'Cột tròn BTCT D400', shape: 'round', w: 0.4, d: 0.4, kind: 'concrete' },
  { id: 'cl-o60', name: 'Cột tròn BTCT D600', shape: 'round', w: 0.6, d: 0.6, kind: 'concrete' },
  { id: 'cl-o80', name: 'Cột tròn BTCT D800', shape: 'round', w: 0.8, d: 0.8, kind: 'concrete' },
  { id: 'cl-st', name: 'Cột bọc đá 600', shape: 'rect', w: 0.6, d: 0.6, kind: 'stone', finish: 'w-mw' },
  { id: 'cl-wd', name: 'Cột bọc gỗ 500', shape: 'rect', w: 0.5, d: 0.5, kind: 'wood', finish: 'w-wood' },
  { id: 'cl-steel', name: 'Cột thép hộp 200', shape: 'rect', w: 0.2, d: 0.2, kind: 'concrete', finish: 'd-black' },
]

// ---- Vật liệu: texture sinh bằng canvas ----
const texCache = new Map<string, THREE.Texture>()
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }
export function swatch(f: Finish, px = 128): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d')!, r = rng(f.id.length * 977 + f.id.charCodeAt(f.id.length - 1)), S = px
  g.fillStyle = f.color; g.fillRect(0, 0, S, S)
  if (f.pattern === 'wood') { const n = 8; for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? (f.alt ?? f.color) : f.color; g.fillRect(0, i * S / n, S, S / n); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.strokeRect(0, i * S / n, S, S / n)
      g.strokeStyle = 'rgba(70,40,10,.18)'; for (let k = 0; k < 7; k++) { const y = i * S / n + r() * S / n; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(S * .3, y + r() * 3 - 1.5, S * .6, y + r() * 3 - 1.5, S, y); g.stroke() } } }
  else if (f.pattern === 'tile') { const n = Math.max(1, Math.round(1.2 / (f.size ?? 0.6))); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const sh = (r() - .5) * 14; g.fillStyle = `rgb(${shade(f.color, sh)})`; g.fillRect(i * S / n, j * S / n, S / n, S / n) } g.strokeStyle = f.grout ?? '#999'; g.lineWidth = Math.max(1.5, S / 64); for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * S / n, 0); g.lineTo(i * S / n, S); g.moveTo(0, i * S / n); g.lineTo(S, i * S / n); g.stroke() } }
  else if (f.pattern === 'marble' || f.pattern === 'stone') { const vein = f.alt ?? '#8a8f94'; for (let k = 0; k < (f.pattern === 'marble' ? 9 : 120); k++) { g.strokeStyle = f.pattern === 'marble' ? vein + '55' : `rgba(${r() < .5 ? '255,255,255' : '40,40,40'},.18)`; g.lineWidth = f.pattern === 'marble' ? 0.7 + r() * 1.5 : 1 + r() * 3; g.beginPath(); let x = r() * S, y = r() * S; g.moveTo(x, y); for (let q = 0; q < (f.pattern === 'marble' ? 8 : 2); q++) { x += (r() - .5) * S * (f.pattern === 'marble' ? .35 : .08); y += (r() - .3) * S * (f.pattern === 'marble' ? .3 : .08); g.lineTo(x, y) } g.stroke() } }
  else if (f.pattern === 'concrete') { for (let k = 0; k < 600; k++) { g.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.05})`; g.fillRect(r() * S, r() * S, 1 + r() * 4, 1 + r() * 4) } }
  else if (f.pattern === 'brick') { const rows = 8, w = S / 3; for (let j = 0; j < rows; j++) for (let i = -1; i < 4; i++) { g.fillStyle = `rgb(${shade(f.color, (r() - .5) * 30)})`; g.fillRect(i * w + (j % 2 ? w / 2 : 0) + 1, j * S / rows + 1, w - 2, S / rows - 2) } }
  else if (f.pattern === 'fabric') { g.strokeStyle = 'rgba(0,0,0,.10)'; for (let i = 0; i < S; i += 3) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke() } }
  else if (f.pattern === 'metal') { for (let i = 0; i < S; i += 2) { g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.08})`; g.fillRect(0, i, S, 1) } }
  return c
}
function shade(hex: string, d: number) { const n = parseInt(hex.slice(1), 16), c = (v: number) => Math.max(0, Math.min(255, v + d)); return `${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)}` }

export function materialFor(f: Finish | undefined, fallback = '#cccccc'): THREE.Material {
  if (!f) return new THREE.MeshStandardMaterial({ color: fallback, roughness: 0.9 })
  const opts: THREE.MeshStandardMaterialParameters = { color: 0xffffff, roughness: f.rough ?? 0.8, metalness: f.metal ?? 0 }
  if (f.pattern === 'glass') return new THREE.MeshStandardMaterial({ color: f.color, roughness: f.rough ?? 0.1, metalness: 0, transparent: true, opacity: f.opacity ?? 0.35, side: THREE.DoubleSide })
  if (f.pattern === 'solid' || f.pattern === 'paint') return new THREE.MeshStandardMaterial({ ...opts, color: f.color })
  const key = f.id + (f.img ? '|img' : '')
  let t = texCache.get(key)
  if (!t) {
    if (f.img) { t = new THREE.TextureLoader().load(f.img) } else t = new THREE.CanvasTexture(swatch(f, 256))
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(key, t)
  }
  const rep = f.pattern === 'image' ? 1 / (f.size || 0.6) : 1 / (f.pattern === 'tile' || f.pattern === 'wood' || f.pattern === 'marble' || f.pattern === 'brick' || f.pattern === 'stone' || f.pattern === 'concrete' ? 1.2 : 0.4)
  t.repeat.set(rep, rep)
  return new THREE.MeshStandardMaterial({ ...opts, map: t })
}

// ---- Dựng khối 3D cho cửa ----
/** Hệ toạ độ cục bộ: x dọc tường (rộng), y lên, z xuyên tường. Gốc ở tâm ô cửa, mép dưới ô (y=0 ở bệ cửa). */
export function buildDoor(d: Door, spec: DoorSpec | undefined, custom: Finish[], T = 0.2): THREE.Group {
  const g = new THREE.Group(), w = d.w, h = d.h
  const fw = spec?.frame ?? 0.06, leafF = finishOf(d.finish ?? spec?.leafFinish, custom), frameF = finishOf(d.frameFinish ?? spec?.frameFinish, custom)
  const mLeaf = materialFor(leafF ?? finishOf('d-white'), '#f1f0ec'), mFrame = materialFor(frameF ?? finishOf('d-white'), '#f1f0ec'), mGlass = materialFor(finishOf('d-glass'))
  const mh = materialFor(finishOf('d-steel'))
  const box = (bw: number, bh: number, bd: number, x: number, y: number, z: number, m: THREE.Material) => { const o = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m); o.position.set(x, y, z); g.add(o); return o }
  const leaf = spec?.leaf ?? (d.kind === 'window' ? 'fixed' : d.kind === 'slide' ? 'sliding' : d.kind === 'opening' ? 'none' : 'flush')
  const glassLeaf = leaf === 'glass' || leaf === 'sliding' || leaf === 'fixed' || leaf === 'casement' || leaf === 'awning' || leaf === 'fold'
  const glassMat = (leafF?.pattern === 'glass') ? mLeaf : mGlass
  const dep = Math.min(Math.max(T, 0.08), 0.3) + 0.02 // khung ôm bề dày tường
  // khung
  box(fw, h, dep, -w / 2 + fw / 2, h / 2, 0, mFrame); box(fw, h, dep, w / 2 - fw / 2, h / 2, 0, mFrame); box(w, fw, dep, 0, h - fw / 2, 0, mFrame)
  if (d.kind === 'window' || (d.sill > 0.05)) box(w, fw, dep, 0, fw / 2, 0, mFrame) // thanh dưới của cửa sổ
  if (d.kind === 'window') box(w + 0.08, 0.04, dep + 0.08, 0, -0.02, 0.04, mFrame) // bệ cửa sổ nhô ra
  const iw = w - 2 * fw, y0 = d.kind === 'window' || d.sill > 0.05 ? fw : 0, ih = h - fw - y0
  const leafBox = (lw: number, lh: number, x: number, y: number, z: number, th = 0.04) => {
    if (leaf === 'flush' || leaf === 'louver' || leaf === 'panel' || leaf === 'panel6' || leaf === 'glassHalf') box(lw, lh, th, x, y, z, mLeaf)
    if (leaf === 'panel' || leaf === 'panel6') { const rows = leaf === 'panel6' ? 3 : 2, ph = (lh - 0.4) / rows - 0.05; for (let i = 0; i < rows; i++) for (const s of [-1, 1]) box(lw / 2 - 0.15, ph, 0.012, x + s * (lw / 4), y - lh / 2 + 0.2 + ph / 2 + i * (ph + 0.05), z + th / 2 + 0.004, mLeaf) }
    if (leaf === 'louver') for (let i = 0; i < 9; i++) { const s = box(lw - 0.2, 0.025, 0.05, x, y - lh * 0.15 + i * 0.05, z + th / 2, mFrame); s.rotation.x = 0.5 }
    if (leaf === 'glassHalf') box(lw - 0.2, lh * 0.35, 0.05, x, y + lh * 0.2, z, glassMat)
    if (glassLeaf) { const f2 = leaf === 'glass' ? 0.05 : 0.03; box(lw, f2, 0.04, x, y + lh / 2 - f2 / 2, z, mFrame); box(lw, f2, 0.04, x, y - lh / 2 + f2 / 2, z, mFrame); box(f2, lh, 0.04, x - lw / 2 + f2 / 2, y, z, mFrame); box(f2, lh, 0.04, x + lw / 2 - f2 / 2, y, z, mFrame); box(lw - 2 * f2, lh - 2 * f2, 0.012, x, y, z, glassMat) }
  }
  const hnd = (x: number, y: number, z: number) => { if (spec?.handle === false) return; box(0.12, 0.022, 0.025, x, y, z + 0.045, mh); box(0.03, 0.03, 0.05, x + (x < 0 ? 0.05 : -0.05), y, z + 0.025, mh) }
  if (leaf === 'none') return g
  const n = d.kind === 'double' ? 2 : leaf === 'sliding' || leaf === 'fold' ? (spec?.panes ?? 2) : leaf === 'casement' || leaf === 'fixed' ? (spec?.panes ?? 1) : 1
  if (leaf === 'sliding' || leaf === 'fold') { const pw = iw / n; for (let i = 0; i < n; i++) leafBox(pw + 0.02, ih, -iw / 2 + pw * (i + 0.5), y0 + ih / 2, (i % 2 ? 1 : -1) * 0.025) }
  else if (leaf === 'fixed' && n === 1) leafBox(iw, ih, 0, y0 + ih / 2, 0)
  else { const pw = iw / n; for (let i = 0; i < n; i++) { leafBox(pw - 0.006, ih - 0.006, -iw / 2 + pw * (i + 0.5), y0 + ih / 2, 0); hnd(-iw / 2 + pw * (i + 0.5) + (n === 2 ? (i ? -1 : 1) * (pw / 2 - 0.1) : (pw / 2 - 0.1)), y0 + (d.kind === 'window' ? ih * 0.45 : 1.0), 0) } }
  return g
}
