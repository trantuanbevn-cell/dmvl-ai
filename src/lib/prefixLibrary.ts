// Thư viện tiền tố ký hiệu vật liệu (tên + mã) để chọn khi tạo nhóm vật liệu.
// Nguồn tham khảo: bảng ký hiệu vật liệu hoàn thiện VA 09 06 00 (CPT, LVT, GWB, ST, SS, RB…), danh mục viết tắt nội thất DesignFiles (CT, MDF, LAM, MTL, MIR, MWK, SST…),
// thông lệ bản vẽ khách sạn/FF&E. KHÔNG có chuẩn quốc tế duy nhất – các mã được chọn để KHÔNG trùng nhau trong cùng một danh mục.
import { PREFIXES } from './sections'

export type LibItem = { prefix: string; en: string; vn: string; cat: string; group?: string; note?: string }

/** Nhóm có sẵn trong hệ mã công ty (đã gắn với nhóm mã cũ) → xếp vào danh mục */
const EXISTING_CAT: Record<string, string> = {
  CT: 'Gạch & đá', ST: 'Gạch & đá', WD: 'Gỗ & tấm', LVT: 'Sàn', CPT: 'Sàn', PNT: 'Sơn & phủ', WC: 'Tường', WP: 'Tường', GWB: 'Trần', ACT: 'Trần', SKT: 'Tường',
  MTL: 'Kim loại', GL: 'Kính & gương', MIR: 'Kính & gương', FAB: 'Vải, da, rèm', LTH: 'Vải, da, rèm', WT: 'Vải, da, rèm', DR: 'Cửa & phụ kiện', HW: 'Cửa & phụ kiện',
  MWK: 'Nội thất', FHW: 'Nội thất', FUR: 'Nội thất', LGT: 'Chiếu sáng', PLB: 'Thiết bị vệ sinh', WRA: 'Thiết bị vệ sinh', EQP: 'Thiết bị', ART: 'Trang trí & artwork', DEC: 'Trang trí & artwork', SGN: 'Trang trí & artwork', MEP: 'MEP & khác',
}

// PREFIX|English|Tiếng Việt|ghi chú
const RAW: Record<string, string[]> = {
  'Sàn': [
    'VCT|Vinyl Composite Tile|Gạch vinyl composite (VCT)|thường gặp trong quy định BOH Marriott',
    'VSF|Vinyl Sheet Flooring|Sàn vinyl cuộn (hàn mối)',
    'SPC|Stone Plastic Composite Flooring|Sàn SPC (lõi đá nhựa, hèm khoá)',
    'EPX|Epoxy Flooring|Sàn epoxy (liền mạch)|sơn/lớp phủ epoxy tự san phẳng',
    'PUF|Polyurethane / PU Flooring|Sàn PU, sàn liền mạch Duraflex',
    'CONC|Concrete Flooring (sealed / polished)|Sàn bê tông (mài, phủ chống thấm)',
    'TRZ|Terrazzo|Terrazzo / đá mài',
    'RBF|Rubber Flooring|Sàn cao su',
    'LMF|Laminate Flooring|Sàn laminate',
    'SWF|Solid Wood Flooring|Sàn gỗ tự nhiên',
    'EWF|Engineered Wood Flooring|Sàn gỗ kỹ thuật',
    'PRQ|Parquet|Sàn gỗ ghép (parquet)',
    'BMB|Bamboo Flooring|Sàn tre',
    'RAF|Raised Access Floor|Sàn nâng (phòng máy, văn phòng)',
    'MAT|Walk-off Mat|Thảm chùi chân / thảm lối vào',
    'RUG|Rug|Thảm trải (rug)',
    'TRF|Artificial Turf|Cỏ nhân tạo',
  ],
  'Gạch & đá': [
    'MOS|Mosaic Tile|Gạch mosaic',
    'SNT|Sintered Stone / Large Format Slab|Đá thiêu kết / tấm porcelain khổ lớn',
    'QTZ|Engineered Quartz|Đá quartz nhân tạo',
    'MRB|Marble|Đá cẩm thạch (marble)',
    'GRN|Granite|Đá granite',
    'LMS|Limestone|Đá vôi (limestone)',
    'TRV|Travertine|Đá travertine',
    'ONX|Onyx|Đá onyx',
    'SLA|Slate|Đá slate',
    'SSF|Solid Surface|Đá solid surface (Corian…)',
    'BRK|Brick|Gạch xây / gạch thẻ ốp',
    'CMT|Cement Tile|Gạch bông / gạch xi măng',
    'GRT|Grout|Keo chà ron',
  ],
  'Gỗ & tấm': [
    'VNR|Wood Veneer|Gỗ veneer',
    'PLY|Plywood|Ván ép (plywood)',
    'MDF|Medium-Density Fibreboard|Ván MDF',
    'HPL|High-Pressure Laminate|Laminate HPL (tấm phủ)',
    'MLM|Melamine Board|Ván phủ melamine (MFC/MDF)',
    'LAM|Laminate|Laminate',
    'ACR|Acrylic Panel|Tấm acrylic',
    'WPC|Wood-Plastic Composite|Gỗ nhựa composite',
    'CRK|Cork|Nút chai / bần',
    'RTN|Rattan / Wicker|Mây, tre, đan',
    'FLP|Fluted Panel|Tấm lam sóng / ốp lam',
    'TMB|Solid Timber|Gỗ tự nhiên nguyên khối',
  ],
  'Tường': [
    'VWC|Vinyl Wallcovering|Giấy dán tường vinyl',
    'FWC|Fabric Wallcovering|Vải dán tường',
    'PLS|Plaster|Vữa trát / thạch cao trát',
    'MCM|Micro-cement|Xi măng mài (microcement)',
    'TXC|Textured Coating|Sơn hiệu ứng / sơn giả đá',
    'APN|Acoustic Panel|Tấm tiêu âm',
    'UWP|Upholstered Wall Panel|Tấm bọc nệm / ốp da vải',
    'MLD|Moulding / Cornice|Phào chỉ',
    'WRL|Wall Protection Rail|Thanh chắn bảo vệ tường',
    'CGD|Corner Guard|Nẹp bảo vệ góc',
  ],
  'Trần': [
    'MTC|Metal Ceiling|Trần kim loại / nhôm',
    'WDC|Wood Ceiling|Trần gỗ / trần lam gỗ',
    'STC|Stretch Ceiling|Trần căng (xuyên sáng)',
    'BFL|Baffle / Linear Ceiling|Trần lam / baffle',
  ],
  'Sơn & phủ': [
    'EPP|Epoxy Paint|Sơn epoxy (tường)',
    'FRP|Fire-retardant / Intumescent Paint|Sơn chống cháy',
    'LCQ|Lacquer|Sơn PU / lacquer',
    'STN|Stain / Varnish|Vecni / sơn nhuộm gỗ',
    'WPF|Waterproof Coating|Sơn / màng chống thấm',
  ],
  'Kim loại': [
    'SST|Stainless Steel|Inox',
    'ALU|Aluminium|Nhôm',
    'BRS|Brass / Bronze|Đồng thau / đồng',
    'CPR|Copper|Đồng đỏ',
    'STL|Mild Steel|Thép (sắt, thép sơn tĩnh điện)',
    'PWC|Powder-coated Metal|Kim loại sơn tĩnh điện',
    'PVD|PVD Coated Metal|Inox mạ PVD (vàng, đen…)',
    'PRF|Perforated Metal|Kim loại đục lỗ / CNC',
  ],
  'Kính & gương': [
    'TGL|Tempered Glass|Kính cường lực',
    'LGL|Laminated Glass|Kính dán an toàn',
    'FRG|Frosted / Etched Glass|Kính mờ / kính phun cát',
    'IGU|Insulated Glass Unit|Kính hộp (Low-E)',
    'BPG|Back-painted Glass|Kính sơn màu',
    'GLB|Glass Block|Gạch kính',
  ],
  'Cửa & phụ kiện': [
    'FDR|Fire-rated Door|Cửa chống cháy',
    'GDR|Glass Door|Cửa kính',
    'SLD|Sliding Door / Partition|Cửa lùa / vách trượt',
    'WIN|Window|Cửa sổ',
    'LVR|Louver|Lam gió / cửa lá sách',
    'HNG|Hinge|Bản lề',
    'HDL|Handle / Pull|Tay nắm / tay kéo',
    'LCK|Lock|Khoá',
    'CLS|Door Closer|Tay co thuỷ lực',
    'DST|Door Stop|Chặn cửa',
  ],
  'Vải, da, rèm': [
    'CRT|Curtain|Rèm vải',
    'BLD|Blind|Rèm cuốn / rèm lá',
    'SHR|Sheer Curtain|Rèm voan',
    'BKO|Blackout Curtain|Rèm cản sáng',
    'UPH|Upholstery Fabric|Vải bọc nội thất',
    'PUL|Faux Leather (PU)|Da công nghiệp / giả da PU',
  ],
  'Nội thất': [
    'CHR|Chair|Ghế',
    'TBL|Table|Bàn',
    'SOF|Sofa|Sofa',
    'BED|Bed|Giường',
    'MTR|Mattress|Nệm',
    'NST|Nightstand|Táp đầu giường',
    'WRD|Wardrobe|Tủ quần áo',
    'DSK|Desk|Bàn làm việc',
    'WKS|Workstation|Bàn làm việc nhóm (workstation)',
    'CAB|Cabinet|Tủ',
    'SHF|Shelf|Kệ',
    'RCK|Storage Rack|Kệ sắt kho / giá đỡ',
    'LKR|Locker|Tủ locker',
    'BNC|Bench|Ghế băng',
    'STO|Stool|Ghế đẩu / ghế quầy bar',
    'OTT|Ottoman / Pouf|Đôn / ghế đôn',
    'CNT|Counter|Quầy / mặt quầy',
  ],
  'Thiết bị vệ sinh': [
    'TLT|Toilet / Water Closet|Bồn cầu',
    'BSN|Basin|Chậu rửa (lavabo)',
    'FCT|Faucet / Tap|Vòi nước',
    'SHW|Shower|Sen tắm / phòng tắm đứng',
    'BTH|Bathtub|Bồn tắm',
    'URN|Urinal|Bồn tiểu',
    'FDN|Floor Drain|Phễu thu sàn',
    'GRB|Grab Bar|Tay vịn / thanh bám',
  ],
  'Chiếu sáng': [
    'DWL|Downlight|Đèn downlight âm trần',
    'PDL|Pendant Light|Đèn thả',
    'WLT|Wall Light / Sconce|Đèn tường',
    'FLM|Floor Lamp|Đèn sàn',
    'TLM|Table Lamp|Đèn bàn',
    'LST|LED Strip / Linear|Đèn LED dây / thanh',
    'TRK|Track Light|Đèn ray',
    'EXL|Exit / Emergency Light|Đèn exit / khẩn cấp',
  ],
  'Thiết bị': [
    'TVS|Television / Display|TV / màn hình',
    'APL|Appliance|Thiết bị gia dụng',
    'KEQ|Kitchen Equipment|Thiết bị bếp',
    'LDM|Laundry Machine|Máy giặt, sấy, ủi',
    'FAN|Fan|Quạt',
    'SAF|Safe|Két an toàn',
    'ITE|IT / Network Equipment|Thiết bị CNTT / mạng',
  ],
  'Trang trí & artwork': [
    'PLN|Plant|Cây xanh / hoa',
    'SCL|Sculpture|Tượng / điêu khắc',
    'CSH|Cushion|Gối trang trí',
    'MRL|Mural|Tranh tường (mural)',
    'WDK|Wall Decor|Đồ trang trí tường',
    'FRM|Picture Frame|Khung tranh / ảnh',
  ],
  'MEP & khác': [
    'ACP|Access Panel|Nắp thăm / cửa thăm trần',
    'GRL|Grille / Diffuser|Miệng gió / nan chia gió',
    'CBT|Cable Tray|Máng cáp',
    'SPR|Sprinkler|Đầu phun chữa cháy',
    'FRE|Fire Safety Device|Thiết bị PCCC (chuông, đèn, bình)',
    'INS|Insulation|Vật liệu cách nhiệt / cách âm',
    'WPM|Waterproof Membrane|Màng chống thấm',
    'CMU|Concrete Masonry Unit|Gạch block bê tông',
    'EXS|Existing to Remain|Giữ nguyên hiện trạng',
  ],
  'Ngoại thất & cảnh quan': [
    'PVR|Paver|Gạch lát sân / đá lát ngoài trời',
    'GRV|Gravel / Pebble|Sỏi / đá cuội',
    'DCK|Decking|Sàn gỗ ngoài trời / deck',
    'PLR|Planter|Chậu cây / bồn cây',
    'WTF|Water Feature|Tiểu cảnh nước',
  ],
}

let cache: LibItem[] | null = null
export const library = (): LibItem[] => {
  if (cache) return cache
  const out: LibItem[] = PREFIXES.map(p => ({ prefix: p.prefix, en: p.en, vn: p.vn, cat: EXISTING_CAT[p.prefix] ?? 'MEP & khác', group: p.groups[0], note: p.includes_vn }))
  const seen = new Set(out.map(x => x.prefix))
  for (const [cat, rows] of Object.entries(RAW)) for (const r of rows) { const [prefix, en, vn, note] = r.split('|'); if (seen.has(prefix)) continue; seen.add(prefix); out.push({ prefix, en, vn, cat, note }) }
  return (cache = out)
}
export const LIB_CATS = ['Sàn', 'Gạch & đá', 'Gỗ & tấm', 'Tường', 'Trần', 'Sơn & phủ', 'Kim loại', 'Kính & gương', 'Cửa & phụ kiện', 'Vải, da, rèm', 'Nội thất', 'Thiết bị vệ sinh', 'Chiếu sáng', 'Thiết bị', 'Trang trí & artwork', 'MEP & khác', 'Ngoại thất & cảnh quan']
/** Mã nhóm dùng cho mã vật liệu khi chọn mục này: nhóm có sẵn nếu có, nếu không thì chính tiền tố */
export const groupOfItem = (it: LibItem) => it.group ?? it.prefix
export const searchLib = (q: string): LibItem[] => {
  const t = q.trim().toLowerCase(); if (!t) return library()
  return library().filter(x => [x.prefix, x.en, x.vn, x.cat, x.note ?? ''].join(' ').toLowerCase().includes(t))
}
