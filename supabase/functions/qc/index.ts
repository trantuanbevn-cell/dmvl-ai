// Edge Function "qc" – AI soát lỗi danh mục (chỉ admin). Không stream: mỗi lần gọi một lô ~20 mã, trả { issues }.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'mã (code) của dòng có lỗi, đúng như trong dữ liệu' },
          kind: { type: 'string', enum: ['typo', 'english', 'mismatch', 'wrong', 'duplicate', 'rule', 'render', 'missing'], description: 'typo = lỗi chính tả/đánh máy; english = văn phong/ngữ pháp tiếng Anh chưa chuẩn hoặc nghe như máy dịch; mismatch = tiếng Việt và tiếng Anh không khớp hoặc các ô tự mâu thuẫn; wrong = thông tin sai/vô lý; duplicate = trùng một vật liệu thật với mã khác; rule = vi phạm quy định vận hành; render = lệch ghi chú phân tích phối cảnh; missing = thiếu thông tin quan trọng' },
          field: { type: 'string', enum: ['name_vn', 'name_en', 'material_vn', 'material_en', 'desc_vn', 'desc_en', 'part_vn', 'part_en', 'perf_vn', 'perf_en', 'note_vn', 'note_en', 'brand', 'product_code', 'origin', 'group', 'room', 'other'] },
          current: { type: 'string', description: 'đoạn chữ SAO CHÉP NGUYÊN VĂN từ ô bị lỗi (có thể là cả một câu); bỏ trống nếu lỗi không nằm ở một đoạn chữ' },
          suggestion: { type: 'string', description: 'đoạn chữ thay thế cho đúng đoạn current (chỉ khi chắc chắn cách sửa); bỏ trống nếu không chắc' },
          message: { type: 'string', description: '≤ 30 từ tiếng Việt: lỗi là gì, vì sao chắc là lỗi' },
          related: { type: 'array', items: { type: 'string' }, description: 'mã liên quan khác (vd mã trùng)' },
          confidence: { type: 'number', description: '0..1 – chỉ báo khi ≥ 0.85' },
        },
        required: ['code', 'kind', 'field', 'message', 'confidence'],
      },
    },
  },
  required: ['issues'],
}
const SYSTEM = `Bạn là kiến trúc sư nội thất cấp cao, người QC cuối của bảng danh mục vật liệu hoàn thiện (DMVL / FF&E) cho khách sạn và văn phòng tại Việt Nam. Bạn rất thận trọng: báo sai một lỗi còn tệ hơn bỏ sót.`

function prompt(p: any) {
  return `Soát CÁC DÒNG ĐƯỢC GIAO (mục "ENTRIES") trước khi gửi khách và chỉ báo lỗi mà bạn CHẮC CHẮN (≥ 85%). Khi nghi ngờ thì KHÔNG báo.

Đối chiếu mọi nguồn dưới đây:
1) Chính tả/đánh máy trong tiếng Việt và tiếng Anh (thiếu/thừa/đảo chữ, sai dấu thanh, từ ghép sai). KHÔNG báo: tên hãng, mã sản phẩm, viết tắt, thuật ngữ chuyên ngành (niken, crôm, melamine, mitred, cementitious, terrazzo…), chính tả Anh–Anh vs Anh–Mỹ (colour/color, grey/gray), hay cách diễn đạt khác nhau mà vẫn đúng nghĩa.
2) Việt ↔ Anh: hai bản phải cùng nghĩa (so từng ý, từng số, từng vật liệu), cùng số liệu (kích thước, độ dày, số lượng). Báo khi khác số, khác vật liệu, hoặc dịch sai nghĩa rõ ràng.
3) Mâu thuẫn nội bộ một dòng: tên nói gỗ mà vật liệu ghi inox; nhóm mã không hợp món đồ; bộ phận không hợp; kích thước vô lý.
4) Vị trí: món đồ ở phòng không hợp (vd bồn cầu ở phòng họp, sofa ở bếp) dựa trên danh sách phòng (rooms) của dòng.
5) Trùng: hai dòng thực chất cùng một vật liệu/món đồ (cùng loại, quy cách, màu) nhưng khác mã. Dùng INDEX để so; chỉ báo khi tên + vật liệu + thông số gần như giống hệt, ghi mã còn lại trong related. Hai món cùng loại nhưng khác kích thước/số hộc/màu KHÔNG phải trùng. Ô product_code/brand của đồ rời có thể chứa mã vật liệu thành phần (EWD-06, MTL-07…) – đó là tham chiếu, không phải trùng.
6) Quy định vận hành (RULES): nếu vật liệu của dòng áp cho phòng/bộ phận mà vi phạm quy định (vd yêu cầu sàn chống trơn mà vật liệu ghi sàn bóng) thì kind=rule, nêu tên quy định.
7) render_note của từng dòng là ghi chú AI nhìn ảnh phối cảnh: nếu lệch rõ ràng với tên/vật liệu trong danh mục thì kind=render.
8) TIẾNG ANH (kind=english) – soát KỸ mọi ô tiếng Anh (name_en, material_en, desc_en, part_en…), kể cả khi file xuất không dùng tiếng Anh. Tiêu chuẩn: văn bản kỹ thuật của hồ sơ thiết kế/đặc tả vật liệu khách sạn do kiến trúc sư bản ngữ viết – NGẮN GỌN, TRỰC TIẾP, TỰ NHIÊN, KHÔNG hoa mỹ.
   Báo khi: (a) sai ngữ pháp (mạo từ, số ít/số nhiều, thì, giới từ, thứ tự từ, danh từ ghép sai); (b) câu dịch từng chữ từ tiếng Việt, gượng, khó hiểu hoặc đảo trật tự kiểu Việt (vd "Tile ceramic floor", "wall stone natural"); (c) văn hoa, sáo rỗng, quảng cáo hoặc dài dòng không cần thiết (vd "exquisitely crafted to elevate the ambience", "seamlessly blends", "meticulously", "bespoke", "elegant" lặp lại), hoặc giọng "AI viết" (cấu trúc liệt kê rập khuôn, từ đệm); (d) dùng sai thuật ngữ ngành (vd skirting board, wall cladding, powder-coated, toughened glass, vanity unit, pedestal, architrave, grout, adhesive); (e) thuật ngữ không nhất quán giữa các dòng (cùng một khái niệm mà dòng này gọi khác dòng kia – đối chiếu INDEX và các dòng khác); (f) viết hoa/chấm câu không nhất quán, không dùng chính tả Anh-Anh nhất quán (colour, grey, aluminium); (g) còn chữ tiếng Việt lẫn trong ô tiếng Anh; (h) tên hạng mục tiếng Anh không phải cụm danh từ ngắn.
   Với mỗi lỗi english: "current" = đúng câu/cụm có vấn đề (sao chép nguyên văn), "suggestion" = bản viết lại NGẮN GỌN, giản dị, đúng nghĩa với bản tiếng Việt, giữ nguyên mọi số liệu/mã/tên hãng, văn phong đặc tả kỹ thuật (câu ngắn, mệnh đề rút gọn kiểu "Powder-coated steel frame, matt finish."). KHÔNG thêm thông tin, KHÔNG làm câu bay bổng hơn bản gốc. Chỉ báo khi bản gốc thực sự chưa chuẩn; câu đã đúng và tự nhiên thì để yên, đừng sửa theo sở thích.
9) Thiếu thông tin chỉ khi rõ ràng (vd có vật liệu mà không có tên).
Với mỗi lỗi: "current" phải sao chép NGUYÊN VĂN từ ô; "suggestion" là chữ thay đúng đoạn đó (bỏ trống nếu không chắc cách sửa). Không báo một lỗi nhiều lần. Không liệt kê dòng không có lỗi. Dự án: ${p.project ?? ''}.

RULES (id|phòng|bộ phận|nội dung):
${(p.rules ?? []).join('\n') || '(không có)'}

ROOMS (mã|tên VN|tên EN|loại):
${(p.rooms ?? []).join('\n')}

INDEX toàn bộ danh mục (code|nhóm|tên VN|tên EN|vật liệu rút gọn):
${(p.index ?? []).join('\n')}

ENTRIES cần soát (mỗi dòng 1 mã, JSON):
${(p.entries ?? []).map((e: any) => JSON.stringify(e)).join('\n')}

Gọi công cụ report_qc (issues rỗng nếu không có lỗi chắc chắn).`
}

function provider(): 'anthropic' | 'gemini' {
  const p = (Deno.env.get('AI_PROVIDER') ?? '').toLowerCase()
  if (p === 'gemini' || p === 'anthropic') return p
  return Deno.env.get('ANTHROPIC_API_KEY') ? 'anthropic' : 'gemini'
}

async function viaClaude(text: string) {
  const key = Deno.env.get('ANTHROPIC_API_KEY'); if (!key) throw new Error('Chưa cấu hình ANTHROPIC_API_KEY')
  const r = await fetch((Deno.env.get('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5', max_tokens: 8000, system: SYSTEM, tools: [{ name: 'report_qc', description: 'Danh sách lỗi chắc chắn', input_schema: SCHEMA }], tool_choice: { type: 'tool', name: 'report_qc' }, messages: [{ role: 'user', content: text }] }),
  })
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${(await r.text()).slice(0, 500)}`)
  const j = await r.json()
  return (j.content ?? []).find((b: any) => b.type === 'tool_use')?.input ?? { issues: [] }
}

async function viaGemini(text: string) {
  const key = Deno.env.get('GEMINI_API_KEY'); if (!key) throw new Error('Chưa cấu hình GEMINI_API_KEY')
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'
  const body: any = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text }] }],
    tools: [{ functionDeclarations: [{ name: 'report_qc', description: 'Danh sách lỗi chắc chắn', parameters: SCHEMA }] }],
    toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['report_qc'] } },
    generationConfig: { maxOutputTokens: 16000 } as any,
  }
  const thinking = (Deno.env.get('GEMINI_THINKING') ?? 'low').toLowerCase()
  if (thinking !== 'default' && /gemini-3/.test(model)) body.generationConfig.thinkingConfig = { thinkingLevel: thinking }
  const base = Deno.env.get('GEMINI_BASE_URL') ?? 'https://generativelanguage.googleapis.com'
  const send = () => fetch(`${base}/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  let r = await send()
  if (r.status === 400 && body.generationConfig.thinkingConfig) { delete body.generationConfig.thinkingConfig; r = await send() }
  if (!r.ok) throw new Error(`Gemini API ${r.status}: ${(await r.text()).slice(0, 500)}`)
  const j = await r.json()
  for (const part of j.candidates?.[0]?.content?.parts ?? []) if (part.functionCall?.args) return part.functionCall.args
  return { issues: [] }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { payload } = await req.json()
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const tok = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = await admin.auth.getUser(tok)
    const { data: me } = u?.user ? await admin.from('profiles').select('role,active').eq('id', u.user.id).maybeSingle() : { data: null }
    if (!me || !me.active || me.role !== 'admin') return json({ error: 'Chỉ quản trị viên mới được chạy AI soát lỗi' }, 403)
    const text = prompt(payload)
    return json(provider() === 'gemini' ? await viaGemini(text) : await viaClaude(text))
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
