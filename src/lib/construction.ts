// Thư viện CẤU TẠO LỚP cho tường – vách – trần – sàn: người làm chỉ tích chọn từng lớp, phần mềm tự viết "Thông số kỹ thuật" + "Cấu tạo"
// ĐÚNG theo vật liệu đã chọn (sơn thì chỉ nói sơn; gỗ công nghiệp thì nói cốt gỗ…). Không có giá. Nội dung theo thực hành thông dụng ngành xây dựng
// Việt Nam (TCVN/QCVN, catalogue Vĩnh Tường – Gyproc, hệ sơn nước nội thất, hệ sơn gỗ PU/NC); số liệu cụ thể để dạng chọn, người làm chốt theo thiết kế.
import type { Entry } from './types'
import { saveEntry } from './entryLink'
import { changeGroup } from './entryGroup'

export type Opt = { k: string; vn: string; en: string; s?: string; vars?: string[]; note?: [string, string]; tip?: string; rep?: boolean }
export type Layer = { k: string; vn: string; en: string; multi?: boolean; when?: (sel: Sel) => boolean; opts: Opt[]; hint?: string }
export type System = { k: 'wall' | 'ceiling' | 'floor' | 'carpet'; vn: string; en: string; layers: Layer[] }
/** sel[layer] = danh sách khoá đã tích; vars["layer/opt"] = lựa chọn kích thước/độ dày (nếu có) */
export type BuildState = { sys: System['k']; sel: Record<string, string[]>; vars: Record<string, string>; extra?: string }
type Sel = Record<string, string[]>

const o = (k: string, vn: string, en: string, vars?: string[], s?: string, note?: [string, string], tip?: string): Opt => ({ k, vn, en, vars, s, note, tip })
const has = (sel: Sel, layer: string, key?: string) => key ? !!sel[layer]?.includes(key) : !!sel[layer]?.length

// ───── Hệ sơn (dùng chung cho tường – trần – gỗ/MDF) ─────
const PAINT_LAYERS = (field: string): Layer[] => [
  { k: 'prep', vn: 'Xử lý bề mặt trước khi sơn', en: 'Surface preparation before painting', multi: true, when: s => has(s, field, 'paint'), opts: [
    o('joint', 'Xử lý mối nối tấm thạch cao (băng keo giấy/lưới + bột trét mối nối), trét đầu vít', 'Plasterboard joint treatment (paper/mesh tape + joint compound), screw heads stopped', undefined, 'xử lý mối nối'),
    o('skim', 'Bả matit (bột trét nội thất) – xả nhám giữa các lớp', 'Skim coat (interior putty), sanded between coats', ['1 lớp', '2 lớp', '3 lớp (hoàn thiện cao cấp)'], 'bả matit'),
    o('crack', 'Xử lý vết nứt: cắt mở rộng, trét vá, dán lưới thủy tinh', 'Crack repair: routed, filled, glass-fibre mesh applied', undefined, 'xử lý nứt'),
    o('sandMdf', 'Xả nhám, bả polyester/bả gốc PU lấp lỗ (bề mặt MDF/gỗ)', 'Sanding, polyester/PU filler to fill pores (MDF/timber substrate)', undefined, 'bả MDF/gỗ'),
    o('waterproof', 'Chống thấm tường (khu ẩm) trước khi bả', 'Wall waterproofing (wet areas) before skim coat', undefined, 'chống thấm'),
  ] },
  { k: 'primer', vn: 'Sơn lót', en: 'Primer', when: s => has(s, field, 'paint'), opts: [
    o('alk', 'Sơn lót chống kiềm gốc nước nội thất', 'Interior water-based alkali-resistant primer', ['1 lớp', '2 lớp'], 'lót chống kiềm'),
    o('alkExt', 'Sơn lót chống kiềm ngoại thất / chống thấm khuếch tán', 'Exterior alkali-resistant / anti-diffusion primer', ['1 lớp', '2 lớp'], 'lót ngoại thất'),
    o('gypPrimer', 'Sơn lót cho thạch cao (lót chống thấm hút, PVA/acrylic)', 'Plasterboard sealer primer (acrylic/PVA)', ['1 lớp'], 'lót thạch cao'),
    o('pu', 'Sơn lót PU hai thành phần (2K) cho MDF/gỗ', 'Two-pack (2K) PU primer for MDF/timber', ['1 lớp', '2 lớp'], 'lót PU'),
    o('nc', 'Sơn lót NC (nitro) cho gỗ', 'NC (nitrocellulose) wood sealer', ['1 lớp', '2 lớp'], 'lót NC'),
    o('none', 'Không sơn lót (sơn 2 trong 1 / theo hãng)', 'No separate primer (as per manufacturer system)', undefined, 'không lót'),
  ] },
  { k: 'top', vn: 'Sơn phủ hoàn thiện', en: 'Finish coat', when: s => has(s, field, 'paint'), opts: [
    o('matt', 'Sơn nước nội thất mờ (matt)', 'Interior water-based paint, matt', ['2 lớp', '3 lớp'], 'sơn mờ'),
    o('satin', 'Sơn nước nội thất bán bóng (satin), lau chùi được', 'Interior water-based paint, satin, washable', ['2 lớp', '3 lớp'], 'sơn bán bóng'),
    o('gloss', 'Sơn nước nội thất bóng (gloss)', 'Interior water-based paint, gloss', ['2 lớp', '3 lớp'], 'sơn bóng'),
    o('mould', 'Sơn nội thất kháng khuẩn – chống nấm mốc (khu ẩm)', 'Interior anti-bacterial / anti-mould paint (humid areas)', ['2 lớp'], 'sơn chống nấm mốc'),
    o('ext', 'Sơn ngoại thất chống thấm, chống rêu mốc, bền màu', 'Exterior paint: water-repellent, anti-algae, colour-fast', ['2 lớp'], 'sơn ngoại thất'),
    o('pu2k', 'Sơn PU 2K (phủ gỗ/MDF)', '2K PU topcoat (timber/MDF)', ['mờ', 'bán bóng', 'bóng cao'], 'sơn PU'),
    o('nctop', 'Sơn NC (nitro) phủ gỗ', 'NC lacquer topcoat (timber)', ['mờ', 'bán bóng', 'bóng'], 'sơn NC'),
    o('effect', 'Sơn hiệu ứng (giả bê tông, giả đá, ánh kim, nhũ…)', 'Decorative effect paint (concrete/stone/metallic effect)', undefined, 'sơn hiệu ứng'),
    o('epoxy', 'Sơn epoxy tường (khu kỹ thuật/bếp)', 'Epoxy wall coating (service/kitchen areas)', ['2 lớp'], 'sơn epoxy'),
  ] },
]

// ───── Tường – vách ốp ─────
const WALL: System = {
  k: 'wall', vn: 'Tường – vách ốp', en: 'Wall / wall cladding',
  layers: [
    { k: 'base', vn: 'Nền đỡ / khung xương', en: 'Substrate / framing', opts: [
      o('masonry', 'Tường xây gạch / bê tông hiện hữu, trát phẳng', 'Existing brick / concrete wall, plastered flat', undefined, 'tường xây trát phẳng'),
      o('steel', 'Khung xương thép hộp mạ kẽm', 'Galvanised steel box-section frame', ['20×20 mm', '20×40 mm', '25×50 mm', '30×60 mm'], 'khung thép hộp', ['Bước khung ≤ 400 mm; sơn chống gỉ mối hàn, bắt chân khung vào kết cấu bằng tắc kê thép', 'Frame pitch ≤ 400 mm; weld points rust-protected, anchored to structure with steel expansion anchors']),
      o('timber', 'Khung xương gỗ (gỗ sấy, xử lý mối mọt, tẩm chống cháy)', 'Timber framing (kiln-dried, termite-treated, fire-retardant)', ['30×40 mm', '40×60 mm'], 'khung gỗ', ['Bước khung ≤ 400 mm; chân khung có lớp chống ẩm khi tiếp xúc tường', 'Frame pitch ≤ 400 mm; damp-proof layer where in contact with the wall']),
      o('cstud', 'Khung xương vách thạch cao (thanh đứng C + thanh ngang U, thép mạ kẽm)', 'Plasterboard partition framing (C studs + U tracks, galvanised steel)', ['C50', 'C75', 'C100'], 'khung vách thạch cao', ['Thanh đứng cách 406 mm (hoặc 610 mm); cố định ray U vào sàn/trần bằng tắc kê', 'Studs at 406 mm (or 610 mm); U tracks anchored to floor/slab']),
      o('dry', 'Hệ treo khô (ray/móc thép không gỉ hoặc nhôm)', 'Dry-hanging system (stainless steel / aluminium rails & hooks)', undefined, 'hệ treo khô'),
      o('direct', 'Dán / bắt trực tiếp lên nền, không dùng khung', 'Bonded / fixed directly to the substrate, no framing', undefined, 'không khung'),
    ] },
    { k: 'core', vn: 'Lớp cốt / tấm nền', en: 'Core / backing board', hint: 'Cốt là lớp bên trong, quyết định độ phẳng, chịu ẩm, chống cháy', opts: [
      o('gyp', 'Tấm thạch cao tiêu chuẩn', 'Standard plasterboard', ['9 mm', '12,5 mm', '15 mm'], 'thạch cao'),
      o('gypM', 'Tấm thạch cao chịu ẩm (mặt giấy xanh)', 'Moisture-resistant plasterboard (green face)', ['9 mm', '12,5 mm', '15 mm'], 'thạch cao chịu ẩm'),
      o('gypF', 'Tấm thạch cao chống cháy (mặt giấy hồng)', 'Fire-rated plasterboard (pink face)', ['12,5 mm', '15 mm'], 'thạch cao chống cháy'),
      o('cement', 'Tấm xi măng sợi cellulose (chịu ẩm, ngoại thất/khu ướt)', 'Cellulose fibre-cement board (moisture-resistant, wet/exterior areas)', ['6 mm', '8 mm', '10 mm', '12 mm'], 'xi măng sợi'),
      o('mdf', 'Ván MDF tiêu chuẩn', 'Standard MDF board', ['9 mm', '12 mm', '15 mm', '17 mm', '18 mm'], 'MDF'),
      o('mdfM', 'Ván MDF chống ẩm (lõi xanh, HMR)', 'Moisture-resistant MDF (green core, HMR)', ['9 mm', '12 mm', '15 mm', '17 mm', '18 mm'], 'MDF chống ẩm'),
      o('mfc', 'Ván dăm (MFC / ván dăm công nghiệp)', 'Particleboard (MFC / industrial chipboard)', ['12 mm', '15 mm', '18 mm'], 'ván dăm'),
      o('ply', 'Ván ép (plywood)', 'Plywood', ['9 mm', '12 mm', '15 mm', '18 mm'], 'ván ép'),
      o('wave', 'Tấm lam sóng MDF phay CNC (lam sóng/ 3D)', 'CNC-routed MDF fluted / wave panel', ['12 mm', '15 mm', '18 mm'], 'lam sóng MDF'),
      o('slat', 'Lam gỗ / lam WPC lắp đặt ngang hoặc đứng', 'Timber / WPC slats installed horizontally or vertically', undefined, 'lam'),
      o('solid', 'Gỗ tự nhiên ghép thanh', 'Edge-glued solid timber', ['12 mm', '15 mm', '18 mm'], 'gỗ tự nhiên'),
      o('none', 'Không có lớp cốt – hoàn thiện trực tiếp lên nền', 'No core – finish applied directly to the substrate', undefined, 'không cốt'),
    ] },
    { k: 'finish', vn: 'Lớp hoàn thiện bề mặt', en: 'Surface finish', multi: true, opts: [
      o('paint', 'Sơn', 'Paint', undefined, 'sơn'),
      o('melamine', 'Melamine (phủ melamine hai mặt, nẹp cạnh cùng màu)', 'Melamine face (both sides), matching edge banding', undefined, 'melamine'),
      o('hpl', 'Laminate HPL dán', 'HPL laminate, bonded', ['0,6 mm', '0,7 mm', '0,8 mm', '1,0 mm'], 'laminate HPL'),
      o('acrylic', 'Acrylic bóng (tấm MDF phủ acrylic)', 'High-gloss acrylic-faced board', undefined, 'acrylic'),
      o('veneer', 'Veneer gỗ tự nhiên dán, phủ PU/NC bảo vệ', 'Natural wood veneer, protected with PU/NC lacquer', ['Sồi (Oak)', 'Óc chó (Walnut)', 'Tần bì (Ash)', 'Teak', 'Gỗ khác theo mẫu'], 'veneer'),
      o('solidw', 'Gỗ tự nhiên, phủ PU/dầu bảo vệ', 'Solid timber, PU/oil finish', undefined, 'gỗ tự nhiên'),
      o('wallpaper', 'Giấy dán tường (vinyl / giấy nhập khẩu)', 'Wallpaper (vinyl / imported)', undefined, 'giấy dán tường'),
      o('fabricwc', 'Vải dán tường / vải bọc căng', 'Fabric wallcovering / stretched fabric', undefined, 'vải dán tường'),
      o('upholstery', 'Bọc da / giả da trên lớp mút', 'Leather / faux-leather upholstery over foam', ['mút 10 mm', 'mút 20 mm', 'mút 30 mm'], 'bọc da'),
      o('acoustic', 'Vải bọc tiêu âm trên bông khoáng / bông thủy tinh', 'Acoustic fabric over mineral / glass wool', ['bông dày 25 mm', 'bông dày 50 mm'], 'tiêu âm'),
      o('stone', 'Đá tự nhiên ốp (dán keo hoặc treo khô)', 'Natural stone cladding (adhesive or dry-hung)', ['12 mm', '15 mm', '20 mm', '30 mm'], 'đá tự nhiên'),
      o('engstone', 'Đá nhân tạo / đá thiêu kết (tấm khổ lớn)', 'Engineered / sintered stone (large format slabs)', ['6 mm', '12 mm', '20 mm'], 'đá nhân tạo'),
      o('tile', 'Gạch ốp (dán bằng keo dán gạch, chà ron)', 'Wall tile (tile adhesive, grouted)', undefined, 'gạch ốp'),
      o('glass', 'Kính cường lực / kính dán an toàn', 'Tempered / laminated safety glass', ['8 mm', '10 mm', '12 mm'], 'kính'),
      o('mirror', 'Gương (dán keo trung tính, mài cạnh)', 'Mirror (neutral-cure adhesive, polished edges)', ['5 mm', '6 mm'], 'gương'),
      o('metal', 'Kim loại ốp tường', 'Metal cladding', ['Inox 304', 'Inox mạ PVD', 'Nhôm', 'Thép sơn tĩnh điện'], 'kim loại'),
      o('acp', 'Tấm nhôm nhựa (aluminium composite)', 'Aluminium composite panel', ['3 mm', '4 mm'], 'tấm nhôm nhựa'),
      o('pvcstone', 'Tấm nhựa giả đá / tấm than tre (PVC, UV marble)', 'PVC faux-stone / bamboo-charcoal panel (UV marble sheet)', ['3 mm', '5 mm', '8 mm'], 'tấm giả đá'),
      o('wpc', 'Tấm ốp WPC / SPC', 'WPC / SPC wall panel', undefined, 'tấm WPC'),
      o('plaster', 'Trát hiệu ứng (microcement, giả bê tông, tadelakt)', 'Decorative plaster (microcement, concrete-effect, tadelakt)', undefined, 'trát hiệu ứng'),
    ] },
    ...PAINT_LAYERS('finish'),
    { k: 'fix', vn: 'Phương pháp lắp', en: 'Fixing method', multi: true, opts: [
      o('screw', 'Bắt vít đầu giấu, trét xử lý đầu vít', 'Concealed screw fixing, screw heads stopped', undefined, 'bắt vít'),
      o('glue', 'Dán keo chuyên dụng (keo AB / keo dán gỗ / keo trung tính)', 'Bonded with specialist adhesive (two-part / wood / neutral-cure)', undefined, 'dán keo'),
      o('nail', 'Bắn đinh/ghim nẹp, che mối bằng nẹp cùng màu', 'Pin/brad fixing, joints covered by matching trim', undefined, 'bắn đinh'),
      o('clip', 'Hèm âm dương / clip ẩn', 'Tongue-and-groove / hidden clips', undefined, 'hèm/clip ẩn'),
      o('trim', 'Nẹp góc, nẹp chuyển tiếp, khe kỹ thuật theo bản vẽ', 'Corner trims, transition trims and shadow gaps per drawing', undefined, 'nẹp góc'),
    ] },
    { k: 'extra', vn: 'Lớp phụ trợ', en: 'Additional layers', multi: true, opts: [
      o('rockwool', 'Bông khoáng / bông thủy tinh cách âm, tiêu âm trong hộc khung', 'Mineral / glass wool insulation in the frame cavity', ['25 mm', '50 mm'], 'bông cách âm'),
      o('damp', 'Lớp chống ẩm (màng PE / sơn chống thấm lưng tấm)', 'Damp-proof layer (PE membrane / back-sealing)', undefined, 'chống ẩm'),
      o('fireproof', 'Sơn chống cháy lan / tẩm chống cháy cho gỗ', 'Intumescent fire coating / fire-retardant treatment for timber', undefined, 'chống cháy'),
    ] },
  ],
}

// ───── Trần ─────
const CEILING: System = {
  k: 'ceiling', vn: 'Trần', en: 'Ceiling',
  layers: [
    { k: 'type', vn: 'Kiểu trần', en: 'Ceiling type', opts: [
      o('flat', 'Trần phẳng', 'Flat ceiling', undefined, 'trần phẳng'),
      o('drop', 'Trần giật cấp / hộc đèn', 'Stepped ceiling / light cove', undefined, 'trần giật cấp'),
      o('curve', 'Trần cong / lượn sóng', 'Curved / wave ceiling', undefined, 'trần cong'),
      o('tbar', 'Trần thả (khung nổi T-bar, tấm 600×600)', 'Suspended ceiling (exposed T-bar grid, 600×600 tiles)', undefined, 'trần thả'),
      o('slat', 'Trần lam (gỗ/nhôm/WPC)', 'Slat ceiling (timber / aluminium / WPC)', undefined, 'trần lam'),
      o('raw', 'Trần bê tông lộ, không giả trần', 'Exposed concrete soffit, no false ceiling', undefined, 'trần bê tông lộ'),
    ] },
    { k: 'frame', vn: 'Khung xương', en: 'Framing', opts: [
      o('conc', 'Khung xương chìm Vĩnh Tường (thanh chính + thanh phụ 35×14,5 mm, thép mạ kẽm/Al-Zn 0,32 mm, TCVN 7470), ty treo cách 800 mm', 'Vĩnh Tường concealed frame (main & cross runners 35×14.5 mm, galvanised/Al-Zn steel 0.32 mm, TCVN 7470), hangers at 800 mm', ['C600', 'Alpha', 'Basi'], 'khung chìm Vĩnh Tường'),
      o('expo', 'Khung nổi Vĩnh Tường FineLINE X (thanh chính 3600 mm, thanh phụ 1200/600 mm, thép dày 0,27 mm, ASTM C635)', 'Vĩnh Tường FineLINE X exposed grid (main 3600 mm, cross 1200/600 mm, 0.27 mm steel, ASTM C635)', undefined, 'khung nổi FineLINE X'),
      o('box', 'Khung thép hộp mạ kẽm (trần lam, trần cong, tải nặng)', 'Galvanised steel box-section frame (slat / curved / heavy ceilings)', ['20×20 mm', '20×40 mm', '25×50 mm'], 'khung thép hộp'),
      o('timber', 'Khung xương gỗ (gỗ sấy, tẩm chống cháy)', 'Timber framing (kiln-dried, fire-retardant)', ['30×40 mm', '40×60 mm'], 'khung gỗ'),
      o('alu', 'Khung nhôm (trần nhôm clip-in / lay-in)', 'Aluminium carrier (clip-in / lay-in aluminium ceiling)', undefined, 'khung nhôm'),
      o('none', 'Dán / bắt trực tiếp lên sàn bê tông, không khung', 'Fixed directly to the concrete slab, no framing', undefined, 'không khung'),
    ] },
    { k: 'core', vn: 'Lớp cốt / tấm trần', en: 'Core / ceiling board', opts: [
      o('gyp', 'Tấm thạch cao tiêu chuẩn (cạnh vạt RE)', 'Standard plasterboard (recessed edge, RE)', ['9 mm', '12,5 mm', '15 mm'], 'thạch cao'),
      o('gypM', 'Tấm thạch cao siêu chịu ẩm (cạnh vạt RE / vuông SE)', 'Moisture-resistant plasterboard (RE / SE edge)', ['9 mm', '12,5 mm', '15 mm'], 'thạch cao chịu ẩm'),
      o('gypF', 'Tấm thạch cao chống cháy', 'Fire-rated plasterboard', ['12,5 mm', '15 mm'], 'thạch cao chống cháy'),
      o('perf', 'Tấm thạch cao đục lỗ tiêu âm (lưng dán vải/giấy tiêu âm)', 'Perforated acoustic plasterboard (acoustic backing fleece)', ['9 mm', '12,5 mm'], 'thạch cao đục lỗ'),
      o('mineral', 'Tấm sợi khoáng tiêu âm 600×600', 'Mineral-fibre acoustic tile 600×600', ['15 mm', '19 mm'], 'tấm sợi khoáng'),
      o('cement', 'Tấm xi măng sợi (trần ẩm/ngoại thất)', 'Fibre-cement board (humid / exterior soffits)', ['6 mm', '8 mm', '10 mm'], 'xi măng sợi'),
      o('mdf', 'Ván MDF / MDF chống ẩm', 'MDF / moisture-resistant MDF', ['9 mm', '12 mm', '15 mm'], 'MDF'),
      o('ply', 'Ván ép (plywood)', 'Plywood', ['9 mm', '12 mm', '15 mm'], 'ván ép'),
      o('alupanel', 'Tấm nhôm (clip-in 600×600 / lam nhôm)', 'Aluminium panels (clip-in 600×600 / baffles)', ['0,5 mm', '0,6 mm', '0,7 mm'], 'tấm nhôm'),
      o('pvc', 'Tấm nhựa PVC / nhựa composite', 'PVC / composite plastic panels', undefined, 'tấm nhựa'),
    ] },
    { k: 'finish', vn: 'Lớp hoàn thiện bề mặt', en: 'Surface finish', multi: true, opts: [
      o('paint', 'Sơn', 'Paint', undefined, 'sơn'),
      o('factory', 'Bề mặt hoàn thiện sẵn từ nhà máy (không sơn thêm)', 'Factory-finished surface (no further paint)', undefined, 'hoàn thiện sẵn'),
      o('wallpaper', 'Giấy / vải dán trần', 'Wallpaper / fabric wallcovering', undefined, 'giấy dán'),
      o('veneer', 'Veneer gỗ tự nhiên dán, phủ PU/NC', 'Natural wood veneer with PU/NC lacquer', undefined, 'veneer'),
      o('hpl', 'Laminate HPL / melamine', 'HPL laminate / melamine', undefined, 'laminate/melamine'),
      o('alufinish', 'Nhôm sơn tĩnh điện / sơn vân gỗ (giả gỗ)', 'Powder-coated aluminium / wood-grain transfer finish', undefined, 'nhôm sơn tĩnh điện'),
      o('stretch', 'Màng căng (trần căng / trần xuyên sáng)', 'Stretch membrane (stretch / translucent light ceiling)', undefined, 'trần căng'),
      o('mirror', 'Gương / inox gương', 'Mirror / mirror-polished stainless steel', undefined, 'gương/inox'),
    ] },
    ...PAINT_LAYERS('finish'),
    { k: 'extra', vn: 'Chi tiết phụ trợ', en: 'Additional details', multi: true, opts: [
      o('access', 'Nắp thăm trần (khung nhôm, tấm cùng loại trần)', 'Ceiling access panels (aluminium frame, same board as ceiling)', ['450×450 mm', '600×600 mm'], 'nắp thăm trần'),
      o('shadow', 'Khe bóng đổ / phào nhôm âm trần', 'Shadow gap / recessed aluminium trim', undefined, 'khe bóng đổ'),
      o('rockwool', 'Bông khoáng / bông thủy tinh cách âm, cách nhiệt phủ lưng trần', 'Mineral / glass wool insulation laid over ceiling', ['25 mm', '50 mm'], 'bông cách âm/nhiệt'),
      o('cove', 'Hộc đèn trang trí (máng đèn LED, gờ chắn sáng)', 'Decorative light cove (LED trough, upstand)', undefined, 'hộc đèn'),
      o('expansion', 'Khe co giãn trần (ô lớn > 15 m)', 'Ceiling expansion joint (large spans > 15 m)', undefined, 'khe co giãn'),
    ] },
  ],
}

// ───── Sàn ─────
const FLOOR: System = {
  k: 'floor', vn: 'Sàn', en: 'Floor',
  layers: [
    { k: 'base', vn: 'Nền / lớp cán nền', en: 'Base / screed', opts: [
      o('slab', 'Sàn bê tông kết cấu, vệ sinh sạch, độ ẩm đạt yêu cầu', 'Structural concrete slab, cleaned, moisture within limits', undefined, 'sàn bê tông'),
      o('screed', 'Lớp cán nền vữa xi măng cát mác ≥ 75, phẳng ± 3 mm / 2 m', 'Cement-sand screed grade ≥ 75, flat within ±3 mm / 2 m', ['30 mm', '40 mm', '50 mm', '60 mm'], 'cán nền XM-cát'),
      o('sl', 'Lớp tự san phẳng (self-levelling)', 'Self-levelling compound', ['3 mm', '5 mm', '10 mm'], 'tự san phẳng'),
      o('raised', 'Sàn nâng: khung xương gỗ/thép + ván lót', 'Raised floor: timber / steel joists + subfloor boards', undefined, 'sàn nâng khung xương'),
    ] },
    { k: 'wp', vn: 'Chống thấm (khu ướt)', en: 'Waterproofing (wet areas)', opts: [
      o('cem', 'Màng chống thấm gốc xi măng – polymer hai thành phần, quét 2 lớp, cổ ống/chân tường lên cao ≥ 200 mm', 'Two-part cement-polymer waterproof membrane, 2 coats, turned up ≥ 200 mm at walls and pipe collars', undefined, 'chống thấm xi măng-polymer'),
      o('pu', 'Màng chống thấm polyurethane gốc nước, 2 lớp', 'Water-based polyurethane membrane, 2 coats', undefined, 'chống thấm PU'),
      o('sheet', 'Màng chống thấm dạng tấm (bitum / TPO), hàn nhiệt mối nối', 'Sheet waterproofing (bitumen / TPO), heat-welded joints', undefined, 'màng chống thấm tấm'),
    ] },
    { k: 'under', vn: 'Lớp lót / keo dán', en: 'Underlay / adhesive', multi: true, opts: [
      o('mortar', 'Vữa lát nền xi măng cát (lát gạch/đá)', 'Cement-sand bedding mortar (tile / stone)', undefined, 'vữa lát'),
      o('tileglue', 'Keo dán gạch gốc xi măng (C2)', 'Cement-based tile adhesive (C2)', undefined, 'keo dán gạch'),
      o('foam', 'Xốp lót sàn gỗ (foam PE/IXPE) 2–3 mm, kèm màng chống ẩm', 'PE/IXPE foam underlay 2–3 mm with damp-proof membrane', undefined, 'xốp lót'),
      o('ply', 'Ván ép lót chống ẩm', 'Moisture-resistant plywood subfloor', ['12 mm', '15 mm', '18 mm'], 'ván ép lót'),
      o('glue', 'Keo dán sàn chuyên dụng (vinyl / gỗ / thảm)', 'Specialist flooring adhesive (vinyl / timber / carpet)', undefined, 'keo dán sàn'),
      o('acoustic', 'Lớp lót cách âm (cao su / foam)', 'Acoustic underlay (rubber / foam)', ['3 mm', '5 mm'], 'lót cách âm'),
      o('primer', 'Sơn lót / primer nền (epoxy, bê tông)', 'Substrate primer (epoxy / concrete)', undefined, 'lót nền'),
    ] },
    { k: 'finish', vn: 'Lớp hoàn thiện sàn', en: 'Floor finish', opts: [
      o('tile', 'Gạch lát (ceramic / porcelain), chà ron', 'Floor tile (ceramic / porcelain), grouted', ['ron 2 mm', 'ron 3 mm', 'ron 5 mm'], 'gạch lát'),
      o('stone', 'Đá tự nhiên lát vữa, mài/đánh bóng, chống thấm bề mặt (sealer)', 'Natural stone laid in mortar, honed / polished, sealer applied', ['20 mm', '30 mm'], 'đá tự nhiên'),
      o('solid', 'Sàn gỗ tự nhiên (đặc), phủ PU/dầu', 'Solid timber flooring, PU / oil finish', ['15 mm', '18 mm', '20 mm'], 'sàn gỗ tự nhiên'),
      o('eng', 'Sàn gỗ kỹ thuật (engineered, lớp mặt gỗ thật)', 'Engineered timber flooring (real-wood wear layer)', ['12 mm', '14 mm', '15 mm'], 'sàn gỗ kỹ thuật'),
      o('lam', 'Sàn gỗ công nghiệp (laminate HDF), khóa hèm', 'Laminate (HDF) flooring, click-lock', ['8 mm', '10 mm', '12 mm'], 'sàn gỗ công nghiệp'),
      o('spc', 'Sàn nhựa SPC khóa hèm', 'SPC rigid-core vinyl, click-lock', ['4 mm', '5 mm', '6 mm'], 'sàn SPC'),
      o('lvt', 'Sàn nhựa vinyl LVT dán keo', 'Glue-down luxury vinyl tile (LVT)', ['2 mm', '3 mm'], 'sàn LVT'),
      o('carpetT', 'Thảm tấm (carpet tile) dán keo', 'Carpet tiles, adhesive fixed', undefined, 'thảm tấm'),
      o('broadloom', 'Thảm trải kín (broadloom) trên lớp lót thảm', 'Broadloom carpet over carpet underlay', undefined, 'thảm trải kín'),
      o('epoxy', 'Sàn epoxy tự san phẳng', 'Self-levelling epoxy floor', ['2 mm', '3 mm'], 'sàn epoxy'),
      o('polished', 'Bê tông mài, tăng cứng bề mặt (lithium silicate)', 'Ground concrete, hardened (lithium silicate densifier)', undefined, 'bê tông mài'),
      o('terrazzo', 'Terrazzo (đúc tại chỗ / tấm đúc sẵn)', 'Terrazzo (cast-in-place / precast tiles)', undefined, 'terrazzo'),
      o('rubber', 'Sàn cao su / vinyl cuộn', 'Rubber / sheet vinyl flooring', undefined, 'sàn cao su'),
    ] },
    { k: 'extra', vn: 'Phụ kiện sàn', en: 'Floor accessories', multi: true, opts: [
      o('skirting', 'Len chân tường', 'Skirting', ['gỗ', 'nhựa/PVC', 'đá', 'inox', 'nhôm'], 'len chân tường'),
      o('joint', 'Khe co giãn / thanh nẹp chuyển tiếp giữa hai loại sàn', 'Expansion joint / transition strip between floor types', undefined, 'nẹp chuyển tiếp'),
      o('antislip', 'Xử lý chống trượt (bề mặt nhám / băng keo chống trượt bậc)', 'Anti-slip treatment (textured surface / stair nosing strip)', undefined, 'chống trượt'),
    ] },
  ],
}


// ───── Thảm (cuộn / tấm / thanh / rời) – chọn theo loại không gian; họa tiết in theo thiết kế riêng, thông số kỹ thuật chọn ở đây ─────
// Số liệu mang tính THAM KHẢO theo thông lệ khách sạn – văn phòng (phân cấp sử dụng EN 1307, thử ISO/EN, nhãn CRI Green Label Plus…); chốt theo catalogue nhà cung cấp.
const CARPET: System = {
  k: 'carpet', vn: 'Thảm', en: 'Carpet',
  layers: [
    { k: 'fmt', vn: 'Dạng thảm', en: 'Carpet format', hint: 'quyết định nhóm mã: cuộn = CPT, tấm/thanh = CTL, rời = RUG', opts: [
      o('roll', 'Thảm cuộn trải kín (broadloom), khổ 4 m / 3,66 m', 'Broadloom carpet, roll width 4 m / 3.66 m', undefined, 'thảm cuộn', ['Trải liền theo mặt bằng, cắt ghép mối nối; hao hụt cắt khoảng 8–12%', 'Seamed on site; allow approx. 8–12% cutting waste'], 'Hợp phòng lớn, hành lang dài, sảnh tiệc; đẹp, liền mạch, in hoa văn tự do'),
      o('tile', 'Thảm tấm (carpet tile)', 'Carpet tile', ['500×500 mm', '600×600 mm'], 'thảm tấm', ['Dễ thay từng tấm khi bẩn/hỏng, đi hệ thống sàn nâng/dây điện', 'Single tiles replaceable; suits raised floors / cabling'], 'Hợp văn phòng, nhà ăn, lối đi đông – dễ bảo trì, ít hao hụt'),
      o('plank', 'Thảm thanh (carpet plank)', 'Carpet plank', ['250×1000 mm', '500×1000 mm'], 'thảm thanh', undefined, 'Hợp văn phòng/khu công cộng muốn lát kiểu ván gỗ'),
      o('rug', 'Thảm rời / thảm trải theo kích thước (area rug), đế chống trượt', 'Area rug cut to size, non-slip backing', undefined, 'thảm rời', undefined, 'Thảm trang trí đặt lên sàn, không dán'),
    ] },
    { k: 'cons', vn: 'Cấu trúc bề mặt sợi', en: 'Pile construction', opts: [
      o('tcut', 'Tufted, sợi cắt (cut pile)', 'Tufted, cut pile', undefined, 'tufted sợi cắt', undefined, 'Bề mặt mịn, in họa tiết rõ nét; hợp phòng ngủ, hành lang, sảnh tiệc'),
      o('tloop', 'Tufted, sợi vòng (loop pile)', 'Tufted, loop pile', undefined, 'tufted sợi vòng', undefined, 'Bền nhất, chịu xe đẩy/ghế xoay, ít lộ vết đi – hợp văn phòng, nhà ăn, nơi đông người'),
      o('tcl', 'Tufted, cắt – vòng kết hợp (cut & loop)', 'Tufted, cut & loop', undefined, 'tufted cắt-vòng', undefined, 'Tạo vân nổi, giấu bụi, hợp hành lang và khu công cộng'),
      o('axm', 'Dệt Axminster (nhiều màu, hoa văn phức tạp)', 'Woven Axminster (multi-colour, complex pattern)', undefined, 'Axminster', undefined, 'Cao cấp: sảnh tiệc, nhà hàng sang, khách sạn 5 sao; giá cao, thời gian sản xuất lâu'),
      o('wilton', 'Dệt Wilton', 'Woven Wilton', undefined, 'Wilton', undefined, 'Bền, nét họa tiết hình học; hợp sảnh và hành lang cao cấp'),
      o('needle', 'Thảm kim dập (needle-punch, không dệt)', 'Needle-punch (non-woven)', undefined, 'thảm kim dập', undefined, 'Kinh tế, hội trường/sự kiện/triển lãm, nơi cần thay nhanh'),
      o('htuft', 'Hand-tufted (làm thủ công)', 'Hand-tufted', undefined, 'hand-tufted', undefined, 'Thảm rời trang trí theo thiết kế riêng'),
    ] },
    { k: 'fiber', vn: 'Chất liệu sợi', en: 'Pile fibre', opts: [
      o('nylon', 'Sợi nylon 100% (polyamide)', '100% nylon (polyamide) pile', undefined, 'sợi nylon', undefined, 'Lựa chọn thương mại tốt nhất: đàn hồi, bền, phục hồi sợi sau khi giẫm'),
      o('nyrec', 'Nylon tái chế (ECONYL® hoặc tương đương)', 'Recycled nylon (ECONYL® or equal)', undefined, 'nylon tái chế', undefined, 'Như nylon, thêm tiêu chí xanh/bền vững'),
      o('wool80', 'Len 80% + nylon 20%', '80% wool / 20% nylon', undefined, 'len 80/20', undefined, 'Chuẩn Axminster cao cấp: đàn hồi, cách nhiệt, hơi khó bảo trì hơn nylon'),
      o('wool100', 'Len 100%', '100% wool', undefined, 'len 100%', undefined, 'Thảm rời, hand-tufted cao cấp'),
      o('pp', 'Polypropylene (PP)', 'Polypropylene (PP)', undefined, 'sợi PP', undefined, 'Kinh tế, chống ố tốt, dễ lau; kém đàn hồi, dễ bẹp ở nơi đông người'),
      o('pet', 'Polyester (PET)', 'Polyester (PET)', undefined, 'sợi PET', undefined, 'Mềm, màu rực; kém đàn hồi hơn nylon'),
    ] },
    { k: 'dye', vn: 'Phương pháp tạo màu – họa tiết', en: 'Colouration / pattern', opts: [
      o('printed', 'In họa tiết theo thiết kế (in kỹ thuật số / in chuyển) trên sợi nylon', 'Printed pattern to design (digital / transfer print)', undefined, 'in họa tiết', ['Màu in theo file thiết kế; duyệt mẫu in (strike-off) trước khi sản xuất hàng loạt', 'Colours printed to design file; strike-off approval before bulk production'], 'Họa tiết theo thiết kế riêng, số lượng vừa phải'),
      o('solution', 'Nhuộm nguyên liệu (solution-dyed)', 'Solution-dyed yarn', undefined, 'nhuộm nguyên liệu', undefined, 'Bền màu nhất, chịu chất tẩy, ánh sáng – hợp nhà ăn, sảnh, khu vực nắng'),
      o('yarn', 'Nhuộm sợi (yarn-dyed)', 'Yarn-dyed', undefined, 'nhuộm sợi', undefined, 'Nhiều màu sắc, hợp tufted họa tiết đơn giản'),
      o('piece', 'Nhuộm cuộn (piece-dyed), màu trơn', 'Piece-dyed, plain colour', undefined, 'nhuộm cuộn', undefined, 'Màu trơn, kinh tế'),
      o('woven', 'Họa tiết dệt trực tiếp (Axminster / Wilton)', 'Woven pattern (Axminster / Wilton)', undefined, 'họa tiết dệt', undefined, 'Axminster tối đa khoảng 32 màu'),
    ] },
    { k: 'pw', vn: 'Khối lượng sợi (pile weight)', en: 'Pile weight', opts: [
      o('pw1', 'Khối lượng sợi 600–800 g/m²', 'Pile weight 600–800 g/m²', ['600 g/m²', '700 g/m²', '800 g/m²'], 'sợi 600–800 g/m²', undefined, 'Nhẹ: văn phòng, phòng họp, khu ít đi lại'),
      o('pw2', 'Khối lượng sợi 900–1100 g/m²', 'Pile weight 900–1100 g/m²', ['900 g/m²', '1000 g/m²', '1100 g/m²'], 'sợi 900–1100 g/m²', undefined, 'Trung bình: phòng ngủ khách sạn, nhà hàng, hành lang vừa'),
      o('pw3', 'Khối lượng sợi 1200–1400 g/m²', 'Pile weight 1200–1400 g/m²', ['1200 g/m² (35.4 oz/yd²)', '1300 g/m²', '1400 g/m²'], 'sợi 1200–1400 g/m²', undefined, 'Nặng: hành lang khách sạn, sảnh, phòng tiệc'),
      o('pw4', 'Khối lượng sợi 1500–2000 g/m²', 'Pile weight 1500–2000 g/m²', ['1500 g/m²', '1700 g/m²', '2000 g/m²'], 'sợi 1500–2000 g/m²', undefined, 'Cao cấp: sảnh chính, ballroom, Axminster'),
    ] },
    { k: 'ph', vn: 'Chiều cao sợi (pile height)', en: 'Pile height', opts: [
      o('ph1', 'Chiều cao sợi 3–4 mm', 'Pile height 3–4 mm', ['3 mm', '3.5 mm', '4 mm'], 'sợi 3–4 mm', undefined, 'Thấp: xe đẩy, ghế xoay, lối đi đông – văn phòng, nhà ăn'),
      o('ph2', 'Chiều cao sợi 5–7 mm', 'Pile height 5–7 mm', ['5 mm', '6 mm', '7 ± 0.5 mm'], 'sợi 5–7 mm', undefined, 'Trung bình: hành lang, sảnh, phòng tiệc'),
      o('ph3', 'Chiều cao sợi 8–10 mm', 'Pile height 8–10 mm', ['8 mm', '9 mm', '10 mm'], 'sợi 8–10 mm', undefined, 'Cao, êm: phòng ngủ, thảm rời; không hợp xe đẩy, ghế xoay'),
    ] },
    { k: 'th', vn: 'Tổng chiều dày thảm (cả đế)', en: 'Total thickness', opts: [
      o('th1', 'Tổng chiều dày 6–7 mm', 'Total thickness 6–7 mm', ['6 mm', '6.5 mm', '7 mm'], undefined, undefined, 'Thảm tấm văn phòng'),
      o('th2', 'Tổng chiều dày 8–9 mm', 'Total thickness 8–9 mm', ['8 ± 0.5 mm', '8.5 ± 0.5 mm', '9 mm'], undefined, undefined, 'Thảm cuộn khách sạn'),
      o('th3', 'Tổng chiều dày 10–14 mm (kể cả đế đệm)', 'Total thickness 10–14 mm (incl. cushion backing)', ['10 mm', '12 mm', '14 mm'], undefined, undefined, 'Thảm có đệm liền, phòng ngủ/ballroom'),
    ] },
    { k: 'gauge', vn: 'Gauge và mật độ mũi tuft', en: 'Gauge & stitch density', when: s => !has(s, 'cons', 'axm') && !has(s, 'cons', 'wilton') && !has(s, 'cons', 'needle'), opts: [
      o('g8', 'Gauge 1/8 inch', 'Gauge 1/8 inch', ['26 stitches/10 cm', '30 stitches/10 cm'], 'gauge 1/8', undefined, 'Sợi thô, kinh tế'),
      o('g10', 'Gauge 1/10 inch', 'Gauge 1/10 inch', ['35 stitches/10 cm', '37 stitches/10 cm', '40 stitches/10 cm'], 'gauge 1/10', undefined, 'Phổ biến thương mại, in họa tiết rõ'),
      o('g12', 'Gauge 5/64 inch (mật độ cao)', 'Gauge 5/64 inch (high density)', ['42 stitches/10 cm', '46 stitches/10 cm'], 'gauge 5/64', undefined, 'Cao cấp, sợi mịn dày, bền hơn'),
    ] },
    { k: 'pback', vn: 'Đế chính (primary backing)', en: 'Primary backing', opts: [
      o('ppw', 'Đế chính polypropylene dệt (PP)', 'Woven polypropylene (PP) primary backing', undefined, undefined, undefined, 'Thảm cuộn thông dụng'),
      o('ppn', 'Đế chính polyester / PP không dệt', 'Non-woven polyester / PP primary backing', undefined, undefined, undefined, 'Thảm tấm'),
    ] },
    { k: 'sback', vn: 'Đế phụ (secondary backing)', en: 'Secondary backing', opts: [
      o('action', 'Đế phụ Action back (PP dệt + latex)', 'Action back (woven PP + latex) secondary backing', undefined, undefined, undefined, 'Thảm cuộn thông dụng, dán keo hoặc căng khung'),
      o('latex', 'Đế phụ latex SBR + vải jute / PP', 'SBR latex with jute / PP secondary backing', undefined, undefined, undefined, 'Thảm cuộn trải trên đệm lót rời'),
      o('foam', 'Đế đệm PU foam liền (cushion back) 5–8 mm', 'Attached PU foam cushion back, 5–8 mm', ['5 mm', '6 mm', '8 mm'], undefined, ['Êm chân, giảm ồn va đập, không cần lót thảm riêng', 'Comfort underfoot, impact-sound reduction; no separate underlay'], 'Khách sạn, phòng ngủ, phòng tiệc'),
      o('bitumen', 'Đế bitumen (thảm tấm)', 'Bitumen-backed (tile)', undefined, undefined, undefined, 'Thảm tấm văn phòng/nhà ăn: nặng, ổn định kích thước, chống ẩm tốt'),
      o('pvcfree', 'Đế PET / không PVC (thảm tấm xanh)', 'PET / PVC-free tile backing', undefined, undefined, undefined, 'Thảm tấm bền vững, tái chế được'),
      o('nonslip', 'Đế chống trượt (cao su / latex)', 'Non-slip backing (rubber / latex)', undefined, undefined, undefined, 'Thảm rời'),
    ] },
    { k: 'use', vn: 'Cấp sử dụng (EN 1307)', en: 'Use class (EN 1307)', hint: 'cấp càng cao càng bền, chịu lưu lượng người đi lại', opts: [
      o('c31', 'Cấp 31 – thương mại mức vừa', 'Use class 31 – moderate commercial', undefined, 'cấp 31', undefined, 'Phòng ngủ khách sạn, văn phòng nhỏ, phòng họp'),
      o('c32', 'Cấp 32 – thương mại thông thường', 'Use class 32 – general commercial', undefined, 'cấp 32', undefined, 'Văn phòng, hành lang vừa, nhà hàng nhỏ'),
      o('c33', 'Cấp 33 – thương mại nặng', 'Use class 33 – heavy commercial', undefined, 'cấp 33', undefined, 'Sảnh, hành lang chính, ballroom, nhà ăn, nơi công cộng đông người (khuyến nghị cho khu công cộng)'),
      o('c34', 'Cấp 34 – thương mại rất nặng (nếu nhà sản xuất có chứng nhận)', 'Use class 34 – very heavy commercial (if certified by manufacturer)', undefined, 'cấp 34', undefined, 'Lối đi cực đông (sân bay, trung tâm thương mại)'),
    ] },
    { k: 'fire', vn: 'Phản ứng với lửa', en: 'Reaction to fire', opts: [
      o('bfl', 'Bfl-s1 (EN 13501-1)', 'Bfl-s1 (EN 13501-1)', undefined, undefined, ['Đạt phân loại cháy sàn Bfl-s1; hồ sơ thử kèm theo', 'Floor fire classification Bfl-s1; test report submitted'], 'Khuyến nghị cho hành lang, lối thoát nạn, khu công cộng'),
      o('cfl', 'Cfl-s1 (EN 13501-1)', 'Cfl-s1 (EN 13501-1)', undefined, undefined, undefined, 'Phòng thông thường'),
      o('gb', 'B-s1,t0 (GB 8624 – nhóm B1, theo catalogue nhà sản xuất)', 'B-s1,t0 (GB 8624 class B1, per manufacturer data)', undefined, undefined, undefined, 'Thảm nhập từ Trung Quốc – cần đối chiếu sang EN/QCVN khi nộp hồ sơ'),
      o('astm', 'ASTM E648 Class I + ASTM E662 (khói)', 'ASTM E648 Class I + ASTM E662 (smoke)', undefined, undefined, undefined, 'Hồ sơ theo tiêu chuẩn Mỹ (khách sạn quốc tế)'),
      o('qcvn', 'Nhóm cháy vật liệu hoàn thiện theo QCVN 06:2022/BXD', 'Reaction to fire per QCVN 06:2022/BXD', undefined, undefined, ['Chủ đầu tư/tư vấn PCCC xác nhận nhóm cháy cho khu vực thoát nạn', 'Fire-safety consultant to confirm class for escape routes'], 'Bắt buộc đối chiếu cho công trình tại Việt Nam'),
    ] },
    { k: 'anti', vn: 'Tĩnh điện và chống trượt', en: 'Static & slip', multi: true, opts: [
      o('st2', 'Tĩnh điện ≤ 2 kV (EN 1815 / ISO 6356)', 'Static propensity ≤ 2 kV (EN 1815 / ISO 6356)', undefined, undefined, undefined, 'Văn phòng, phòng máy, y tế, khu nhiều thiết bị điện tử'),
      o('st3', 'Tĩnh điện ≤ 3 kV (EN 1815 / ISO 6356)', 'Static propensity ≤ 3 kV (EN 1815 / ISO 6356)', undefined, undefined, undefined, 'Khách sạn, nhà hàng, khu thương mại thông thường'),
      o('en14041', 'Tĩnh điện, trượt và các đặc tính khác theo EN 14041 (nhà sản xuất công bố)', 'Static, slip resistance and other characteristics per EN 14041 (manufacturer declared)', undefined, undefined, undefined, 'Theo bảng thông số của nhà cung cấp'),
      o('slip', 'Chống trượt: hệ số ma sát ≥ 0,30 (EN 13893) hoặc R9 (DIN 51130)', 'Slip resistance: dynamic friction ≥ 0.30 (EN 13893) or R9 (DIN 51130)', undefined, undefined, undefined, 'Lối đi, sảnh, khu vực có thể ẩm'),
    ] },
    { k: 'test', vn: 'Thử nghiệm độ bền', en: 'Durability testing', multi: true, opts: [
      o('app', 'Giữ vẻ ngoài sau lưu thông (trống Vettermann / hexapod, ISO 10361)', 'Appearance retention (Vettermann drum / hexapod, ISO 10361)', undefined, undefined, undefined, 'Căn cứ xếp cấp EN 1307'),
      o('castor', 'Phù hợp ghế bánh xe (castor chair, ISO 4918)', 'Suitable for castor chairs (ISO 4918)', undefined, undefined, undefined, 'Văn phòng, phòng họp, nhà ăn'),
      o('light', 'Độ bền màu với ánh sáng ≥ 5 (ISO 105-B02)', 'Colour fastness to light ≥ 5 (ISO 105-B02)', undefined, undefined, undefined, 'Khu có nắng rọi'),
    ] },
    { k: 'iaq', vn: 'Chất lượng không khí – nhãn xanh', en: 'Indoor air quality / eco-label', multi: true, opts: [
      o('crigl', 'CRI Green Label Plus', 'CRI Green Label Plus', undefined, undefined, undefined, 'Phát thải VOC thấp, nhãn phổ biến khách sạn'),
      o('floorscore', 'FloorScore®', 'FloorScore®', undefined, undefined, undefined, 'Theo LEED / WELL'),
      o('gut', 'GUT / Oeko-Tex Standard 100', 'GUT / Oeko-Tex Standard 100', undefined, undefined, undefined, 'Nhãn châu Âu'),
    ] },
    { k: 'treat', vn: 'Xử lý bề mặt – tính năng', en: 'Treatments & performance', multi: true, opts: [
      o('stain', 'Xử lý chống bẩn, chống ố (soil & stain resist, không PFAS nếu có thể)', 'Soil & stain resistant treatment (PFAS-free where available)', undefined, undefined, undefined, 'Nhà ăn, nhà hàng, sảnh'),
      o('anti', 'Kháng khuẩn / chống nấm mốc', 'Antimicrobial / anti-mould', undefined, undefined, undefined, 'Khu ẩm, y tế'),
      o('acoustic', 'Cách âm va đập: ΔLw theo thiết kế (ISO 10140-3), kèm đệm', 'Impact-sound improvement ΔLw per design (ISO 10140-3), with underlay', undefined, undefined, undefined, 'Giữa các tầng khách sạn, văn phòng'),
      o('clean', 'Giặt hút bụi, làm sạch bằng phun hút; bảo hành mài mòn theo nhà sản xuất', 'Vacuum and hot-water-extraction cleanable; wear warranty per manufacturer', undefined, undefined, undefined, 'Quy trình bảo trì'),
    ] },
    { k: 'inst', vn: 'Cách lắp đặt', en: 'Installation', opts: [
      o('glue', 'Dán keo toàn bộ (glue-down) lên nền đã cán phẳng, đạt độ ẩm', 'Fully adhered (glue-down) on levelled, dry substrate', undefined, 'dán keo', undefined, 'Thảm tấm và thảm cuộn có đế đệm liền'),
      o('stretch', 'Căng khung (stretch-in, thanh gai tackless) trên lớp lót thảm', 'Stretch-in over carpet underlay with tackless strips', ['đệm PU 8–10 mm', 'đệm cao su 6–8 mm', 'đệm felt 8 mm'], 'căng khung', undefined, 'Thảm cuộn cao cấp, phòng ngủ, ballroom'),
      o('tile', 'Dán thảm tấm bằng keo thảm tấm (tackifier), có thể thay từng tấm', 'Tiles fixed with releasable tackifier', undefined, 'keo thảm tấm', undefined, 'Văn phòng, nhà ăn'),
      o('loose', 'Đặt rời, có lớp chống trượt', 'Loose-laid with non-slip layer', undefined, 'đặt rời', undefined, 'Thảm rời'),
    ] },
    { k: 'extra', vn: 'Phụ kiện – dự phòng', en: 'Accessories & attic stock', multi: true, opts: [
      o('trans', 'Nẹp chuyển tiếp sang vật liệu sàn khác (inox/đồng/nhôm)', 'Transition strip to adjacent floor finish (SS / brass / aluminium)', undefined, 'nẹp chuyển tiếp'),
      o('skirt', 'Len chân tường', 'Skirting', ['gỗ', 'nhựa/PVC', 'inox', 'nhôm'], 'len chân tường'),
      o('attic', 'Dự phòng 5–10% khối lượng để thay thế sau này (attic stock), cùng lô màu', 'Attic stock 5–10% of area for future repairs, same dye lot', undefined, 'dự phòng 5–10%'),
    ] },
  ],
}

for (const l of CARPET.layers) if (['pw', 'ph', 'th'].includes(l.k)) l.opts.forEach(x => { x.rep = true })   // đã chọn số cụ thể thì thay luôn cho khoảng
export const SYSTEMS: System[] = [WALL, CEILING, FLOOR, CARPET]
export const systemOf = (k: System['k']) => SYSTEMS.find(s => s.k === k)!

/** Đoán loại hệ (tường / trần / sàn) từ nhóm mã + chữ trong mục */
export function guessSystem(e: Pick<Entry, 'group_code' | 'category' | 'name_vn' | 'part_vn' | 'desc_vn'>): System['k'] {
  const g = (e.group_code ?? '').toUpperCase(), t = `${e.name_vn ?? ''} ${e.part_vn ?? ''}`.toLowerCase()
  if (['GWB', 'FGWB', 'MGWB', 'ACT'].includes(g) || e.category === 'ceiling' || /\btrần\b/.test(t)) return 'ceiling'
  if (['CPT', 'CTL', 'RUG'].includes(g) || /\bthảm\b/.test(t)) return 'carpet'
  if (['CT', 'ST', 'ES', 'LVT', 'CPT', 'CTL', 'RUG', 'CONC', 'MCM', 'EPX', 'PUF'].includes(g) || e.category === 'floor' || /\bsàn\b/.test(t)) return 'floor'
  return 'wall'
}

const visible = (sys: System, sel: Sel) => sys.layers.filter(l => !l.when || l.when(sel))

/** Bỏ các lựa chọn của lớp đang bị ẩn (vd bỏ tích "Sơn" thì hệ sơn biến mất) */
export function cleanSel(sys: System, st: BuildState): BuildState {
  const ok = new Set(visible(sys, st.sel).map(l => l.k)), sel: Sel = {}, vars: Record<string, string> = {}
  for (const l of sys.layers) {
    if (!ok.has(l.k)) continue
    const keep = (st.sel[l.k] ?? []).filter(k => l.opts.some(x => x.k === k))
    if (keep.length) sel[l.k] = l.multi ? keep : [keep[0]]
    for (const k of sel[l.k] ?? []) if (st.vars[`${l.k}/${k}`]) vars[`${l.k}/${k}`] = st.vars[`${l.k}/${k}`]
  }
  return { ...st, sel, vars }
}

const VAR_EN: [RegExp, string][] = [[/đệm PU/g, 'PU underlay'], [/đệm cao su/g, 'rubber underlay'], [/đệm felt/g, 'felt underlay'], [/inox/g, 'stainless steel'], [/lớp/g, 'coats'], [/bán bóng/g, 'satin'], [/bóng cao/g, 'high gloss'], [/bóng/g, 'gloss'], [/mờ/g, 'matt'], [/hoàn thiện cao cấp/g, 'premium finish'], [/gỗ/g, 'timber'], [/nhựa\/PVC/g, 'plastic/PVC'], [/đá/g, 'stone'], [/nhôm/g, 'aluminum'], [/Sồi/g, 'Oak'], [/Óc chó/g, 'Walnut'], [/Tần bì/g, 'Ash'], [/Gỗ khác theo mẫu/g, 'Other timber per sample'], [/Thép sơn tĩnh điện/g, 'Powder-coated steel'], [/bông dày/g, 'wool thickness'], [/mút/g, 'foam'], [/ron/g, 'joint']]
const viVar = (v: string) => VAR_EN.reduce((a, [r, t]) => a.replace(r, t), v)
const txt = (l: Layer, op: Opt, st: BuildState, en: boolean) => {
  const v0 = st.vars[`${l.k}/${op.k}`], v = v0 && en ? viVar(v0) : v0
  const base = en ? op.en : op.vn
  return v ? (op.rep ? v : `${base} – ${v}`) : base
}

/** Sinh nội dung: cấu tạo ngắn (cột Cấu tạo) + các dòng thông số kỹ thuật VN/EN – chỉ gồm lớp đã tích */
export function renderBuild(st0: BuildState) {
  const sys = systemOf(st0.sys), st = cleanSel(sys, st0)
  const vn: string[] = [], en: string[] = [], comp: string[] = []
  for (const l of visible(sys, st.sel)) {
    const picked = (st.sel[l.k] ?? []).map(k => l.opts.find(x => x.k === k)!).filter(Boolean)
    if (!picked.length) continue
    vn.push(`${l.vn}: ${picked.map(p => txt(l, p, st, false)).join('; ')}`)
    en.push(`${l.en}: ${picked.map(p => txt(l, p, st, true)).join('; ')}`)
    for (const p of picked) {
      const v = st.vars[`${l.k}/${p.k}`]
      const generic = p.k === 'none' || (l.k === 'finish' && p.k === 'paint')   // "không cốt", "sơn" chung chung: để dòng sơn phủ nói rõ
      if (['base', 'core', 'finish', 'frame', 'top', 'type', 'fmt', 'cons', 'fiber'].includes(l.k) && !generic && !(l.k === 'type' || (l.k === 'base' && p.k === 'masonry'))) comp.push([p.s ?? p.vn, v].filter(Boolean).join(' '))
      if (p.note) { vn.push('  ' + p.note[0]); en.push('  ' + p.note[1]) }
    }
  }
  const extra = (st.extra ?? '').trim()
  if (extra) vn.push(extra)   // chữ tự viết là tiếng Việt: không chép sang bản EN (tránh lẫn tiếng Việt), dùng nút dịch của phần mềm
  return { vn, en, composition: comp.join(' + '), state: st }
}

/** Mẫu nhanh (thay cho "Vật liệu cơ bản – thông số chuẩn"): chọn sẵn các lớp phổ biến, người làm tích sửa tiếp */
export type Preset = { label: string; sys: System['k']; sel: Sel; vars?: Record<string, string> }
export const PRESETS: Preset[] = [
  { label: 'Trần thạch cao tiêu chuẩn – khung chìm, sơn', sys: 'ceiling', sel: { type: ['flat'], frame: ['conc'], core: ['gyp'], finish: ['paint'], prep: ['joint', 'skim'], primer: ['gypPrimer'], top: ['matt'] }, vars: { 'frame/conc': 'C600', 'core/gyp': '9 mm', 'prep/skim': '2 lớp', 'top/matt': '2 lớp' } },
  { label: 'Trần thạch cao siêu chịu ẩm – khung chìm, sơn chống nấm mốc', sys: 'ceiling', sel: { type: ['flat'], frame: ['conc'], core: ['gypM'], finish: ['paint'], prep: ['joint', 'skim'], primer: ['gypPrimer'], top: ['mould'] }, vars: { 'frame/conc': 'C600', 'core/gypM': '9 mm' } },
  { label: 'Trần thạch cao chống cháy – khung chìm, sơn', sys: 'ceiling', sel: { type: ['flat'], frame: ['conc'], core: ['gypF'], finish: ['paint'], prep: ['joint', 'skim'], primer: ['gypPrimer'], top: ['matt'] }, vars: { 'frame/conc': 'C600', 'core/gypF': '12,5 mm' } },
  { label: 'Trần thả khung nổi T-bar – tấm 600×600', sys: 'ceiling', sel: { type: ['tbar'], frame: ['expo'], core: ['mineral'], finish: ['factory'] } },
  { label: 'Vách thạch cao khung C – bả, sơn', sys: 'wall', sel: { base: ['cstud'], core: ['gyp'], finish: ['paint'], fix: ['screw'], prep: ['joint', 'skim'], primer: ['gypPrimer'], top: ['matt'] }, vars: { 'base/cstud': 'C75', 'core/gyp': '12,5 mm' } },
  { label: 'Tường xây trát – bả, sơn nước', sys: 'wall', sel: { base: ['masonry'], core: ['none'], finish: ['paint'], prep: ['crack', 'skim'], primer: ['alk'], top: ['matt'] }, vars: { 'prep/skim': '2 lớp', 'primer/alk': '1 lớp', 'top/matt': '2 lớp' } },
  { label: 'Ốp tường MDF chống ẩm phủ melamine, khung thép hộp', sys: 'wall', sel: { base: ['steel'], core: ['mdfM'], finish: ['melamine'], fix: ['screw', 'trim'] }, vars: { 'core/mdfM': '17 mm' } },
  { label: 'Ốp tường MDF phủ veneer, khung thép hộp', sys: 'wall', sel: { base: ['steel'], core: ['mdfM'], finish: ['veneer'], fix: ['screw', 'trim'] }, vars: { 'core/mdfM': '17 mm' } },
  { label: 'Ốp tường lam sóng MDF sơn PU', sys: 'wall', sel: { base: ['steel'], core: ['wave'], finish: ['paint'], fix: ['glue', 'nail'], prep: ['sandMdf'], primer: ['pu'], top: ['pu2k'] }, vars: { 'core/wave': '15 mm', 'top/pu2k': 'mờ' } },
  { label: 'Ốp tường tiêu âm: khung, bông, vải bọc', sys: 'wall', sel: { base: ['timber'], core: ['mdf'], finish: ['acoustic'], extra: ['rockwool'] }, vars: { 'core/mdf': '12 mm', 'finish/acoustic': 'bông dày 25 mm' } },
  { label: 'Sàn gỗ công nghiệp HDF khóa hèm', sys: 'floor', sel: { base: ['screed'], under: ['foam'], finish: ['lam'], extra: ['skirting'] }, vars: { 'finish/lam': '12 mm' } },
  { label: 'Sàn gỗ kỹ thuật (engineered)', sys: 'floor', sel: { base: ['screed'], under: ['foam'], finish: ['eng'], extra: ['skirting'] } },
  { label: 'Sàn SPC khóa hèm', sys: 'floor', sel: { base: ['screed'], under: ['foam'], finish: ['spc'], extra: ['skirting'] }, vars: { 'finish/spc': '5 mm' } },
  { label: 'Sàn gạch porcelain – khu ướt có chống thấm', sys: 'floor', sel: { base: ['screed'], wp: ['cem'], under: ['tileglue'], finish: ['tile'] } },
  // ── Thảm theo loại không gian ──
  { label: 'Thảm – theo file nhà cung cấp NYS1200 (in nylon cut pile 1200 g/m², sợi 7 mm)', sys: 'carpet', sel: { fmt: ['roll'], cons: ['tcut'], fiber: ['nylon'], dye: ['printed'], pw: ['pw3'], ph: ['ph2'], th: ['th2'], gauge: ['g10'], pback: ['ppw'], sback: ['action'], fire: ['gb'], anti: ['en14041'], iaq: ['crigl'], inst: ['glue'] }, vars: { 'pw/pw3': '1200 g/m² (35.4 oz/yd²)', 'ph/ph2': '7 ± 0.5 mm', 'th/th2': '8.5 ± 0.5 mm', 'gauge/g10': '37 stitches/10 cm' } },
  { label: 'Thảm hành lang khách sạn – cuộn tufted in họa tiết (cấp 33)', sys: 'carpet', sel: { fmt: ['roll'], cons: ['tcut'], fiber: ['nylon'], dye: ['printed'], pw: ['pw3'], ph: ['ph2'], th: ['th2'], gauge: ['g10'], pback: ['ppw'], sback: ['action'], use: ['c33'], fire: ['bfl', 'qcvn'], anti: ['st3', 'slip'], test: ['app'], iaq: ['crigl'], treat: ['stain'], inst: ['glue'], extra: ['trans', 'skirt', 'attic'] }, vars: { 'pw/pw3': '1200 g/m² (35.4 oz/yd²)', 'ph/ph2': '6 mm', 'gauge/g10': '37 stitches/10 cm' } },
  { label: 'Thảm phòng ngủ khách sạn / biệt thự – cuộn tufted + đệm (cấp 32)', sys: 'carpet', sel: { fmt: ['roll'], cons: ['tcut'], fiber: ['nylon'], dye: ['printed'], pw: ['pw2'], ph: ['ph2'], th: ['th3'], gauge: ['g10'], pback: ['ppw'], sback: ['foam'], use: ['c32'], fire: ['cfl', 'qcvn'], anti: ['st3'], iaq: ['crigl'], treat: ['acoustic'], inst: ['stretch'], extra: ['trans', 'skirt', 'attic'] }, vars: { 'pw/pw2': '1100 g/m²', 'ph/ph2': '7 ± 0.5 mm', 'th/th3': '10 mm', 'sback/foam': '6 mm', 'inst/stretch': 'đệm PU 8–10 mm' } },
  { label: 'Thảm sảnh tiệc / ballroom / phòng hội nghị – Axminster len 80/20 (cấp 33)', sys: 'carpet', sel: { fmt: ['roll'], cons: ['axm'], fiber: ['wool80'], dye: ['woven'], pw: ['pw4'], ph: ['ph2'], th: ['th3'], pback: ['ppw'], sback: ['latex'], use: ['c33'], fire: ['bfl', 'qcvn'], anti: ['st3'], test: ['app'], iaq: ['gut'], treat: ['acoustic'], inst: ['stretch'], extra: ['trans', 'skirt', 'attic'] }, vars: { 'pw/pw4': '1700 g/m²', 'ph/ph2': '7 ± 0.5 mm', 'th/th3': '10 mm', 'inst/stretch': 'đệm PU 8–10 mm' } },
  { label: 'Thảm sảnh – lối đi đông, công cộng, trường học, thư viện – thảm tấm sợi vòng (cấp 33)', sys: 'carpet', sel: { fmt: ['tile'], cons: ['tloop'], fiber: ['nylon'], dye: ['solution'], pw: ['pw2'], ph: ['ph1'], th: ['th1'], gauge: ['g10'], pback: ['ppn'], sback: ['bitumen'], use: ['c33'], fire: ['bfl', 'qcvn'], anti: ['st2', 'slip'], test: ['app', 'castor'], iaq: ['crigl'], treat: ['stain'], inst: ['tile'], extra: ['trans', 'attic'] }, vars: { 'fmt/tile': '500×500 mm', 'pw/pw2': '1000 g/m²', 'ph/ph1': '3.5 mm', 'th/th1': '6.5 mm', 'gauge/g10': '40 stitches/10 cm' } },
  { label: 'Thảm văn phòng – thảm tấm sợi vòng 500×500 (cấp 32–33)', sys: 'carpet', sel: { fmt: ['tile'], cons: ['tloop'], fiber: ['nylon'], dye: ['solution'], pw: ['pw1'], ph: ['ph1'], th: ['th1'], gauge: ['g10'], pback: ['ppn'], sback: ['pvcfree'], use: ['c33'], fire: ['bfl', 'qcvn'], anti: ['st2'], test: ['app', 'castor'], iaq: ['crigl', 'floorscore'], treat: ['acoustic'], inst: ['tile'], extra: ['trans', 'attic'] }, vars: { 'fmt/tile': '500×500 mm', 'pw/pw1': '700 g/m²', 'ph/ph1': '3 mm', 'th/th1': '6.5 mm', 'gauge/g10': '37 stitches/10 cm' } },
  { label: 'Thảm văn phòng – thảm thanh (plank) 250×1000', sys: 'carpet', sel: { fmt: ['plank'], cons: ['tloop'], fiber: ['nylon'], dye: ['solution'], pw: ['pw1'], ph: ['ph1'], th: ['th1'], gauge: ['g10'], pback: ['ppn'], sback: ['pvcfree'], use: ['c33'], fire: ['bfl', 'qcvn'], anti: ['st2'], test: ['app', 'castor'], iaq: ['crigl'], inst: ['tile'], extra: ['trans', 'attic'] }, vars: { 'fmt/plank': '250×1000 mm', 'pw/pw1': '800 g/m²', 'ph/ph1': '3 mm', 'th/th1': '6.5 mm' } },
  { label: 'Thảm nhà ăn / nhà hàng / căng tin – thảm tấm sợi vòng chống ố, đế bitumen', sys: 'carpet', sel: { fmt: ['tile'], cons: ['tloop'], fiber: ['nylon'], dye: ['solution'], pw: ['pw2'], ph: ['ph1'], th: ['th1'], gauge: ['g10'], pback: ['ppn'], sback: ['bitumen'], use: ['c33'], fire: ['bfl', 'qcvn'], anti: ['st3', 'slip'], test: ['app'], iaq: ['crigl'], treat: ['stain', 'clean'], inst: ['tile'], extra: ['trans', 'attic'] }, vars: { 'fmt/tile': '500×500 mm', 'pw/pw2': '900 g/m²', 'ph/ph1': '3.5 mm', 'th/th1': '6.5 mm', 'gauge/g10': '40 stitches/10 cm' } },
  { label: 'Thảm rời trang trí hand-tufted (theo thiết kế)', sys: 'carpet', sel: { fmt: ['rug'], cons: ['htuft'], fiber: ['wool100'], dye: ['yarn'], ph: ['ph3'], sback: ['nonslip'], inst: ['loose'] }, vars: { 'ph/ph3': '9 mm' } },
]

const has2 = (st: BuildState, l: string, k: string) => !!st.sel[l]?.includes(k)
/** Từ cấu tạo đã tích → nhóm mã (null = chưa đủ dữ liệu để phân loại) */
export function groupOfBuild(st0: BuildState): string | null {
  const sys = systemOf(st0.sys), st = cleanSel(sys, st0), h = (l: string, k: string) => has2(st, l, k)
  const fin = st.sel.finish ?? [], core = st.sel.core?.[0], base = st.sel.base?.[0]
  if (st.sys === 'carpet') { const f = (st.sel.fmt ?? [])[0]; return f ? ({ roll: 'CPT', tile: 'CTL', plank: 'CTL', rug: 'RUG' } as Record<string, string>)[f] ?? null : null }
  if (st.sys === 'floor') {
    const f = fin[0]; if (!f) return null
    return ({ tile: 'CT', stone: 'ST', terrazzo: 'ST', engstone: 'ES', solid: 'WD', eng: 'EWD', lam: 'EWD', spc: 'LVT', lvt: 'LVT', carpetT: 'CTL', broadloom: 'CPT' } as Record<string, string>)[f] ?? null
  }
  if (!fin.length || !core) return null
  if (fin.includes('paint') && !(st.sel.top?.length)) return null     // đã chọn sơn thì phải chọn sơn phủ
  const sk = (x: string) => fin.includes(x)
  if (st.sys === 'ceiling') {
    if (h('type', 'tbar') || core === 'mineral') return 'ACT'
    if (['gyp', 'gypM', 'gypF', 'perf'].includes(core)) return core === 'gypM' ? 'MGWB' : core === 'gypF' ? 'FGWB' : 'GWB'
    if (core === 'cement') return 'GWB'
    if (sk('paint') && h('frame', 'none')) return 'PT'
    return 'WP'
  }
  if (sk('wallpaper') || sk('fabricwc')) return 'WC'
  if (sk('stone')) return 'ST'
  if (sk('engstone')) return 'ES'
  if (sk('tile')) return 'CT'
  if (sk('mirror')) return 'MR'
  if (sk('glass')) return 'GL'
  if (sk('metal') || sk('acp')) return 'MT'
  if (sk('paint') && fin.length === 1 && core === 'none' && (base === 'masonry' || base === 'direct')) return 'PT'
  if (sk('wpc')) return 'WPC'
  return 'WP'
}

/** Tên hạng mục + vật liệu sinh từ cấu tạo (chỉ dùng khi nhóm vật liệu bị đổi, để tên cũ không mâu thuẫn) */
function namesOfBuild(st: BuildState) {
  const sys = systemOf(st.sys), pick = (l: string) => (st.sel[l] ?? []).map(k => sys.layers.find(x => x.k === l)?.opts.find(o => o.k === k)).filter(Boolean) as Opt[]
  const fin = pick(st.sys === 'carpet' ? 'fmt' : 'finish'), top = pick('top'), core = pick('core')
  const short = (o: Opt, en: boolean) => (en ? o.en : o.vn).replace(/\s*\(.*$/, '')
  const fv = fin.map(o => o.k === 'paint' && top[0] ? short(top[0], false) : short(o, false)), fe = fin.map(o => o.k === 'paint' && top[0] ? short(top[0], true) : short(o, true))
  const head = (en: boolean) => st.sys === 'carpet' ? '' : (en ? sys.en.split(' / ')[0] : sys.vn.split(' – ')[0])
  const c0 = core.filter(o => o.k !== 'none')[0]
  return {
    name_vn: `${head(false)} ${fv.join(', ')}`.trim(), name_en: `${head(true)} – ${fe.join(', ')}`.trim(),
    material_vn: [...fv, ...(c0 ? ['cốt ' + short(c0, false)] : [])].join('; '), material_en: [...fe, ...(c0 ? ['core: ' + short(c0, true)] : [])].join('; '),
  }
}
/** Gợi ý từ tên/mô tả sẵn có của mã (vd "giật cấp", "khe hắt đèn") để mẫu nhanh không ghi đè thành kiểu khác */
export function hintsOf(e: Pick<Entry, 'name_vn' | 'desc_vn' | 'part_vn'>, sys: System['k']): Sel {
  const t = `${e.name_vn ?? ''} ${e.desc_vn ?? ''} ${e.part_vn ?? ''}`.toLowerCase(), h: Sel = {}
  if (sys === 'ceiling') {
    if (/giật cấp|hộc đèn|khe hắt|hắt đèn/.test(t)) h.type = ['drop']
    else if (/cong|lượn|sóng/.test(t)) h.type = ['curve']
    else if (/trần thả|t-bar|tbar/.test(t)) h.type = ['tbar']
    else if (/lam/.test(t)) h.type = ['slat']
    if (/hắt đèn|hộc đèn|khe sáng|led/.test(t)) h.extra = ['cove']
  }
  return h
}
const SIZE_VN = /^Kích thước\s*:.*$/im, SIZE_EN = /^Size\s*:.*$/im
/** Ghi vào mục: THAY toàn bộ thông số cũ bằng nội dung sinh từ cấu tạo (giữ riêng dòng "Kích thước" đã chọn từ thư viện) + ô Cấu tạo, lưu lựa chọn, xoá cờ "cần xem lại" */
export async function applyBuild(e0: Entry, st0: BuildState, all: Entry[] = []) {
  const r = renderBuild(st0), grp = groupOfBuild(r.state)
  let e = e0
  const extra: Record<string, unknown> = {}
  // đủ dữ liệu → phần mềm tự biết nhóm vật liệu: đổi nhóm + ký hiệu bản vẽ, hàng tự chuyển về đúng cụm
  if (grp && grp !== e.group_code) { const er = await changeGroup(e, grp, all); if (er) return er; e = { ...e, group_code: grp }; Object.assign(extra, namesOfBuild(r.state)) }
  const keep = (t: string | null | undefined, re: RegExp) => (t ?? '').match(re)?.[0] ?? ''
  const join = (lines: string[], size: string) => [...lines.map(l => (l.startsWith('  ') ? l : '- ' + l)), size].filter(Boolean).join('\n')
  return saveEntry(e, {
    desc_vn: join(r.vn, keep(e.desc_vn, SIZE_VN)) || null,
    desc_en: join(r.en, keep(e.desc_en, SIZE_EN)) || null,
    composition: r.composition || e.composition,
    ...extra,
    build: r.state,
    spec_stale: grp ? null : 'incomplete',   // chưa tích đủ → không đủ dữ liệu phân loại: ô bên ngoài hiện đỏ để người làm bổ sung
  })
}

/** Nhãn loại vật liệu thư viện dùng để báo "đã đổi sang …" */
export const KIND_VN: Record<string, string> = { incomplete: 'cấu tạo chưa đủ để phân loại', paint: 'sơn', wood: 'gỗ', tile: 'gạch', stone: 'đá', floor: 'sàn nhựa/gỗ', sanitary: 'thiết bị vệ sinh', moulding: 'phào chỉ' }
