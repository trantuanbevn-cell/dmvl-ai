// Edge Function "pattern-tag": AI chỉ NHÌN ảnh và ghi "hồ sơ vân" (nhãn chuẩn hoá) cho map vật liệu thư viện hoặc cho vùng khoanh trong phối cảnh.
// Việc so khớp hồ sơ vân là của phần mềm (src/lib/patMatch.ts).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'
const CLAUDE_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5'

const E = {
  family: ['wood', 'stone', 'marble', 'concrete', 'metal', 'fabric', 'leather', 'wallcovering', 'tile', 'terrazzo', 'solid', 'paint', 'glass', 'other'],
  pattern: ['plain', 'straight_grain', 'wavy_grain', 'cathedral', 'ribbed_linear', 'herringbone_chevron', 'faceted_polygon', 'geometric_repeat', 'large_motif', 'veined', 'cloudy', 'speckled', 'woven', 'other'],
  direction: ['none', 'horizontal', 'vertical', 'diagonal', 'multi'],
  scale: ['fine', 'medium', 'coarse'],
  contrast: ['low', 'medium', 'high'],
  tone: ['white', 'cream', 'beige', 'light_grey', 'grey', 'dark_grey', 'black', 'light_brown', 'mid_brown', 'dark_brown', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gold', 'silver', 'multi'],
  gloss: ['matte', 'satin', 'gloss'],
}
const TAG = { type: 'object', properties: {
  n: { type: 'integer', description: 'số ô (bảng) – với ảnh đơn luôn là 1' },
  family: { type: 'string', enum: E.family }, pattern: { type: 'string', enum: E.pattern }, direction: { type: 'string', enum: E.direction },
  scale: { type: 'string', enum: E.scale }, contrast: { type: 'string', enum: E.contrast }, tone: { type: 'string', enum: E.tone }, gloss: { type: 'string', enum: E.gloss },
  desc: { type: 'string', description: '≤ 12 từ tiếng Việt mô tả vân' },
}, required: ['n', 'family', 'pattern', 'direction', 'scale', 'contrast', 'tone', 'gloss'] }
const SCHEMA = { type: 'object', properties: { tags: { type: 'array', items: TAG } }, required: ['tags'] }

const SYSTEM = 'Bạn là chuyên gia vật liệu nội thất. Chỉ nhìn ảnh và gán nhãn VÂN / HOA VĂN / CẤU TRÚC BỀ MẶT theo bộ nhãn cho sẵn, nhất quán giữa các ảnh.'
const GUIDE = `Giải thích nhãn: pattern = kiểu vân chính: plain (trơn/đều), straight_grain (vân thẳng song song), wavy_grain (vân sóng/uốn), cathedral (vân vòm gỗ cắt tiếp tuyến), ribbed_linear (nan/rãnh/sọc song song rõ), herringbone_chevron (xương cá/chữ V), faceted_polygon (các mảng đa giác/mặt cắt hình học, mỗi mảng vân khác hướng), geometric_repeat (hoạ tiết hình học lặp: ô vuông, lục giác, kim cương...), large_motif (hoạ tiết lớn/tranh/hoa), veined (vân đá/cẩm thạch có đường gân), cloudy (loang mây/bê tông/hiệu ứng), speckled (đốm/hạt/terrazzo), woven (dệt/vải/thảm), other. direction = hướng vân chủ đạo (multi nếu nhiều hướng). scale = độ to của chi tiết so với ô ảnh. tone = tông màu chủ đạo. Gán đúng một nhãn cho mỗi trường.`

async function gemini(parts: any[], key: string) {
  const body: any = { systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, maxOutputTokens: 8000, thinkingConfig: { thinkingLevel: 'low' } } }
  const send = () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  let r = await send()
  if (r.status === 400) { const t = await r.text(); if (/thinking/i.test(t)) { delete body.generationConfig.thinkingConfig; r = await send() } else throw new Error('Gemini 400: ' + t.slice(0, 800)) }
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 800)}`)
  const j = await r.json()
  const txt = (j.candidates?.[0]?.content?.parts ?? []).filter((x: any) => !x.thought && typeof x.text === 'string').map((x: any) => x.text).join('')
  return JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] ?? '{"tags":[]}')
}
async function claude(parts: any[], key: string) {
  const content = parts.map(p => p.text !== undefined ? { type: 'text', text: p.text } : { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.inlineData.data } })
  const r = await fetch((Deno.env.get('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 6000, system: SYSTEM, tools: [{ name: 'report_tags', description: 'Hồ sơ vân', input_schema: SCHEMA }], tool_choice: { type: 'tool', name: 'report_tags' }, messages: [{ role: 'user', content }] }),
  })
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 800)}`)
  const j = await r.json()
  return (j.content ?? []).find((b: any) => b.type === 'tool_use')?.input ?? { tags: [] }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const tok = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = await admin.auth.getUser(tok)
    const { data: me } = u?.user ? await admin.from('profiles').select('role,active').eq('id', u.user.id).maybeSingle() : { data: null }
    const p = await req.json()
    const okRole = me?.active && (p.mode === 'lib' ? me.role === 'admin' : ['admin', 'editor'].includes(me.role))
    if (!okRole) return json({ error: p.mode === 'lib' ? 'Chỉ quản trị viên được phân tích thư viện' : 'Không có quyền dùng AI so vân' }, 403)
    let parts: any[]
    if (p.mode === 'lib') {
      if (!p.img || !p.count || p.count > 40) return json({ error: 'Thiếu ảnh' }, 400)
      parts = [{ text: `Ảnh là bảng ${p.count} mẫu vật liệu, mỗi ô có SỐ ở góc trên-trái (từ ${p.from} đến ${p.from + p.count - 1}). Với MỖI ô gán hồ sơ vân (trả đủ ${p.count} phần tử, n = số ghi trên ô).\n${GUIDE}` }, { inlineData: { mimeType: 'image/jpeg', data: p.img } }]
    } else {
      if (!p.img) return json({ error: 'Thiếu ảnh' }, 400)
      parts = [{ text: `Ảnh là MỘT vùng bề mặt vật liệu cắt từ phối cảnh 3D${p.hint ? ` (hạng mục: ${p.hint})` : ''}; ánh sáng/bóng đổ/phối cảnh làm màu và độ sáng lệch, hãy suy ra VÂN thật của vật liệu. Trả đúng 1 phần tử (n = 1).\n${GUIDE}` }, { inlineData: { mimeType: 'image/jpeg', data: p.img } }]
    }
    const gk = Deno.env.get('GEMINI_API_KEY'), ck = Deno.env.get('ANTHROPIC_API_KEY'), pv = (Deno.env.get('AI_PROVIDER') ?? '').toLowerCase()
    const useClaude = pv === 'anthropic' ? true : pv === 'gemini' ? false : !!ck
    if (useClaude ? !ck : !gk) return json({ error: `Chưa cấu hình ${useClaude ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY'} trong Supabase → Edge Functions → Secrets` }, 500)
    const out = useClaude ? await claude(parts, ck!) : await gemini(parts, gk!)
    return json({ tags: Array.isArray(out.tags) ? out.tags : [] })
  } catch (e) { return json({ error: String(e) }, 500) }
})
