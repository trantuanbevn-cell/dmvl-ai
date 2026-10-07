// Edge Function "ai" – proxy có kiểm soát tới Claude API.
// Trình duyệt gửi { task, payload }; hàm dựng prompt + công cụ ở phía máy chủ (khóa API không lộ ra ngoài)
// và trả thẳng luồng SSE của Anthropic về trình duyệt (giữ kết nối sống, tránh timeout).

import { GROUPS_PROMPT, CATEGORY_PROMPT, ROOM_TYPES_PROMPT } from './prompts.ts'
import { callGemini } from './gemini.ts'

const API = (Deno.env.get('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com') + '/v1/messages'
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5'
const SEARCH_MODEL = Deno.env.get('ANTHROPIC_SEARCH_MODEL') ?? MODEL

// Chọn nhà cung cấp AI bằng Secrets trong Supabase (đổi lúc nào cũng được, không cần sửa code):
//   AI_PROVIDER = gemini | anthropic   (bỏ trống: có ANTHROPIC_API_KEY thì dùng Claude, không thì Gemini)
//   GEMINI_API_KEY, GEMINI_MODEL (mặc định gemini-3.1-pro-preview), GEMINI_SEARCH_MODEL
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-pro-preview'
const GEMINI_SEARCH_MODEL = Deno.env.get('GEMINI_SEARCH_MODEL') ?? GEMINI_MODEL
function provider(): 'anthropic' | 'gemini' {
  const p = (Deno.env.get('AI_PROVIDER') ?? '').toLowerCase()
  if (p === 'gemini' || p === 'anthropic') return p
  return Deno.env.get('ANTHROPIC_API_KEY') ? 'anthropic' : 'gemini'
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Img = { url?: string; base64?: string; media_type?: string }
const img = (i: Img) =>
  i.base64
    ? { type: 'image', source: { type: 'base64', media_type: i.media_type ?? 'image/jpeg', data: i.base64 } }
    : { type: 'image', source: { type: 'url', url: i.url } }
const txt = (t: string) => ({ type: 'text', text: t })

// ---------------- Schemas ----------------
const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    ref: { type: 'string', description: 'id tạm duy nhất trong câu trả lời, vd "i1"' },
    parent_ref: { type: 'string', description: 'ref của đồ chứa nó (vd vật liệu mặt tủ thuộc tủ lavabo). Bỏ trống nếu độc lập.' },
    match_code: { type: 'string', description: 'Nếu TRÙNG với một mã đã có trong danh sách hiện có (cùng vật liệu/đồ) thì ghi mã đó, vd "LM-01".' },
    group_code: { type: 'string' },
    category: { type: 'string' },
    name_vn: { type: 'string' },
    name_en: { type: 'string' },
    part_vn: { type: 'string', description: 'Bộ phận/vị trí áp dụng, vd "Thùng + cánh tủ lavabo"' },
    part_en: { type: 'string' },
    material_vn: { type: 'string', description: 'Mô tả vật liệu nhìn thấy: loại, màu, vân, bề mặt, kích thước ước lượng' },
    material_en: { type: 'string' },
    color_hex: { type: 'string', description: 'Màu chủ đạo dạng #RRGGBB' },
    page_no: { type: 'integer', description: 'Số trang chứa bbox (bắt buộc khi soát nhiều trang)' },
    bbox: { type: 'array', items: { type: 'number' }, description: '[x, y, w, h] chuẩn hoá 0..1 theo TOÀN BỘ ảnh trang. Bỏ trống nếu suy luận/không nhìn thấy.' },
    qty: { type: 'number' },
    unit: { type: 'string', description: 'm², md, cái, bộ, ô, buồng...' },
    qty_basis: { type: 'string', enum: ['concept_text', 'counted_render', 'counted_plan', 'unknown'] },
    source: { type: 'string', enum: ['image', 'inferred'] },
    reason: { type: 'string', description: 'Với source=inferred: vì sao logic bắt buộc phải có' },
    confidence: { type: 'number', description: '0..1' },
  },
  required: ['ref', 'group_code', 'category', 'name_vn', 'name_en', 'material_vn', 'source', 'confidence'],
}

const REPORT_ITEMS = {
  name: 'report_items',
  description: 'Trả danh sách hạng mục vật liệu / đồ đạc đã bóc tách',
  input_schema: {
    type: 'object',
    properties: {
      items: { type: 'array', items: ITEM_SCHEMA },
      concept_counts: {
        type: 'array',
        items: { type: 'object', properties: { label: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string' } } },
      },
      warnings: { type: 'array', items: { type: 'string' }, description: 'Mâu thuẫn, chỗ không chắc chắn, số liệu lệch' },
    },
    required: ['items'],
  },
}

const REPORT_PAGES = {
  name: 'report_pages',
  description: 'Phân loại các trang concept và gom theo phòng',
  input_schema: {
    type: 'object',
    properties: {
      pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            page_no: { type: 'integer' },
            kind: { type: 'string', enum: ['cover', 'moodboard', 'plan', 'render', 'other'] },
            room_name_vn: { type: 'string', description: 'Tên phòng (tiếng Việt). Bỏ trống với bìa/moodboard chung.' },
            room_name_en: { type: 'string' },
            room_type: { type: 'string' },
            concept_counts: {
              type: 'array',
              items: { type: 'object', properties: { label: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string' } } },
            },
            note: { type: 'string' },
          },
          required: ['page_no', 'kind'],
        },
      },
    },
    required: ['pages'],
  },
}

const REPORT_SPECS = {
  name: 'report_specs',
  description: 'Trả mô tả kỹ thuật hoàn chỉnh cho từng mã',
  input_schema: {
    type: 'object',
    properties: {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            desc_vn: { type: 'string' }, desc_en: { type: 'string' },
            perf_vn: { type: 'string' }, perf_en: { type: 'string' },
            standards: { type: 'string' },
            unit: { type: 'string' },
            note_vn: { type: 'string' }, note_en: { type: 'string' },
          },
          required: ['code', 'desc_vn', 'desc_en', 'perf_vn', 'perf_en'],
        },
      },
    },
    required: ['entries'],
  },
}

const SUBMIT_CANDIDATES = {
  name: 'submit_candidates',
  description: 'Nộp tối đa 3 sản phẩm thực tế gần nhất với vật liệu cần tìm',
  input_schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            brand: { type: 'string' },
            product_code: { type: 'string' },
            product_name: { type: 'string' },
            url: { type: 'string', description: 'Link trang sản phẩm đã thấy trong kết quả tìm kiếm' },
            image_url: { type: 'string' },
            reason_vn: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['brand', 'product_code', 'url', 'reason_vn'],
        },
      },
    },
    required: ['candidates'],
  },
}

const BASE_SYSTEM = `Bạn là kiến trúc sư nội thất cấp cao chuyên lập Bảng danh mục vật liệu hoàn thiện (DMVL / Finishes & FF&E Schedule) cho khách sạn và văn phòng tại Việt Nam, theo thông lệ quốc tế (CSI MasterFormat, hospitality FF&E) và TCVN.
Nguyên tắc: không bỏ sót; không bịa phòng không có trong concept; phân biệt rõ cái NHÌN THẤY với cái SUY LUẬN; viết tiếng Việt chuyên ngành ngắn gọn, chính xác; luôn kèm bản tiếng Anh tương đương.

${GROUPS_PROMPT}

${CATEGORY_PROMPT}

${ROOM_TYPES_PROMPT}`

// ---------------- Builders ----------------
function build(task: string, p: any) {
  switch (task) {
    case 'classify_pages': {
      const content: any[] = [txt(`Dưới đây là ${p.pages.length} trang của một bộ concept nội thất (theo thứ tự). Với mỗi trang:
- Xác định loại trang: cover (bìa), moodboard (bảng vật liệu/màu chung), plan (mặt bằng bố trí), render (phối cảnh 3D), other.
- Xác định trang thuộc PHÒNG nào. Ưu tiên tiêu đề ở đầu trang (vd "INTERIOR CONCEPT | LOCKER ROOM"), sau đó mặt bằng nhỏ có mũi tên góc nhìn. CẢNH BÁO: ô chữ bên cạnh có thể bị copy nhầm từ phòng khác – nếu mâu thuẫn với tiêu đề/ảnh thì tin tiêu đề và ảnh, ghi note.
- Dùng CÙNG MỘT tên phòng cho mọi trang của cùng phòng. Dịch tên sang tiếng Việt chuẩn (vd TEAMMEMBER DINING ROOM → "Phòng ăn nhân viên").
- room_type theo danh sách loại phòng.
- concept_counts: các số lượng ghi trên trang (ghế, bàn, locker, lavabo...) nếu tin cậy.
${p.known_rooms?.length ? 'Các phòng đã xác định ở các trang trước (dùng lại đúng tên nếu cùng phòng): ' + p.known_rooms.join('; ') : ''}
Gọi công cụ report_pages.`)]
      for (const pg of p.pages) {
        content.push(txt(`--- Trang ${pg.page_no} ---${pg.text ? `\nChữ trích từ PDF: ${String(pg.text).slice(0, 600)}` : ''}`))
        content.push(img(pg))
      }
      return { model: MODEL, max_tokens: 8000, system: BASE_SYSTEM, tools: [REPORT_PAGES], tool_choice: { type: 'tool', name: 'report_pages' }, messages: [{ role: 'user', content }] }
    }

    case 'analyze_page': {
      const ex = (p.existing ?? []).map((e: any) => `${e.code} | ${e.name_vn} | ${e.material_vn ?? ''}`).join('\n') || '(chưa có)'
      const content: any[] = [
        txt(`PHÒNG: ${p.room.name_vn} (loại: ${p.room.room_type}). Số liệu trên concept: ${JSON.stringify(p.room.concept_counts ?? [])}
TRANG ${p.page.page_no} – loại: ${p.page.kind}. ${p.page.text ? 'Chữ trên trang: ' + String(p.page.text).slice(0, 800) : ''}

DANH SÁCH MÃ ĐÃ CÓ TRONG DỰ ÁN (code | tên | vật liệu):
${ex}

QUY TẮC SUY LUẬN CỦA CÔNG TY (chỉ áp dụng khi điều kiện đúng với phòng này):
${(p.rules ?? []).join('\n')}

NHIỆM VỤ: Bóc tách TOÀN BỘ vật liệu hoàn thiện và đồ đạc NHÌN THẤY trong phần phối cảnh/mặt bằng của trang này (bỏ qua khung chữ, logo, mặt bằng chìa khoá nhỏ):
1. Bề mặt: sàn, len chân tường, tường, tường nhấn, trần (kể cả trần lộ, hệ ống), cửa, cửa sổ/rèm.
2. Đồ liền tường (JN): mỗi món là một hạng mục, VÀ tách thành các vật liệu cấu thành (thùng, cánh, mặt, đợt, chân, tay nắm, đèn tích hợp) – mỗi vật liệu là một item riêng có parent_ref trỏ về món đồ.
3. Đồ rời (FF): bàn, ghế, sofa, đôn... và vật liệu bọc/khung (FB, LE, MT, WD...) với parent_ref.
4. Đèn (LT) từng loại; thiết bị vệ sinh (SF) và phụ kiện (BA); thiết bị (EQ: TV, máy chiếu, tủ lạnh...); decor (DC), tranh/mural (AW), cây xanh, gối...
5. Đầu chờ MEP nhìn thấy (ME): miệng gió, điều hoà cassette, đầu báo khói, sprinkler, loa, công tắc ổ cắm.
6. Hạng mục SUY LUẬN (source="inferred", bỏ bbox, ghi reason): chỉ những gì logic BẮT BUỘC phải có nhưng không thấy rõ, ví dụ nắp thăm trần khi có trần thạch cao kín, phụ kiện cửa (bản lề, khoá, tay co, chặn cửa) khi có cửa, thoát sàn khu ướt, nẹp chuyển vật liệu sàn, LED + máng nhôm cho khe hắt sáng, bản lề/ray cho tủ có cánh, miệng gió hồi khi có miệng cấp. Không suy luận tràn lan.

QUY TẮC:
- Cùng một vật liệu dùng ở nhiều chỗ trong ảnh = MỘT item (bbox lấy vùng rõ nhất). Nếu trùng mã đã có → điền match_code.
- bbox [x,y,w,h] chuẩn hoá 0..1 theo toàn bộ ảnh trang, ôm sát vùng thể hiện rõ vật liệu/đồ đó.
- material_vn mô tả cụ thể: loại vật liệu, màu, vân, độ bóng, kích thước ước lượng (vd "Porcelain 600x600 mờ, vân terrazzo xám hạt nhỏ").
- Số lượng: nếu concept ghi số (vd "50 Seats") thì qty theo đó, qty_basis=concept_text; nếu đếm được rõ trên ảnh/mặt bằng thì counted_*; còn lại để trống và qty_basis=unknown. Với bề mặt (m²) để trống.
- warnings: ghi mâu thuẫn (vd số liệu trên trang không khớp ảnh).
Gọi công cụ report_items.`),
        img(p.page),
      ]
      return { model: MODEL, max_tokens: 16000, system: BASE_SYSTEM, tools: [REPORT_ITEMS], tool_choice: { type: 'tool', name: 'report_items' }, messages: [{ role: 'user', content }] }
    }

    case 'review_room': {
      const cur = (p.current ?? []).map((e: any) => `${e.code} | ${e.category} | ${e.name_vn} | ${e.source}`).join('\n')
      const content: any[] = [
        txt(`PHÒNG: ${p.room.name_vn} (loại: ${p.room.room_type}).
DANH SÁCH ĐÃ BÓC TÁCH (code | bề mặt | tên | nguồn):
${cur}

CHECKLIST BẮT BUỘC/THƯỜNG CÓ CHO LOẠI PHÒNG NÀY:
${(p.checklist ?? []).join('\n')}

QUY TẮC SUY LUẬN:
${(p.rules ?? []).join('\n')}

NHIỆM VỤ – SOÁT LẠI LẦN 2: xem kỹ TẤT CẢ ảnh của phòng bên dưới, tìm những gì CÒN THIẾU trong danh sách: vật liệu, đồ đạc, phụ kiện, đèn, thiết bị, decor nhìn thấy nhưng chưa có; và hạng mục bắt buộc theo checklist/logic mà chưa có (source="inferred"). Chỉ trả về hạng mục MỚI (không lặp lại cái đã có; nếu là cùng vật liệu đã có thì dùng match_code). Với hạng mục nhìn thấy: ghi page_no và bbox trên đúng trang đó. Ghi warnings cho mục checklist bắt buộc không xác định được.
Gọi công cụ report_items.`),
      ]
      for (const pg of p.pages) { content.push(txt(`--- Trang ${pg.page_no} ---`)); content.push(img(pg)) }
      return { model: MODEL, max_tokens: 10000, system: BASE_SYSTEM, tools: [REPORT_ITEMS], tool_choice: { type: 'tool', name: 'report_items' }, messages: [{ role: 'user', content }] }
    }

    case 'enrich_entries': {
      const content = [txt(`Dự án: ${p.project?.name ?? ''}. Viết nội dung kỹ thuật hoàn chỉnh cho từng mã dưới đây để đưa vào Bảng DMVL.
Với mỗi mã:
- desc_vn/desc_en: mô tả & thông số kỹ thuật (vật liệu, kích thước/độ dày, bề mặt, màu, cấu tạo/hệ, ron/nẹp, phụ kiện). Với đồ liền tường/đồ rời: kích thước ước lượng + vật liệu từng bộ phận theo mã.
- perf_vn/perf_en: tính chất yêu cầu PHÙ HỢP KHÔNG GIAN (khu ướt: chống trượt R10–R11/DCOF≥0,42, chống ẩm, IP44; khu ăn uống: kháng dầu mỡ; vải công cộng: ≥30.000 double rubs, bền màu ≥4; đường thoát nạn: nhóm cháy theo QCVN 06:2022/BXD; gỗ công nghiệp: E1 trở lên...).
- standards: tiêu chuẩn tham chiếu ngắn gọn (TCVN/ISO/EN/ASTM) – chỉ ghi chuẩn bạn chắc chắn tồn tại.
- unit: đơn vị tính phù hợp.
- note_vn/note_en: lưu ý cho TVTK nếu có (mâu thuẫn, cần xác nhận). Có thể để trống.
Không bịa mã sản phẩm hãng.

BẢNG TÍNH CHẤT THEO KHÔNG GIAN CỦA CÔNG TY:
${p.perf_table ?? ''}

DANH SÁCH:
${JSON.stringify(p.entries, null, 1)}

Gọi công cụ report_specs.`)]
      return { model: MODEL, max_tokens: 16000, system: BASE_SYSTEM, tools: [REPORT_SPECS], tool_choice: { type: 'tool', name: 'report_specs' }, messages: [{ role: 'user', content }] }
    }

    case 'suggest_products': {
      const e = p.entry
      const content: any[] = [
        txt(`Tìm tối đa 3 SẢN PHẨM THỰC TẾ đang bán tại Việt Nam (ưu tiên hãng lớn, có trang sản phẩm chính thức) gần nhất với vật liệu sau:
Mã: ${e.code} (nhóm ${e.group_code}) – ${e.name_vn}
Vật liệu nhìn thấy: ${e.material_vn ?? ''}
Mô tả: ${e.desc_vn ?? ''}
Màu chủ đạo: ${e.color_hex ?? ''}
Hãng ưu tiên: ${(p.preferred_brands ?? []).join(', ') || 'tuỳ nhóm (vd An Cường cho melamine/laminate; Dulux/Jotun cho sơn; Viglacera/Vietceramics/Khatra/Luxcasa cho gạch; Vĩnh Tường/Knauf cho trần; Hafele cho phụ kiện; TOTO/Kohler/Grohe/Inax cho TBVS; Philips/Panasonic/Rạng Đông cho đèn)'}
Ảnh crop từ phối cảnh đính kèm (nếu có).

Dùng công cụ tìm kiếm web để tìm và XÁC MINH mã có thật trên trang của hãng/đại lý. Chỉ nộp mã đã thấy trong kết quả tìm kiếm, kèm link đúng trang. So màu/vân với ảnh crop để xếp hạng. Cuối cùng BẮT BUỘC gọi submit_candidates (có thể rỗng nếu không tìm được); nếu không gọi được công cụ thì trả đúng một khối JSON dạng {"candidates":[{brand, product_code, product_name, url, image_url, reason_vn, confidence}]} trong khối mã json.`),
      ]
      if (p.crop) content.push(img(p.crop))
      return {
        model: SEARCH_MODEL,
        max_tokens: 6000,
        system: BASE_SYSTEM,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }, SUBMIT_CANDIDATES],
        messages: [{ role: 'user', content }],
      }
    }
  }
  throw new Error('Unknown task: ' + task)
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const SSE = { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { task, payload } = await req.json()
    const prov = provider()
    if (task === 'info') return json({ provider: prov, model: prov === 'gemini' ? GEMINI_MODEL : MODEL, search_model: prov === 'gemini' ? GEMINI_SEARCH_MODEL : SEARCH_MODEL })
    const request = build(task, payload)

    if (prov === 'gemini') {
      const key = Deno.env.get('GEMINI_API_KEY')
      if (!key) return json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Supabase → Edge Functions → Secrets' }, 500)
      const model = task === 'suggest_products' ? GEMINI_SEARCH_MODEL : GEMINI_MODEL
      const r = await callGemini(request, key, model)
      return new Response(r.body, { headers: SSE })
    }

    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'Chưa cấu hình ANTHROPIC_API_KEY trong Supabase → Edge Functions → Secrets' }, 500)
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ ...request, stream: true }),
    })
    if (!r.ok || !r.body) return json({ error: `Claude API ${r.status}: ${await r.text()}` }, 502)
    return new Response(r.body, { headers: SSE })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
