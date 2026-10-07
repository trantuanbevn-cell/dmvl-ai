// Hệ ký hiệu thống nhất (song ngữ) – nguồn: biểu mẫu DMVL chuẩn
export type Group = { code: string; vn: string; en: string; legacy: string; csi: string; attrs_vn: string; attrs_en: string; std_vn: string; std_intl: string }
export const GROUPS: Group[] = [
 {
  "code": "CT",
  "vn": "Gạch ốp lát (ceramic/porcelain)",
  "en": "Ceramic & Porcelain Tile",
  "legacy": "SG",
  "csi": "09 30 00 Tiling",
  "attrs_vn": "Loại (porcelain/ceramic), kích thước, độ dày, bề mặt (mờ/bóng/nhám), vân, màu, ron (rộng + màu), chống trượt, độ hút nước",
  "attrs_en": "Body type, size, thickness, surface finish, pattern, colour, grout width & colour, slip resistance, water absorption",
  "std_vn": "TCVN 13113:2020 (ISO 13006:2018); TCVN 7745:2007; TCVN 9377-1:2012 (thi công, nghiệm thu)",
  "std_intl": "ISO 13006; ANSI A137.1 / A326.3 (DCOF); DIN 51130 (R-rating)"
 },
 {
  "code": "ST",
  "vn": "Đá tự nhiên",
  "en": "Natural Stone",
  "legacy": "DA",
  "csi": "09 30 00 / 09 60 00",
  "attrs_vn": "Tên đá, nguồn gốc, độ dày, bề mặt (honed/polished/leathered), xử lý cạnh, chống thấm (sealer)",
  "attrs_en": "Stone name, origin, thickness, finish, edge profile, sealer",
  "std_vn": "TCVN 4732 (đá ốp lát tự nhiên) – kiểm tra bản hiện hành",
  "std_intl": "ASTM C503 / C615 / C616; EN 1469"
 },
 {
  "code": "ES",
  "vn": "Đá nhân tạo (quartz, terrazzo, solid surface)",
  "en": "Engineered Stone / Terrazzo / Solid Surface",
  "legacy": "DA",
  "csi": "09 66 00 Terrazzo; 12 36 00 Countertops",
  "attrs_vn": "Thành phần, màu nền + hạt, độ dày, cạnh, khoét chậu, chống ố",
  "attrs_en": "Composition, base & aggregate colour, thickness, edge, cut-outs, stain resistance",
  "std_vn": "—",
  "std_intl": "EN 14617; ANSI Z124.3 (solid surface)"
 },
 {
  "code": "LVT",
  "vn": "Sàn nhựa / sàn vinyl",
  "en": "Luxury Vinyl Tile / Resilient",
  "legacy": "SG",
  "csi": "09 65 00 Resilient Flooring",
  "attrs_vn": "Kích thước, độ dày tổng/lớp mặt, vân, kiểu lắp (dán/hèm), chống cháy",
  "attrs_en": "Size, overall/wear-layer thickness, pattern, installation, fire rating",
  "std_vn": "QCVN 06:2022/BXD (vật liệu đường thoát nạn)",
  "std_intl": "ASTM F1700; ASTM E648 (radiant panel)"
 },
 {
  "code": "CPT",
  "vn": "Thảm",
  "en": "Carpet",
  "legacy": "TH",
  "csi": "09 68 00 Carpeting",
  "attrs_vn": "Loại (tấm/cuộn), sợi, chiều cao/khối lượng sợi, lớp đế, màu, chống cháy",
  "attrs_en": "Construction (tile/broadloom), fibre, pile height/weight, backing, colour, fire rating",
  "std_vn": "QCVN 06:2022/BXD",
  "std_intl": "ASTM E648; ASTM D2859; ISO 9239-1"
 },
 {
  "code": "BS",
  "vn": "Len chân tường",
  "en": "Skirting / Base",
  "legacy": "LEN",
  "csi": "09 65 13",
  "attrs_vn": "Vật liệu, chiều cao, độ dày, màu, chi tiết góc",
  "attrs_en": "Material, height, thickness, colour, corner detail",
  "std_vn": "—",
  "std_intl": "—"
 },
 {
  "code": "PT",
  "vn": "Sơn nước",
  "en": "Paint",
  "legacy": "TS",
  "csi": "09 91 00 Painting",
  "attrs_vn": "Mã màu (hãng + mã atlas), độ bóng (mờ/satin/bóng), hệ sơn (bả, lót, phủ), tính năng (chống nấm mốc, lau chùi)",
  "attrs_en": "Colour (brand + code), sheen, system (filler/primer/finish coats), performance",
  "std_vn": "TCVN 8652:2012 (sơn tường dạng nhũ tương)",
  "std_intl": "ASTM D2486 (scrub); low VOC (LEED/Green Seal)"
 },
 {
  "code": "SP",
  "vn": "Sơn đặc biệt (epoxy, hiệu ứng)",
  "en": "Special Coatings",
  "legacy": "TS-a",
  "csi": "09 96 00 High-Performance Coatings",
  "attrs_vn": "Hệ sơn, độ dày màng, màu, độ bóng",
  "attrs_en": "System, DFT, colour, sheen",
  "std_vn": "—",
  "std_intl": "—"
 },
 {
  "code": "WC",
  "vn": "Giấy / vải dán tường",
  "en": "Wallcovering",
  "legacy": "GA",
  "csi": "09 72 00 Wall Coverings",
  "attrs_vn": "Mã, khổ cuộn, chất liệu (vinyl/ vải/ giấy), trọng lượng, chống cháy, lặp hoa văn",
  "attrs_en": "Pattern code, roll size, type, weight, fire rating, pattern repeat",
  "std_vn": "QCVN 06:2022/BXD",
  "std_intl": "ASTM E84 Class A; EN 13501-1"
 },
 {
  "code": "WP",
  "vn": "Tấm ốp tường (gỗ, lam, tiêu âm, acrylic)",
  "en": "Wall Panelling",
  "legacy": "—",
  "csi": "06 40 00 / 09 84 00",
  "attrs_vn": "Vật liệu, kích thước, độ dày, hệ khung, màu/vân, ron",
  "attrs_en": "Material, size, thickness, substrate, finish, joints",
  "std_vn": "—",
  "std_intl": "—"
 },
 {
  "code": "GWB",
  "vn": "Trần / vách thạch cao",
  "en": "Gypsum Board Ceiling / Partition",
  "legacy": "TR",
  "csi": "09 21 00 / 09 29 00 Gypsum Board",
  "attrs_vn": "Loại tấm (thường/chống ẩm/chống cháy), độ dày, hệ khung (khung chìm/nổi), cao độ, hoàn thiện (sơn mã PT)",
  "attrs_en": "Board type, thickness, suspension system, ceiling height, finish (PT code)",
  "std_vn": "TCVN 8256:2009; TCVN 8257 (phương pháp thử)",
  "std_intl": "ASTM C1396; EN 520"
 },
 {
  "code": "ACT",
  "vn": "Trần tiêu âm / trần đặc biệt",
  "en": "Acoustic & Specialty Ceilings",
  "legacy": "TR",
  "csi": "09 51 00 Acoustical Ceilings",
  "attrs_vn": "Kích thước tấm, cạnh, hệ số NRC, chống ẩm, hệ khung",
  "attrs_en": "Panel size, edge, NRC, humidity resistance, grid",
  "std_vn": "—",
  "std_intl": "ASTM E1264; ISO 354"
 },
 {
  "code": "WD",
  "vn": "Gỗ tự nhiên / veneer",
  "en": "Wood Veneer / Solid Wood",
  "legacy": "GO",
  "csi": "06 40 00 Architectural Woodwork",
  "attrs_vn": "Loài gỗ, kiểu xẻ, cốt, màu sơn/độ bóng, tiêu chuẩn phát thải",
  "attrs_en": "Species, cut, core, stain & sheen, emission class",
  "std_vn": "—",
  "std_intl": "AWI/AWMAC; EN 717-1 (E1)"
 },
 {
  "code": "LM",
  "vn": "Melamine / Laminate / Acrylic",
  "en": "Melamine / HPL / Acrylic Panels",
  "legacy": "GO",
  "csi": "06 41 00 / 12 36 00",
  "attrs_vn": "Hãng + mã màu, bề mặt (mã vân), cốt ván (MDF/MFC/HDF chống ẩm), độ dày, cấp phát thải (E0/E1/E2), nẹp chỉ đồng bộ",
  "attrs_en": "Brand + decor code, texture, core board, thickness, emission class, matching edge-band",
  "std_vn": "—",
  "std_intl": "EN 438 (HPL); EN 14322 (melamine); EN 717-1"
 },
 {
  "code": "MT",
  "vn": "Kim loại",
  "en": "Metal Finishes",
  "legacy": "KL",
  "csi": "05 70 00 Decorative Metal",
  "attrs_vn": "Vật liệu (inox 304/316, nhôm, thép), hoàn thiện (xước HL, gương, PVD, sơn tĩnh điện), màu, độ dày",
  "attrs_en": "Material/grade, finish (No.4 HL, mirror, PVD, powder coat), colour, gauge",
  "std_vn": "—",
  "std_intl": "ASTM A240 (stainless)"
 },
 {
  "code": "GL",
  "vn": "Kính",
  "en": "Glass",
  "legacy": "GL",
  "csi": "08 80 00 Glazing",
  "attrs_vn": "Loại (cường lực/dán/an toàn), độ dày, trong/mờ/phun cát, cạnh, decal",
  "attrs_en": "Type, thickness, clarity/frosting, edge, film",
  "std_vn": "TCVN 7455:2013 (kính tôi nhiệt) – kiểm tra bản hiện hành",
  "std_intl": "EN 12150; ANSI Z97.1"
 },
 {
  "code": "MR",
  "vn": "Gương",
  "en": "Mirror",
  "legacy": "GU",
  "csi": "08 83 00 Mirrors",
  "attrs_vn": "Độ dày, xử lý cạnh, chống mờ (defog), khung, đèn tích hợp",
  "attrs_en": "Thickness, edge, demister, frame, integrated lighting",
  "std_vn": "—",
  "std_intl": "EN 1036"
 },
 {
  "code": "FB",
  "vn": "Vải bọc / vải rèm",
  "en": "Fabric",
  "legacy": "VA",
  "csi": "12 05 13 Fabrics",
  "attrs_vn": "Mã vải, thành phần, khổ, độ bền mài mòn (double rubs), bền màu, chống cháy, COM/COL",
  "attrs_en": "Pattern/colour, content, width, abrasion, colourfastness, flammability, COM/COL",
  "std_vn": "—",
  "std_intl": "ACT Guidelines; Wyzenbeek ASTM D4157; CAL TB117-2013; Martindale EN ISO 12947"
 },
 {
  "code": "LE",
  "vn": "Da / giả da",
  "en": "Leather / Faux Leather",
  "legacy": "VA",
  "csi": "12 05 13",
  "attrs_vn": "Loại (da thật/PU/PVC), độ dày, màu, độ bền, chống cháy",
  "attrs_en": "Type, thickness, colour, abrasion, flammability",
  "std_vn": "—",
  "std_intl": "CAL TB117-2013"
 },
 {
  "code": "DR",
  "vn": "Cửa đi",
  "en": "Doors",
  "legacy": "CU",
  "csi": "08 10 00 Doors & Frames",
  "attrs_vn": "Kiểu mở, kích thước, vật liệu cánh/khung, hoàn thiện (mã LM/PT), chống cháy (EI), cách âm, gioăng",
  "attrs_en": "Operation, size, leaf & frame construction, finish code, fire rating, acoustic rating, seals",
  "std_vn": "QCVN 06:2022/BXD (cửa ngăn cháy)",
  "std_intl": "EN 1634 / UL 10C"
 },
 {
  "code": "HW",
  "vn": "Phụ kiện cửa",
  "en": "Door Hardware",
  "legacy": "CC",
  "csi": "08 71 00 Door Hardware",
  "attrs_vn": "Bộ phụ kiện theo cửa: bản lề, tay gạt, khóa, tay co thủy lực, chặn cửa, gioăng; vật liệu + hoàn thiện",
  "attrs_en": "Hardware set per door: hinges, lever, lock, closer, stop, seals; material + finish",
  "std_vn": "—",
  "std_intl": "EN 1906; EN 1154; ANSI/BHMA"
 },
 {
  "code": "JN",
  "vn": "Đồ liền tường (joinery)",
  "en": "Built-in Joinery / Casework",
  "legacy": "FU",
  "csi": "06 41 00 / 12 30 00 Casework",
  "attrs_vn": "Kích thước, cấu tạo từng bộ phận (thùng/cánh/mặt/đợt/chân) gán mã vật liệu, phụ kiện (mã FH), đèn tích hợp (mã LT)",
  "attrs_en": "Dimensions, component materials (carcass/door/top/shelf/plinth) by code, hardware (FH), integrated lighting (LT)",
  "std_vn": "—",
  "std_intl": "AWI Architectural Woodwork Standards"
 },
 {
  "code": "FH",
  "vn": "Phụ kiện đồ nội thất",
  "en": "Furniture & Joinery Hardware",
  "legacy": "PK",
  "csi": "12 30 00",
  "attrs_vn": "Tay nắm, bản lề, ray, khóa, chân tăng chỉnh, móc treo: hãng, mã, hoàn thiện",
  "attrs_en": "Handles, hinges, runners, locks, levellers, hooks: brand, code, finish",
  "std_vn": "—",
  "std_intl": "EN 15570 / EN 15338"
 },
 {
  "code": "FF",
  "vn": "Đồ rời",
  "en": "Loose Furniture",
  "legacy": "FU",
  "csi": "12 50 00 Furniture",
  "attrs_vn": "Kích thước, khung, bọc (mã FB/LE), hoàn thiện (mã MT/LM/WD), số lượng theo phòng",
  "attrs_en": "Dimensions, frame, upholstery (FB/LE), finishes (MT/LM/WD), quantity per room",
  "std_vn": "—",
  "std_intl": "BIFMA X5.1 / X5.4 (ghế văn phòng, ghế chờ)"
 },
 {
  "code": "LT",
  "vn": "Thiết bị chiếu sáng",
  "en": "Lighting",
  "legacy": "DE",
  "csi": "26 51 00 Interior Lighting",
  "attrs_vn": "Kiểu đèn, công suất, nhiệt độ màu (K), CRI, góc chiếu, IP, kích thước, màu vỏ, dimming",
  "attrs_en": "Type, wattage, CCT, CRI, beam angle, IP, size, housing finish, dimming",
  "std_vn": "TCVN 7114-1:2008 (chiếu sáng nơi làm việc)",
  "std_intl": "EN 12464-1; IEC 60598"
 },
 {
  "code": "SF",
  "vn": "Thiết bị vệ sinh",
  "en": "Sanitary Fixtures & Fittings",
  "legacy": "VS",
  "csi": "22 40 00 Plumbing Fixtures",
  "attrs_vn": "Loại, kích thước, kiểu lắp (âm/đặt bàn/treo), vật liệu, hoàn thiện, lưu lượng",
  "attrs_en": "Type, size, mounting, material, finish, flow rate",
  "std_vn": "—",
  "std_intl": "ASME A112.18.1; EN 817"
 },
 {
  "code": "BA",
  "vn": "Phụ kiện phòng vệ sinh",
  "en": "Washroom Accessories",
  "legacy": "VS",
  "csi": "10 28 00 Toilet Accessories",
  "attrs_vn": "Lô giấy, hộp giấy lau tay, máy sấy, móc áo, xà phòng, thanh vịn: vật liệu, hoàn thiện, kiểu lắp",
  "attrs_en": "Toilet roll holder, towel dispenser, hand dryer, hooks, soap dispenser, grab bars",
  "std_vn": "—",
  "std_intl": "—"
 },
 {
  "code": "EQ",
  "vn": "Thiết bị (điện tử, bếp, chuyên dụng)",
  "en": "Equipment & Appliances",
  "legacy": "TB",
  "csi": "11 00 00 Equipment",
  "attrs_vn": "Hãng, model, kích thước, công suất, nguồn điện, kiểu lắp",
  "attrs_en": "Brand, model, size, power, mounting",
  "std_vn": "—",
  "std_intl": "—"
 },
 {
  "code": "AW",
  "vn": "Tranh / tác phẩm nghệ thuật",
  "en": "Artwork",
  "legacy": "—",
  "csi": "12 05 00",
  "attrs_vn": "Chủ đề, kích thước, chất liệu in/vẽ, khung, kiểu treo, chống cháy",
  "attrs_en": "Subject, size, medium, frame, hanging, fire rating",
  "std_vn": "—",
  "std_intl": "—"
 },
 {
  "code": "DC",
  "vn": "Đồ trang trí (cây, gối, phụ kiện decor)",
  "en": "Decorative Accessories",
  "legacy": "—",
  "csi": "12 40 00",
  "attrs_vn": "Loại, kích thước, chất liệu, màu",
  "attrs_en": "Type, size, material, colour",
  "std_vn": "—",
  "std_intl": "—"
 },
 {
  "code": "WT",
  "vn": "Rèm / màn",
  "en": "Window Treatments",
  "legacy": "RM",
  "csi": "12 20 00 Window Treatments",
  "attrs_vn": "Kiểu (cuốn/ cầu vồng/ vải), vật liệu, độ cản sáng, điều khiển",
  "attrs_en": "Type, fabric, openness/blackout, operation",
  "std_vn": "—",
  "std_intl": "NFPA 701"
 },
 {
  "code": "SN",
  "vn": "Biển báo / signage",
  "en": "Signage",
  "legacy": "BB",
  "csi": "10 14 00 Signage",
  "attrs_vn": "Kích thước, vật liệu, nội dung, kiểu gắn",
  "attrs_en": "Size, material, content, mounting",
  "std_vn": "—",
  "std_intl": "—"
 },
 {
  "code": "ME",
  "vn": "Đầu chờ MEP lộ ra không gian (phối hợp)",
  "en": "MEP Interface Items (coordination)",
  "legacy": "—",
  "csi": "23 / 26 / 21",
  "attrs_vn": "Miệng gió, đầu báo khói, sprinkler, loa, công tắc ổ cắm: chỉ quy định màu/ hoàn thiện mặt nạ và vị trí phối hợp",
  "attrs_en": "Diffusers, detectors, sprinklers, speakers, switches/sockets: finish & coordination only",
  "std_vn": "—",
  "std_intl": "—"
 }
]
export const GROUP_ORDER = GROUPS.map(g => g.code)
export const groupOf = (code: string) => GROUPS.find(g => g.code === code)
export const CATEGORIES: { key: string; vn: string; en: string }[] = [{"key": "floor", "vn": "Sàn", "en": "Floor"}, {"key": "base", "vn": "Len chân tường", "en": "Skirting"}, {"key": "wall", "vn": "Tường", "en": "Walls"}, {"key": "feature_wall", "vn": "Tường nhấn", "en": "Feature wall"}, {"key": "ceiling", "vn": "Trần", "en": "Ceiling"}, {"key": "door", "vn": "Cửa & phụ kiện", "en": "Doors & hardware"}, {"key": "window", "vn": "Cửa sổ, rèm", "en": "Windows & blinds"}, {"key": "joinery", "vn": "Đồ liền tường", "en": "Built-in joinery"}, {"key": "loose", "vn": "Đồ rời", "en": "Loose furniture"}, {"key": "lighting", "vn": "Đèn", "en": "Lighting"}, {"key": "sanitary", "vn": "Thiết bị vệ sinh", "en": "Sanitary"}, {"key": "equipment", "vn": "Thiết bị", "en": "Equipment"}, {"key": "decor", "vn": "Decor, cây, phụ kiện", "en": "Decor"}, {"key": "artwork", "vn": "Tranh, artwork", "en": "Artwork"}, {"key": "mep", "vn": "MEP phối hợp", "en": "MEP interface"}]
export const catLabel = (k?: string | null) => CATEGORIES.find(c => c.key === k)?.vn ?? (k ?? '')
export const ROOM_TYPES: { key: string; vn: string; en: string }[] = [{"key": "office", "vn": "Văn phòng", "en": "Office"}, {"key": "meeting", "vn": "Phòng họp", "en": "Meeting room"}, {"key": "dining", "vn": "Phòng ăn nhân viên / canteen", "en": "Staff dining"}, {"key": "pantry", "vn": "Pantry", "en": "Pantry"}, {"key": "locker_wc", "vn": "Thay đồ / WC / tắm", "en": "Locker / WC"}, {"key": "lounge_training", "vn": "Phòng học, nghỉ nhân viên", "en": "Training / lounge"}, {"key": "corridor", "vn": "Hành lang BOH", "en": "Corridor"}, {"key": "storage", "vn": "Kho, xưởng", "en": "Store / workshop"}, {"key": "clinic", "vn": "Phòng y tế", "en": "Clinic"}, {"key": "other", "vn": "Khác", "en": "Other"}]
export const roomTypeLabel = (k?: string | null) => ROOM_TYPES.find(c => c.key === k)?.vn ?? (k ?? '')
