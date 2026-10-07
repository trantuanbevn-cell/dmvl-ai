// Bộ chuyển đổi Gemini: nhận yêu cầu dạng Anthropic (đã dựng sẵn trong index.ts),
// gọi Gemini API (streamGenerateContent) và phát lại luồng SSE theo đúng định dạng sự kiện Anthropic,
// để trình duyệt không cần biết đang dùng nhà cung cấp nào.

const GEMINI_BASE = Deno.env.get('GEMINI_BASE_URL') ?? 'https://generativelanguage.googleapis.com'

function toBase64(bytes: Uint8Array): string {
  let s = ''
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH))
  return btoa(s)
}

async function imagePart(src: any) {
  if (src.type === 'base64') return { inlineData: { mimeType: src.media_type ?? 'image/jpeg', data: src.data } }
  const r = await fetch(src.url)
  if (!r.ok) throw new Error(`Không tải được ảnh (${r.status})`)
  const mime = (r.headers.get('content-type') ?? 'image/jpeg').split(';')[0]
  return { inlineData: { mimeType: mime, data: toBase64(new Uint8Array(await r.arrayBuffer())) } }
}

/** Chuyển request Anthropic → request Gemini */
export async function toGemini(a: any) {
  const parts: any[] = []
  const blocks = a.messages[0].content
  const imgs = await Promise.all(blocks.map((b: any) => (b.type === 'image' ? imagePart(b.source) : null)))
  blocks.forEach((b: any, i: number) => { if (b.type === 'text') parts.push({ text: b.text }); else if (imgs[i]) parts.push(imgs[i]) })

  const fns = (a.tools ?? []).filter((t: any) => t.input_schema).map((t: any) => ({ name: t.name, description: t.description, parameters: t.input_schema }))
  const wantsSearch = (a.tools ?? []).some((t: any) => String(t.type ?? '').startsWith('web_search'))
  const tools: any[] = []
  if (wantsSearch) tools.push({ google_search: {} })
  if (fns.length) tools.push({ functionDeclarations: fns })

  const body: any = {
    systemInstruction: { parts: [{ text: a.system }] },
    contents: [{ role: 'user', parts }],
    tools,
    generationConfig: { maxOutputTokens: Math.max(a.max_tokens ?? 8000, 8000) + 16000 },
  }
  if (fns.length) {
    body.toolConfig = a.tool_choice?.type === 'tool' && !wantsSearch
      ? { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [a.tool_choice.name] } }
      : { functionCallingConfig: { mode: 'AUTO' } }
  }
  return body
}

/** Lấy khối JSON từ văn bản (khi model trả JSON bằng chữ thay vì gọi công cụ) */
function jsonFromText(t: string): any | null {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/) ?? t.match(/(\{[\s\S]*\})/)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

/** Gọi Gemini và trả về ReadableStream SSE theo định dạng Anthropic */
export async function callGemini(anthropicReq: any, key: string, model: string): Promise<Response> {
  const body = await toGemini(anthropicReq)
  const fallbackTool = anthropicReq.tool_choice?.name ?? (anthropicReq.tools ?? []).find((t: any) => t.input_schema)?.name ?? 'result'
  const r = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok || !r.body) {
    const t = await r.text()
    throw new Error(`Gemini API ${r.status}: ${t.slice(0, 1500)}`)
  }

  const enc = new TextEncoder()
  const dec = new TextDecoder()
  const reader = r.body.getReader()
  let idx = 0
  let textOpen = -1
  let text = ''
  let toolEmitted = false
  let stop = 'end_turn'

  const stream = new ReadableStream({
    async start(ctrl) {
      const ev = (o: any) => ctrl.enqueue(enc.encode(`event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`))
      const closeText = () => { if (textOpen >= 0) { ev({ type: 'content_block_stop', index: textOpen }); textOpen = -1 } }
      const emitTool = (name: string, args: any) => {
        closeText()
        const i = idx++
        ev({ type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: `g${i}`, name, input: {} } })
        ev({ type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(args ?? {}) } })
        ev({ type: 'content_block_stop', index: i })
        toolEmitted = true
      }
      ev({ type: 'message_start', message: { model, role: 'assistant' } })
      let buf = ''
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          let k
          while ((k = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1)
            if (!line.startsWith('data:')) continue
            let chunk: any
            try { chunk = JSON.parse(line.slice(5).trim()) } catch { continue }
            if (chunk.error) { ev({ type: 'error', error: { message: `Gemini: ${chunk.error.message ?? JSON.stringify(chunk.error)}` } }); continue }
            const cand = chunk.candidates?.[0]
            for (const part of cand?.content?.parts ?? []) {
              if (part.thought) continue
              if (part.functionCall) emitTool(part.functionCall.name, part.functionCall.args)
              else if (typeof part.text === 'string' && part.text) {
                if (textOpen < 0) { textOpen = idx++; ev({ type: 'content_block_start', index: textOpen, content_block: { type: 'text', text: '' } }) }
                text += part.text
                ev({ type: 'content_block_delta', index: textOpen, delta: { type: 'text_delta', text: part.text } })
              }
            }
            const fr = cand?.finishReason
            if (fr) stop = fr === 'MAX_TOKENS' ? 'max_tokens' : fr === 'STOP' ? 'end_turn' : fr.toLowerCase()
            if (fr && !['STOP', 'MAX_TOKENS'].includes(fr)) ev({ type: 'error', error: { message: `Gemini dừng với lý do ${fr}` } })
          }
        }
        closeText()
        // Model trả JSON bằng chữ → chuyển thành kết quả công cụ
        if (!toolEmitted && text) { const j = jsonFromText(text); if (j) emitTool(fallbackTool, j) }
        ev({ type: 'message_delta', delta: { stop_reason: toolEmitted ? 'tool_use' : stop } })
        ev({ type: 'message_stop' })
      } catch (e) {
        ev({ type: 'error', error: { message: String(e) } })
      }
      ctrl.close()
    },
  })
  return new Response(stream)
}
