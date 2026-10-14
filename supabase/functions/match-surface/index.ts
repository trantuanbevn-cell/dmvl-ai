// Edge Function "match-surface": AI chỉ LÀM VIỆC NHÌN – so VÂN / HOA VĂN của một vùng phối cảnh với các bảng mẫu thư viện (đã đánh số) và trả về số các mẫu giống nhất.
// Mọi việc khác (chọn danh sách ứng viên, xếp hạng, ghi vào danh mục) do phần mềm làm.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'
const CLAUDE_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5'

const SYSTEM = `Bạn là chuyên gia vật liệu nội thất. Nhiệm vụ DUY NHẤT: nhìn ảnh và tìm mẫu vật liệu có CÙNG VÂN / HOA VĂN / CẤU TRÚC BỀ MẶT.`

function prompt(p: any) {
  return `Ảnh đầu tiên (QUERY) là một vùng bề mặt vật liệu cắt ra từ ảnh phối cảnh 3D${p.hint ? ` (hạng mục: ${p.hint})` : ''}. Nó bị ảnh hưởng bởi ánh sáng, bóng đổ, phối cảnh, độ phân giải thấp nên MÀU và ĐỘ SÁNG có thể lệch nhiều so với mẫu thật.
Các ảnh sau là ${p.sheets.length} bảng mẫu của thư viện vật liệu; mỗi ô có một SỐ ở góc trên-trái (số liên tục giữa các bảng).
Hãy tìm những ô có CÙNG VÂN / HOA VĂN với QUERY: kiểu vân (thẳng, sóng, xương cá, ô khối / đa giác / mặt cắt hình học, vân đá cuộn, đốm, dệt, trơn...), hướng vân, độ to nhỏ của chi tiết, cách các mảng ghép với nhau. BỎ QUA khác biệt về màu sắc, độ sáng, độ bão hoà – nhưng tông màu gần giống thì ưu tiên hơn khi vân ngang nhau.
Không bị giới hạn theo loại vật liệu (gỗ, đá, gạch, vải, sơn hiệu ứng... đều được nếu vân thực sự giống).
Trả tối đa 8 số ô, xếp từ GIỐNG NHẤT; mỗi ô kèm confidence 0..1 (mức chắc chắn cùng vân) và reason ≤ 12 từ tiếng Việt nêu đặc điểm vân giống. Nếu không ô nào cùng vân thì trả mảng rỗng, đừng cố đoán.`
}

const SCHEMA = { type: 'object', properties: { picks: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, confidence: { type: 'number' }, reason: { type: 'string' } }, required: ['n', 'confidence'] } } }, required: ['picks'] }

async function gemini(p: any, key: string) {
  const parts: any[] = [{ text: prompt(p) }, { text: 'QUERY:' }, { inlineData: { mimeType: 'image/jpeg', data: p.query } }]
  p.sheets.forEach((s: any, i: number) => { parts.push({ text: `BẢNG ${i + 1} (ô số ${s.from}–${s.to}):` }); parts.push({ inlineData: { mimeType: 'image/jpeg', data: s.img } }) })
  const body: any = { systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, maxOutputTokens: 4000, thinkingConfig: { thinkingLevel: 'low' } } }
  const send = () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  let r = await send()
  if (r.status === 400) { const t = await r.text(); if (/thinking/i.test(t)) { delete body.generationConfig.thinkingConfig; r = await send() } else throw new Error('Gemini 400: ' + t.slice(0, 800)) }
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 800)}`)
  const j = await r.json()
  const txt = (j.candidates?.[0]?.content?.parts ?? []).filter((x: any) => !x.thought && typeof x.text === 'string').map((x: any) => x.text).join('')
  return JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] ?? '{"picks":[]}')
}

async function claude(p: any, key: string) {
  const content: any[] = [{ type: 'text', text: prompt(p) }, { type: 'text', text: 'QUERY:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.query } }]
  p.sheets.forEach((s: any, i: number) => { content.push({ type: 'text', text: `BẢNG ${i + 1} (ô số ${s.from}–${s.to}):` }); content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: s.img } }) })
  const r = await fetch((Deno.env.get('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1500, system: SYSTEM, tools: [{ name: 'report_surface', description: 'Các ô mẫu cùng vân', input_schema: SCHEMA }], tool_choice: { type: 'tool', name: 'report_surface' }, messages: [{ role: 'user', content }] }),
  })
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 800)}`)
  const j = await r.json()
  return (j.content ?? []).find((b: any) => b.type === 'tool_use')?.input ?? { picks: [] }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const tok = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = await admin.auth.getUser(tok)
    const { data: me } = u?.user ? await admin.from('profiles').select('role,active').eq('id', u.user.id).maybeSingle() : { data: null }
    if (!me || !me.active || !['admin', 'editor'].includes(me.role)) return json({ error: 'Không có quyền dùng AI so vân' }, 403)
    const p = await req.json()
    if (!p?.query || !Array.isArray(p.sheets) || !p.sheets.length || p.sheets.length > 8) return json({ error: 'Thiếu ảnh' }, 400)
    const gk = Deno.env.get('GEMINI_API_KEY'), ck = Deno.env.get('ANTHROPIC_API_KEY'), pv = (Deno.env.get('AI_PROVIDER') ?? '').toLowerCase()
    const useClaude = pv === 'anthropic' ? true : pv === 'gemini' ? false : !!ck
    if (useClaude ? !ck : !gk) return json({ error: `Chưa cấu hình ${useClaude ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY'} trong Supabase → Edge Functions → Secrets` }, 500)
    const out = useClaude ? await claude(p, ck!) : await gemini(p, gk!)
    return json({ picks: Array.isArray(out.picks) ? out.picks : [] })
  } catch (e) { return json({ error: String(e) }, 500) }
})
