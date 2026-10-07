// Bộ quy tắc mặc định (có thể sửa trong trang Cài đặt – lưu vào bảng app_settings)
export type CheckItem = { group: string; label: string; category: string; keywords: string[]; req: Record<string, 'required' | 'common' | 'na'> }
export type Rule = { trigger: string; item: string; group: string; reason: string; scope: string; mode: string }
export type Perf = { space: string; surface: string; vn: string; en: string; ref: string }
export const DEFAULT_CHECKLIST: CheckItem[] = [
 {
  "group": "Sàn",
  "label": "Vật liệu sàn / Floor finish",
  "category": "floor",
  "keywords": [],
  "req": {
   "office": "required",
   "meeting": "required",
   "dining": "required",
   "pantry": "required",
   "locker_wc": "required",
   "lounge_training": "required",
   "corridor": "required",
   "storage": "required",
   "clinic": "required"
  }
 },
 {
  "group": "Sàn",
  "label": "Len chân tường / Skirting",
  "category": "base",
  "keywords": [
   "len",
   "skirting",
   "chân tường"
  ],
  "req": {
   "office": "required",
   "meeting": "required",
   "dining": "required",
   "pantry": "required",
   "locker_wc": "required",
   "lounge_training": "required",
   "corridor": "required",
   "storage": "required",
   "clinic": "required"
  }
 },
 {
  "group": "Sàn",
  "label": "Nẹp chuyển vật liệu sàn / Floor transition strip",
  "category": "floor",
  "keywords": [
   "nẹp",
   "transition"
  ],
  "req": {
   "office": "common",
   "meeting": "common",
   "dining": "common",
   "pantry": "common",
   "locker_wc": "required",
   "lounge_training": "common",
   "corridor": "common",
   "storage": "common",
   "clinic": "common"
  }
 },
 {
  "group": "Sàn",
  "label": "Thoát sàn / Floor drain",
  "category": "sanitary",
  "keywords": [
   "thoát sàn",
   "floor drain"
  ],
  "req": {
   "office": "na",
   "meeting": "na",
   "dining": "common",
   "pantry": "common",
   "locker_wc": "required",
   "lounge_training": "na",
   "corridor": "na",
   "storage": "common",
   "clinic": "na"
  }
 },
 {
  "group": "Tường",
  "label": "Vật liệu tường chính / Main wall finish",
  "category": "wall",
  "keywords": [],
  "req": {
   "office": "required",
   "meeting": "required",
   "dining": "required",
   "pantry": "required",
   "locker_wc": "required",
   "lounge_training": "required",
   "corridor": "required",
   "storage": "required",
   "clinic": "required"
  }
 },
 {
  "group": "Tường",
  "label": "Ốp chống bẩn khu ướt (backsplash) / Splashback",
  "category": "wall",
  "keywords": [
   "backsplash",
   "ốp chống bẩn",
   "splash"
  ],
  "req": {
   "office": "na",
   "meeting": "na",
   "dining": "common",
   "pantry": "required",
   "locker_wc": "required",
   "lounge_training": "na",
   "corridor": "na",
   "storage": "common",
   "clinic": "required"
  }
 },
 {
  "group": "Tường",
  "label": "Bảo vệ góc tường, chống va đẩy xe / Corner guards, crash rail",
  "category": "wall",
  "keywords": [
   "bảo vệ góc",
   "tay vịn",
   "corner",
   "crash"
  ],
  "req": {
   "office": "na",
   "meeting": "na",
   "dining": "common",
   "pantry": "na",
   "locker_wc": "na",
   "lounge_training": "common",
   "corridor": "required",
   "storage": "required",
   "clinic": "na"
  }
 },
 {
  "group": "Trần",
  "label": "Vật liệu trần + sơn / Ceiling + paint",
  "category": "ceiling",
  "keywords": [],
  "req": {
   "office": "required",
   "meeting": "required",
   "dining": "required",
   "pantry": "required",
   "locker_wc": "required",
   "lounge_training": "required",
   "corridor": "required",
   "storage": "required",
   "clinic": "required"
  }
 },
 {
  "group": "Trần",
  "label": "Nắp thăm trần (nếu trần kín) / Access panels",
  "category": "ceiling",
  "keywords": [
   "thăm trần",
   "access panel"
  ],
  "req": {
   "office": "required",
   "meeting": "required",
   "dining": "required",
   "pantry": "required",
   "locker_wc": "required",
   "lounge_training": "required",
   "corridor": "required",
   "storage": "common",
   "clinic": "required"
  }
 },
 {
  "group": "Trần",
  "label": "Đèn chính / General lighting",
  "category": "lighting",
  "keywords": [],
  "req": {
   "office": "required",
   "meeting": "required",
   "dining": "required",
   "pantry": "required",
   "locker_wc": "required",
   "lounge_training": "required",
   "corridor": "required",
   "storage": "required",
   "clinic": "required"
  }
 },
 {
  "group": "Trần",
  "label": "Đèn sự cố, exit / Emergency & exit (MEP)",
  "category": "mep",
  "keywords": [
   "sự cố",
   "exit",
   "emergency"
  ],
  "req": {
   "office": "common",
   "meeting": "common",
   "dining": "required",
   "pantry": "common",
   "locker_wc": "required",
   "lounge_training": "common",
   "corridor": "required",
   "storage": "required",
   "clinic": "common"
  }
 },
 {
  "group": "Trần",
  "label": "Miệng gió, đầu báo khói, sprinkler (MEP) / Diffusers, detectors",
  "category": "mep",
  "keywords": [
   "miệng gió",
   "báo khói",
   "sprinkler",
   "diffuser"
  ],
  "req": {
   "office": "required",
   "meeting": "required",
   "dining": "required",
   "pantry": "required",
   "locker_wc": "required",
   "lounge_training": "required",
   "corridor": "required",
   "storage": "required",
   "clinic": "required"
  }
 },
 {
  "group": "Cửa",
  "label": "Cửa đi / Door",
  "category": "door",
  "keywords": [
   "cửa",
   "door"
  ],
  "req": {
   "office": "required",
   "meeting": "required",
   "dining": "required",
   "pantry": "required",
   "locker_wc": "required",
   "lounge_training": "required",
   "corridor": "common",
   "storage": "required",
   "clinic": "required"
  }
 },
 {
  "group": "Cửa",
  "label": "Bộ phụ kiện cửa + chặn cửa / Hardware set + stop",
  "category": "door",
  "keywords": [
   "phụ kiện cửa",
   "bản lề",
   "hardware",
   "chặn cửa"
  ],
  "req": {
   "office": "required",
   "meeting": "required",
   "dining": "required",
   "pantry": "required",
   "locker_wc": "required",
   "lounge_training": "required",
   "corridor": "common",
   "storage": "required",
   "clinic": "required"
  }
 },
 {
  "group": "Cửa",
  "label": "Biển tên phòng / Room signage",
  "category": "decor",
  "keywords": [
   "biển",
   "signage"
  ],
  "req": {
   "office": "required",
   "meeting": "required",
   "dining": "required",
   "pantry": "common",
   "locker_wc": "required",
   "lounge_training": "required",
   "corridor": "na",
   "storage": "required",
   "clinic": "required"
  }
 },
 {
  "group": "Liền tường",
  "label": "Tủ, kệ lưu trữ / Storage joinery",
  "category": "joinery",
  "keywords": [
   "tủ",
   "kệ",
   "storage",
   "cabinet",
   "shelf"
  ],
  "req": {
   "office": "required",
   "meeting": "common",
   "dining": "common",
   "pantry": "required",
   "locker_wc": "required",
   "lounge_training": "common",
   "corridor": "na",
   "storage": "required",
   "clinic": "required"
  }
 },
 {
  "group": "Liền tường",
  "label": "Quầy / Counter",
  "category": "joinery",
  "keywords": [
   "quầy",
   "counter"
  ],
  "req": {
   "office": "na",
   "meeting": "na",
   "dining": "na",
   "pantry": "required",
   "locker_wc": "common",
   "lounge_training": "na",
   "corridor": "na",
   "storage": "na",
   "clinic": "common"
  }
 },
 {
  "group": "Liền tường",
  "label": "Tủ locker / Lockers",
  "category": "joinery",
  "keywords": [
   "locker"
  ],
  "req": {
   "office": "na",
   "meeting": "na",
   "dining": "na",
   "pantry": "na",
   "locker_wc": "required",
   "lounge_training": "na",
   "corridor": "na",
   "storage": "common",
   "clinic": "na"
  }
 },
 {
  "group": "Liền tường",
  "label": "Vách ngăn vệ sinh / Cubicles",
  "category": "joinery",
  "keywords": [
   "vách ngăn",
   "cubicle",
   "compact"
  ],
  "req": {
   "office": "na",
   "meeting": "na",
   "dining": "na",
   "pantry": "na",
   "locker_wc": "required",
   "lounge_training": "na",
   "corridor": "na",
   "storage": "na",
   "clinic": "na"
  }
 },
 {
  "group": "Rời",
  "label": "Bàn / Tables",
  "category": "loose",
  "keywords": [
   "bàn",
   "table"
  ],
  "req": {
   "office": "required",
   "meeting": "required",
   "dining": "required",
   "pantry": "common",
   "locker_wc": "na",
   "lounge_training": "required",
   "corridor": "na",
   "storage": "common",
   "clinic": "required"
  }
 },
 {
  "group": "Rời",
  "label": "Ghế / Seating",
  "category": "loose",
  "keywords": [
   "ghế",
   "chair",
   "sofa",
   "stool",
   "seat"
  ],
  "req": {
   "office": "required",
   "meeting": "required",
   "dining": "required",
   "pantry": "common",
   "locker_wc": "common",
   "lounge_training": "required",
   "corridor": "na",
   "storage": "common",
   "clinic": "required"
  }
 },
 {
  "group": "Rời",
  "label": "Ghế băng thay đồ / Changing bench",
  "category": "loose",
  "keywords": [
   "ghế băng",
   "bench"
  ],
  "req": {
   "office": "na",
   "meeting": "na",
   "dining": "na",
   "pantry": "na",
   "locker_wc": "common",
   "lounge_training": "na",
   "corridor": "na",
   "storage": "na",
   "clinic": "na"
  }
 },
 {
  "group": "Rời",
  "label": "Thùng rác / Waste bins",
  "category": "loose",
  "keywords": [
   "thùng rác",
   "bin"
  ],
  "req": {
   "office": "common",
   "meeting": "common",
   "dining": "required",
   "pantry": "required",
   "locker_wc": "required",
   "lounge_training": "common",
   "corridor": "common",
   "storage": "common",
   "clinic": "required"
  }
 },
 {
  "group": "TBVS",
  "label": "Chậu, vòi / Basin, tap",
  "category": "sanitary",
  "keywords": [
   "chậu",
   "vòi",
   "basin",
   "tap",
   "mixer"
  ],
  "req": {
   "office": "na",
   "meeting": "na",
   "dining": "na",
   "pantry": "required",
   "locker_wc": "required",
   "lounge_training": "na",
   "corridor": "na",
   "storage": "common",
   "clinic": "required"
  }
 },
 {
  "group": "TBVS",
  "label": "Bồn cầu, tiểu, sen / WC, urinal, shower",
  "category": "sanitary",
  "keywords": [
   "bồn cầu",
   "tiểu",
   "sen",
   "toilet",
   "urinal",
   "shower"
  ],
  "req": {
   "office": "na",
   "meeting": "na",
   "dining": "na",
   "pantry": "na",
   "locker_wc": "required",
   "lounge_training": "na",
   "corridor": "na",
   "storage": "na",
   "clinic": "na"
  }
 },
 {
  "group": "TBVS",
  "label": "Gương / Mirror",
  "category": "sanitary",
  "keywords": [
   "gương",
   "mirror"
  ],
  "req": {
   "office": "na",
   "meeting": "na",
   "dining": "na",
   "pantry": "na",
   "locker_wc": "required",
   "lounge_training": "na",
   "corridor": "na",
   "storage": "na",
   "clinic": "common"
  }
 },
 {
  "group": "TBVS",
  "label": "Phụ kiện WC (lô giấy, máy sấy, xà phòng, móc) / Washroom accessories",
  "category": "sanitary",
  "keywords": [
   "lô giấy",
   "máy sấy",
   "xà phòng",
   "móc",
   "dispenser",
   "dryer"
  ],
  "req": {
   "office": "na",
   "meeting": "na",
   "dining": "na",
   "pantry": "na",
   "locker_wc": "required",
   "lounge_training": "na",
   "corridor": "na",
   "storage": "na",
   "clinic": "common"
  }
 },
 {
  "group": "Thiết bị",
  "label": "Ổ cắm, công tắc (màu mặt nạ) / Sockets, switches",
  "category": "equipment",
  "keywords": [
   "ổ cắm",
   "công tắc",
   "socket",
   "switch"
  ],
  "req": {
   "office": "required",
   "meeting": "required",
   "dining": "required",
   "pantry": "required",
   "locker_wc": "required",
   "lounge_training": "required",
   "corridor": "common",
   "storage": "required",
   "clinic": "required"
  }
 },
 {
  "group": "Thiết bị",
  "label": "Thiết bị AV (TV, máy chiếu, màn) / AV",
  "category": "equipment",
  "keywords": [
   "tv",
   "màn hình",
   "máy chiếu",
   "projector",
   "display",
   "screen"
  ],
  "req": {
   "office": "common",
   "meeting": "required",
   "dining": "common",
   "pantry": "na",
   "locker_wc": "na",
   "lounge_training": "required",
   "corridor": "na",
   "storage": "na",
   "clinic": "na"
  }
 },
 {
  "group": "Thiết bị",
  "label": "Thiết bị bếp (tủ lạnh, lò vi sóng, cây nước) / Appliances",
  "category": "equipment",
  "keywords": [
   "tủ lạnh",
   "lò vi sóng",
   "cây nước",
   "fridge",
   "microwave",
   "dispenser"
  ],
  "req": {
   "office": "na",
   "meeting": "na",
   "dining": "common",
   "pantry": "required",
   "locker_wc": "na",
   "lounge_training": "na",
   "corridor": "na",
   "storage": "na",
   "clinic": "na"
  }
 },
 {
  "group": "Decor",
  "label": "Tranh, artwork / Artwork",
  "category": "artwork",
  "keywords": [],
  "req": {
   "office": "common",
   "meeting": "common",
   "dining": "common",
   "pantry": "na",
   "locker_wc": "common",
   "lounge_training": "common",
   "corridor": "common",
   "storage": "na",
   "clinic": "na"
  }
 },
 {
  "group": "Decor",
  "label": "Cây xanh, đồ trang trí / Plants, accessories",
  "category": "decor",
  "keywords": [
   "cây",
   "plant",
   "gối",
   "cushion",
   "decor",
   "trang trí"
  ],
  "req": {
   "office": "common",
   "meeting": "common",
   "dining": "common",
   "pantry": "na",
   "locker_wc": "common",
   "lounge_training": "common",
   "corridor": "na",
   "storage": "na",
   "clinic": "na"
  }
 },
 {
  "group": "Cửa sổ",
  "label": "Rèm / Window blinds (nếu có cửa sổ)",
  "category": "window",
  "keywords": [
   "rèm",
   "blind",
   "curtain"
  ],
  "req": {
   "office": "required",
   "meeting": "required",
   "dining": "required",
   "pantry": "common",
   "locker_wc": "common",
   "lounge_training": "required",
   "corridor": "common",
   "storage": "common",
   "clinic": "required"
  }
 }
]
export const DEFAULT_RULES: Rule[] = [
 {
  "trigger": "Trần thạch cao kín + có thiết bị kỹ thuật phía trên",
  "item": "Nắp thăm trần 600x600 (chống ẩm nếu khu ướt)",
  "group": "GWB",
  "reason": "Bảo trì thiết bị trên trần",
  "scope": "Nội thất",
  "mode": "Đề xuất"
 },
 {
  "trigger": "Trần thạch cao ở khu ướt (WC, tắm, pantry)",
  "item": "Đổi tấm sang chống ẩm + sơn chống nấm mốc",
  "group": "GWB / PT",
  "reason": "Độ ẩm cao",
  "scope": "Nội thất",
  "mode": "Đề xuất"
 },
 {
  "trigger": "Nhìn thấy điều hòa cassette/ miệng gió cấp",
  "item": "Miệng gió hồi tương ứng, màu mặt nạ theo trần",
  "group": "ME",
  "reason": "Hệ ĐHKK luôn cần cấp + hồi",
  "scope": "MEP – phối hợp màu",
  "mode": "Đề xuất"
 },
 {
  "trigger": "Mọi phòng",
  "item": "Đầu báo khói/ sprinkler/ loa – quy định màu mặt nạ",
  "group": "ME",
  "reason": "Bắt buộc PCCC (QCVN 06:2022/BXD)",
  "scope": "MEP – phối hợp màu",
  "mode": "Đề xuất"
 },
 {
  "trigger": "Mọi phòng có cửa đi",
  "item": "Bộ phụ kiện cửa: bản lề, khóa (phân loại theo chức năng phòng), tay co, chặn cửa, gioăng",
  "group": "HW",
  "reason": "Cửa nhìn thấy nhưng phụ kiện không rõ",
  "scope": "Nội thất",
  "mode": "Đề xuất"
 },
 {
  "trigger": "Hai vật liệu sàn khác nhau tiếp giáp",
  "item": "Nẹp chuyển tiếp (inox/ nhôm) theo cao độ",
  "group": "MT",
  "reason": "Chi tiết hoàn thiện mép",
  "scope": "Nội thất",
  "mode": "Đề xuất"
 },
 {
  "trigger": "Tường không ốp gạch toàn chiều cao",
  "item": "Len chân tường theo vật liệu sàn",
  "group": "BS",
  "reason": "Bảo vệ chân tường",
  "scope": "Nội thất",
  "mode": "Đề xuất"
 },
 {
  "trigger": "Khu tắm, WC, lavabo",
  "item": "Thoát sàn chống mùi, chống thấm sàn/ chân tường",
  "group": "SF",
  "reason": "Thoát nước khu ướt",
  "scope": "Nội thất + MEP",
  "mode": "Đề xuất"
 },
 {
  "trigger": "Phòng WC/ thay đồ nhân viên",
  "item": "Lô giấy, hộp giấy/ máy sấy tay, bình xà phòng, móc áo, thùng rác",
  "group": "BA",
  "reason": "Tiêu chuẩn vận hành",
  "scope": "Nội thất",
  "mode": "Đề xuất"
 },
 {
  "trigger": "Phòng thay đồ có locker",
  "item": "Ghế băng thay đồ, khóa locker (theo hệ quản lý thẻ)",
  "group": "FF / FH",
  "reason": "Công năng thay đồ",
  "scope": "Nội thất",
  "mode": "Hỏi lại"
 },
 {
  "trigger": "Tủ có cánh trong phối cảnh",
  "item": "Bản lề giảm chấn, ray, tay nắm (kiểu theo hình), chân tăng chỉnh",
  "group": "FH",
  "reason": "Phụ kiện không nhìn rõ",
  "scope": "Nội thất",
  "mode": "Đề xuất"
 },
 {
  "trigger": "Đèn hắt/ khe sáng thấy được",
  "item": "LED dây + máng nhôm + bộ nguồn (driver)",
  "group": "LT",
  "reason": "Cấu tạo bắt buộc của đèn hắt",
  "scope": "Nội thất + điện",
  "mode": "Đề xuất"
 },
 {
  "trigger": "Bàn làm việc/ bàn họp",
  "item": "Hộp ổ cắm âm bàn, máng đi dây",
  "group": "EQ / FH",
  "reason": "Cấp nguồn thiết bị",
  "scope": "Nội thất",
  "mode": "Hỏi lại"
 },
 {
  "trigger": "Pantry/ quầy có chậu rửa",
  "item": "Chậu inox, vòi, xi phông, ốp chống bẩn (backsplash)",
  "group": "SF / CT",
  "reason": "Công năng rửa",
  "scope": "Nội thất",
  "mode": "Đề xuất"
 },
 {
  "trigger": "Phòng có cửa sổ kính ra ngoài",
  "item": "Rèm cuốn/ rèm che nắng",
  "group": "WT",
  "reason": "Chống chói, riêng tư",
  "scope": "Nội thất",
  "mode": "Hỏi lại"
 },
 {
  "trigger": "Hành lang BOH/ khu xe đẩy",
  "item": "Tay vịn chống va, bảo vệ góc inox",
  "group": "MT",
  "reason": "Chống va đập xe đẩy",
  "scope": "Nội thất",
  "mode": "Hỏi lại"
 },
 {
  "trigger": "Phòng có cửa",
  "item": "Biển tên phòng (signage)",
  "group": "SN",
  "reason": "Định hướng, vận hành",
  "scope": "Signage",
  "mode": "Hỏi lại"
 },
 {
  "trigger": "Ghế/ sofa bọc vải trong khu công cộng",
  "item": "Ghi chỉ tiêu: ≥ 30.000 double rubs, bền màu ≥ 4, chống cháy",
  "group": "FB",
  "reason": "Thông lệ vải contract (ACT)",
  "scope": "Nội thất",
  "mode": "Tự động ghi chú"
 }
]
export const DEFAULT_PERF: Perf[] = [
 {
  "space": "Khu ướt: WC, tắm, thay đồ",
  "surface": "Sàn",
  "vn": "Chống trượt R10–R11 hoặc DCOF ướt ≥ 0,42; gạch porcelain hút nước ≤ 0,5%",
  "en": "Slip R10–R11 or wet DCOF ≥ 0.42; porcelain absorption ≤ 0.5%",
  "ref": "DIN 51130; ANSI A326.3; ISO 13006 / TCVN 13113"
 },
 {
  "space": "Khu ướt",
  "surface": "Trần",
  "vn": "Tấm thạch cao chống ẩm, sơn chống nấm mốc",
  "en": "MR gypsum board, anti-mould paint",
  "ref": "TCVN 8256; EN 520 (H1/H2)"
 },
 {
  "space": "Khu ướt",
  "surface": "Đồ gỗ",
  "vn": "Cốt MDF/ván chống ẩm (HMR), chân cách sàn, nẹp kín cạnh",
  "en": "MR core, raised plinth, sealed edges",
  "ref": "EN 622-5 (MDF.H)"
 },
 {
  "space": "Khu ướt",
  "surface": "Đèn",
  "vn": "IP44 trở lên (vùng gần nước IP65)",
  "en": "IP44 min. (IP65 near water)",
  "ref": "IEC 60529"
 },
 {
  "space": "Phòng ăn, pantry",
  "surface": "Sàn",
  "vn": "R10 / DCOF ≥ 0,42, kháng dầu mỡ, dễ vệ sinh",
  "en": "R10 / DCOF ≥ 0.42, grease-resistant",
  "ref": "DIN 51130"
 },
 {
  "space": "Phòng ăn, pantry",
  "surface": "Mặt bàn, quầy",
  "vn": "Chống ố, chịu nhiệt nhẹ, an toàn thực phẩm",
  "en": "Stain- and heat-resistant, food-safe",
  "ref": "EN 438 / NSF 51 (tham khảo)"
 },
 {
  "space": "Mọi phòng",
  "surface": "Gỗ công nghiệp",
  "vn": "Phát thải formaldehyde E1 trở lên (khuyến nghị E0/ CARB P2 cho khách sạn 5*)",
  "en": "Emission E1 min. (E0 / CARB P2 recommended)",
  "ref": "EN 717-1; CARB ATCM"
 },
 {
  "space": "Mọi phòng",
  "surface": "Sơn tường",
  "vn": "Lau chùi được, VOC thấp",
  "en": "Washable, low VOC",
  "ref": "TCVN 8652; ASTM D2486"
 },
 {
  "space": "Đường thoát nạn, hành lang",
  "surface": "Tường, trần, sàn",
  "vn": "Nhóm nguy hiểm cháy vật liệu hoàn thiện theo quy chuẩn PCCC",
  "en": "Reaction-to-fire class per national fire code",
  "ref": "QCVN 06:2022/BXD; ASTM E84; EN 13501-1"
 },
 {
  "space": "Khu công cộng/ nhân viên",
  "surface": "Vải bọc",
  "vn": "≥ 30.000 double rubs (Wyzenbeek); bền màu ≥ 4; chống cháy",
  "en": "≥ 30,000 double rubs; colourfastness ≥ 4; flammability",
  "ref": "ACT Guidelines; ASTM D4157; CAL TB117-2013"
 },
 {
  "space": "Khu công cộng/ nhân viên",
  "surface": "Thảm",
  "vn": "Thảm tấm sợi nylon, chống cháy, chống tĩnh điện",
  "en": "Nylon carpet tile, fire-rated, antistatic",
  "ref": "ASTM E648; ISO 9239-1"
 },
 {
  "space": "Văn phòng, phòng họp",
  "surface": "Chiếu sáng",
  "vn": "Độ rọi 300–500 lux, UGR ≤ 19, CRI ≥ 80",
  "en": "300–500 lux, UGR ≤ 19, CRI ≥ 80",
  "ref": "TCVN 7114-1:2008; EN 12464-1"
 },
 {
  "space": "Văn phòng, phòng họp",
  "surface": "Ghế",
  "vn": "Ghế xoay đạt độ bền thương mại",
  "en": "Commercial-grade task chair",
  "ref": "BIFMA X5.1"
 },
 {
  "space": "Hành lang BOH, kho",
  "surface": "Tường",
  "vn": "Bảo vệ va đập (tay vịn, bảo vệ góc), sơn epoxy/ chịu chùi rửa",
  "en": "Impact protection, epoxy/scrubbable paint",
  "ref": "—"
 },
 {
  "space": "Kính trong nội thất",
  "surface": "Vách, cửa, mặt bàn",
  "vn": "Kính cường lực/ an toàn; dán decal nhận diện ở vách kính",
  "en": "Tempered/safety glass; manifestation on glazing",
  "ref": "TCVN 7455; EN 12150"
 }
]
