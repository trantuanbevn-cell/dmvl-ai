// Edge Function "ai" – proxy có kiểm soát tới AI (Gemini hoặc Claude). Chỉ 2 việc: phân loại trang (dự phòng cho PDF scan) và nhìn ảnh phối cảnh.
// Trình duyệt gửi { task, payload }; hàm dựng prompt + công cụ ở phía máy chủ (khóa API không lộ ra ngoài)
// và trả thẳng luồng SSE của Anthropic về trình duyệt (giữ kết nối sống, tránh timeout).

import { GROUPS_PROMPT, CATEGORY_PROMPT, ROOM_TYPES_PROMPT } from './prompts.ts'
import { callGemini } from './gemini.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const API = (Deno.env.get('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com') + '/v1/messages'
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5'

// Chọn nhà cung cấp AI bằng Secrets trong Supabase (đổi lúc nào cũng được, không cần sửa code):
//   AI_PROVIDER = gemini | anthropic   (bỏ trống: có ANTHROPIC_API_KEY thì dùng Claude, không thì Gemini)
//   GEMINI_API_KEY, GEMINI_MODEL (mặc định gemini-3.8-flash – có hạn mức miễn phí), GEMINI_THINKING (low)
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash' // có hạn mức miễn phí
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



// Lược đồ GỌN cho bước nhìn ảnh – chỉ những gì phần mềm không tự suy ra được (giảm chữ AI phải viết ra)
const ITEM_LITE = {
  type: 'object',
  properties: {
    ref: { type: 'string', description: 'id tạm, vd "i1"' },
    parent_ref: { type: 'string', description: 'ref của món đồ chứa vật liệu này (vd mặt đá thuộc tủ lavabo)' },
    match_code: { type: 'string', description: 'mã đã có nếu trùng vật liệu/đồ' },
    group_code: { type: 'string' },
    category: { type: 'string' },
    name_vn: { type: 'string', description: 'tên ngắn' },
    name_en: { type: 'string', description: 'tên ngắn tiếng Anh' },
    part_vn: { type: 'string', description: 'bộ phận áp dụng, nếu là vật liệu của một món đồ' },
    material_vn: { type: 'string', description: '≤ 20 từ: loại, màu, vân, bề mặt, kích thước ước lượng' },
    material_en: { type: 'string', description: '≤ 20 từ tiếng Anh' },
    box_2d: { type: 'array', items: { type: 'number' }, description: '[ymin, xmin, ymax, xmax] là 4 số nguyên 0..1000 theo TOÀN ẢNH (gốc ở góc trên-trái; ymin/ymax là chiều dọc, xmin/xmax là chiều ngang)' },
    qty: { type: 'number' },
    unit: { type: 'string' },
    qty_basis: { type: 'string', enum: ['concept_text', 'counted_render', 'unknown'] },
    confidence: { type: 'number' },
  },
  required: ['ref', 'group_code', 'category', 'name_vn', 'material_vn', 'box_2d'],
}
const REPORT_ITEMS_LITE = {
  name: 'report_items',
  description: 'Danh sách vật liệu/đồ đạc nhìn thấy trong ảnh',
  input_schema: { type: 'object', properties: { items: { type: 'array', items: ITEM_LITE } }, required: ['items'] },
}

const REPORT_MATCH = {
  name: 'report_match',
  description: 'Ghép từng ảnh phối cảnh với camera trên mặt bằng',
  input_schema: {
    type: 'object',
    properties: {
      matches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            render: { type: 'integer', description: 'số thứ tự ảnh phối cảnh (1,2,...)' },
            camera: { type: 'string', description: 'nhãn camera trên mặt bằng (A,B,...) hoặc "?" nếu không xác định' },
            confidence: { type: 'number', description: '0..1' },
            reason: { type: 'string', description: '≤ 15 từ: vật mốc nhìn thấy trong ảnh giúp xác định' },
          },
          required: ['render', 'camera', 'confidence'],
        },
      },
    },
    required: ['matches'],
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

    case 'match_views': {
      const content: any[] = [txt(`Mặt bằng nhỏ dưới đây có ${p.cams.length} camera, đánh nhãn ${p.cams.map((c: any) => c.label).join(', ')} (chấm/nón đỏ kèm chữ). Sau đó là ${p.renders.length} ảnh phối cảnh 3D lấy từ cùng một slide, đánh số ${p.renders.map((r: any) => r.idx).join(', ')}.
Nhiệm vụ: với mỗi ảnh phối cảnh, xác định nó được chụp từ camera nào. Dựa vào hướng nhìn (nón đỏ), vị trí, và các vật mốc nhìn thấy (bàn, quầy, cửa, cột, kiểu sàn/trần...) có trên mặt bằng. Mỗi camera tương ứng nhiều nhất một ảnh. Nếu không chắc, trả camera "?" với confidence thấp – không đoán bừa.${p.context ? '\n' + p.context : ''}
Gọi report_match.`), txt('MẶT BẰNG:'), img(p.plan)]
      for (const r of p.renders) { content.push(txt(`ẢNH PHỐI CẢNH ${r.idx}:`)); content.push(img(r)) }
      return { model: MODEL, max_tokens: 1500, system: BASE_SYSTEM, tools: [REPORT_MATCH], tool_choice: { type: 'tool', name: 'report_match' }, messages: [{ role: 'user', content }] }
    }

    case 'analyze_page': {
      const ex = (p.existing ?? []).map((e: any) => `${e.code}|${e.name_vn}|${e.material_vn ?? ''}`).join('\n') || '(chưa có)'
      const content: any[] = [
        txt(`Phòng: ${p.room.name_vn} (${p.room.room_type}). Số liệu concept: ${JSON.stringify(p.room.concept_counts ?? [])}
Mã đã có (code|tên|vật liệu):
${ex}
${p.page?.plan_context ? `\nThông tin từ mặt bằng (phần mềm tự đọc): ${p.page.plan_context}\n` : ''}
Liệt kê MỌI vật liệu hoàn thiện và đồ vật NHÌN THẤY trong phối cảnh (bỏ qua khung chữ, logo, mặt bằng nhỏ, và các ảnh phối cảnh khác nếu có):
- Bề mặt: sàn, len, tường, tường nhấn, trần (cả trần lộ), cửa, cửa sổ.
- Đồ liền tường (JN) và đồ rời (FF): mỗi món 1 item; vật liệu cấu thành (thùng, cánh, mặt, khung, bọc, chân, tay nắm) là item riêng có parent_ref.
- Đèn (LT), thiết bị vệ sinh (SF), phụ kiện WC (BA), thiết bị (EQ), decor/cây (DC), tranh/mural (AW), đầu chờ MEP nhìn thấy (ME).
- TRANH / ARTWORK (AW): MỖI bức tranh khác nhau là MỘT item riêng (mô tả nội dung bức tranh: chủ đề, màu, khung, kích thước ước lượng), box_2d ôm đúng bức đó, KHÔNG gộp các bức khác nội dung vào cùng một mã và KHÔNG dùng match_code cho tranh trừ khi đúng cùng một bức đã có. CHỈ khi là một BỘ tranh cùng chủ đề/cùng kiểu khung treo thành cụm (vd 3 bức treo cạnh nhau) thì mới là MỘT item: ghi "bộ N bức" trong tên, qty = N, box_2d ôm cả cụm.
${p.page?.view_label ? `\nẢnh này chỉ là MỘT góc nhìn (camera ${p.page.view_label}) trong một không gian lớn có nhiều góc nhìn khác; các góc nhìn dùng chung bộ vật liệu của dự án.\n` : ''}Quy tắc THỐNG NHẤT DANH MỤC: vật liệu thật chỉ có ít loại (gỗ vài mã, kính 1–2 loại, khung cửa/khuôn cùng một màu sơn, cùng loại đá/thảm/sơn...). Trước khi tạo item mới, PHẢI đối chiếu danh sách mã đã có: nếu cùng chất liệu/màu/hoàn thiện thì ghi match_code, KHÔNG tạo mã mới chỉ vì góc nhìn, ánh sáng hay vị trí khác. Chỉ tạo mã mới khi thật sự khác loại hoặc khác màu/vân rõ rệt. Cùng vật liệu xuất hiện nhiều chỗ = 1 item; trùng mã đã có thì ghi match_code; box_2d = khung ôm sát món đồ (hoặc một mảng đại diện rõ nhất của bề mặt sàn/tường/trần – KHÔNG phủ cả ảnh), tọa độ [ymin,xmin,ymax,xmax] thang 0..1000 so với toàn bộ ảnh, và CHỈ nằm trong vùng ảnh phối cảnh 3D (không khoanh mặt bằng nhỏ, tiêu đề, logo, ô chữ); mô tả ngắn gọn; qty theo số liệu concept nếu có (concept_text), đếm được rõ thì counted_render, còn lại bỏ trống. KHÔNG liệt kê thứ không nhìn thấy.
Gọi report_items.`),
        img(p.page),
      ]
      return { model: MODEL, max_tokens: 8000, system: BASE_SYSTEM, tools: [REPORT_ITEMS_LITE], tool_choice: { type: 'tool', name: 'report_items' }, messages: [{ role: 'user', content }] }
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
    if (task === 'info') return json({ provider: prov, model: prov === 'gemini' ? GEMINI_MODEL : MODEL })
    // Phân tích/phân loại bằng AI chỉ dành cho quản trị viên (tránh ghi đè dữ liệu mọi người đang chỉnh)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const tok = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = await admin.auth.getUser(tok)
    const { data: me } = u?.user ? await admin.from('profiles').select('role,active').eq('id', u.user.id).maybeSingle() : { data: null }
    if (!me || !me.active || me.role !== 'admin') return json({ error: 'Chỉ quản trị viên mới được chạy phân tích bằng AI' }, 403)
    const request = build(task, payload)

    if (prov === 'gemini') {
      const key = Deno.env.get('GEMINI_API_KEY')
      if (!key) return json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Supabase → Edge Functions → Secrets' }, 500)
      const model = GEMINI_MODEL
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
