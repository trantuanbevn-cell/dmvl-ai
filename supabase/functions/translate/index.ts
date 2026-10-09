// Edge Function "translate" – dịch Việt → Anh chuyên ngành nội thất cho các ô tiếng Anh còn trống (quản trị viên và biên tập viên; chỉ điền ô tiếng Anh trống nên an toàn).
// Dùng cùng nhà cung cấp/khoá với hàm "ai" (Secrets: AI_PROVIDER, GEMINI_API_KEY, ANTHROPIC_API_KEY...). Trả JSON { items: [{ id, en }] }.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const API = (Deno.env.get('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com') + '/v1/messages'
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5'
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'
const GEMINI_BASE = Deno.env.get('GEMINI_BASE_URL') ?? 'https://generativelanguage.googleapis.com'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
function provider(): 'anthropic' | 'gemini' {
  const p = (Deno.env.get('AI_PROVIDER') ?? '').toLowerCase()
  if (p === 'gemini' || p === 'anthropic') return p
  return Deno.env.get('ANTHROPIC_API_KEY') ? 'anthropic' : 'gemini'
}

const SYSTEM = `Bạn là biên dịch viên chuyên ngành kiến trúc nội thất / hoàn thiện / FF&E / MEP cho khách sạn, dịch Bảng danh mục vật liệu từ tiếng Việt sang tiếng Anh theo đúng thuật ngữ thông dụng trong hồ sơ thiết kế quốc tế (CSI, Marriott/Westin design standards).
Quy tắc:
- Dùng thuật ngữ ngành chính xác (vd: tấm ốp tường = wall panelling/cladding, len chân tường = skirting board, trần thạch cao = gypsum board ceiling, tủ lavabo = vanity unit, gỗ công nghiệp phủ melamine = melamine-faced engineered wood, sơn tĩnh điện = powder-coated, nẹp = trim, kịch trần = floor-to-ceiling, bo góc = rounded corners, đôn băng = bench, hộc tủ di động = mobile pedestal).
- Chính tả Anh-Anh nhất quán (colour, grey, aluminium).
- GIỮ NGUYÊN: tên hãng, mã sản phẩm/mã tham khảo, số, đơn vị, kích thước, tên riêng, từ viết tắt (MDF, PVC, LED, MEP, HVAC, BOH…).
- Tên hạng mục: cụm danh từ ngắn (viết hoa chữ đầu). Thông số: giữ cấu trúc dòng “Nhãn: giá trị”, giữ xuống dòng, giữ gạch đầu dòng.
- Dịch sát nghĩa, KHÔNG thêm thông tin, KHÔNG giải thích, KHÔNG bỏ sót ý. Nếu có “draft” (bản nháp từ từ điển) thì chỉ tham khảo, sửa cho đúng nếu sai.
- Chỉ trả về JSON đúng dạng {"items":[{"id":"...","en":"..."}]}, mỗi mục giữ nguyên id, không thêm chữ nào ngoài JSON.`

function parse(t: string) {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/) ?? t.match(/(\{[\s\S]*\})/)
  return JSON.parse(m ? m[1] : t)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { items, context } = await req.json() as { items: { id: string; vi: string; kind?: string; draft?: string }[]; context?: string }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const tok = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = await admin.auth.getUser(tok)
    const { data: me } = u?.user ? await admin.from('profiles').select('role,active').eq('id', u.user.id).maybeSingle() : { data: null }
    if (!me || !me.active || !['admin', 'editor'].includes(me.role)) return json({ error: 'Bạn không có quyền dịch' }, 403)
    if (!Array.isArray(items) || !items.length || items.length > 40) return json({ error: 'Danh sách dịch không hợp lệ (1–40 mục)' }, 400)

    const list = items.map(i => `### ${i.id}${i.kind ? ` (${i.kind})` : ''}\n${String(i.vi).slice(0, 3000)}${i.draft ? `\n[draft: ${i.draft}]` : ''}`).join('\n\n')
    const prompt = `${context ? context + '\n' : ''}Dịch các mục sau sang tiếng Anh (mỗi mục bắt đầu bằng ### id):\n\n${list}`
    let text = ''
    if (provider() === 'gemini') {
      const key = Deno.env.get('GEMINI_API_KEY')
      if (!key) return json({ error: 'Chưa cấu hình GEMINI_API_KEY' }, 500)
      const r = await fetch(`${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 16000 } }),
      })
      if (!r.ok) return json({ error: `Gemini ${r.status}: ${(await r.text()).slice(0, 500)}` }, 502)
      const j = await r.json()
      text = (j.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text ?? '').join('')
    } else {
      const key = Deno.env.get('ANTHROPIC_API_KEY')
      if (!key) return json({ error: 'Chưa cấu hình ANTHROPIC_API_KEY' }, 500)
      const r = await fetch(API, {
        method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
      })
      if (!r.ok) return json({ error: `Claude ${r.status}: ${(await r.text()).slice(0, 500)}` }, 502)
      const j = await r.json()
      text = (j.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    }
    const out = parse(text)
    const ids = new Set(items.map(i => i.id))
    return json({ items: (out.items ?? []).filter((x: any) => ids.has(String(x.id)) && typeof x.en === 'string' && x.en.trim()).map((x: any) => ({ id: String(x.id), en: x.en.trim() })) })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
