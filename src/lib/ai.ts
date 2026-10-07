import { supabase, FUNCTIONS_URL } from './supabase'

export type AIResult = { tool: Record<string, any> | null; toolName: string | null; text: string; stop_reason: string | null }

/**
 * Gọi Edge Function "ai" và đọc luồng SSE của Claude.
 * Trả về input của công cụ (tool_use) cuối cùng – đó là kết quả có cấu trúc.
 */
export async function callAI(task: string, payload: unknown, onProgress?: (chars: number) => void): Promise<AIResult> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${FUNCTIONS_URL}/ai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ task, payload }),
  })
  if (!res.ok || !res.body) {
    let msg = `${res.status}`
    try { const j = await res.json(); msg = j.error ?? j.message ?? JSON.stringify(j) } catch { /* */ }
    throw new Error(`AI (${task}) lỗi: ${msg}`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  const blocks: Record<number, { type: string; name?: string; json: string; text: string }> = {}
  let stop: string | null = null
  let total = 0
  let lastTool: { name: string; input: any } | null = null
  let text = ''
  let errMsg: string | null = null

  const handle = (ev: any) => {
    switch (ev.type) {
      case 'content_block_start':
        blocks[ev.index] = { type: ev.content_block.type, name: ev.content_block.name, json: '', text: ev.content_block.text ?? '' }
        break
      case 'content_block_delta': {
        const b = blocks[ev.index]; if (!b) break
        if (ev.delta.type === 'input_json_delta') { b.json += ev.delta.partial_json; total += ev.delta.partial_json.length }
        else if (ev.delta.type === 'text_delta') { b.text += ev.delta.text; total += ev.delta.text.length }
        onProgress?.(total)
        break
      }
      case 'content_block_stop': {
        const b = blocks[ev.index]; if (!b) break
        if (b.type === 'tool_use' && b.name) {
          try { lastTool = { name: b.name, input: b.json ? JSON.parse(b.json) : {} } } catch (e) { errMsg = 'Không đọc được JSON từ AI: ' + String(e) }
        }
        if (b.type === 'text') text += b.text
        break
      }
      case 'message_delta':
        if (ev.delta?.stop_reason) stop = ev.delta.stop_reason
        break
      case 'error':
        errMsg = ev.error?.message ?? 'AI stream error'
        break
    }
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2)
      const line = chunk.split('\n').find(l => l.startsWith('data:'))
      if (!line) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try { handle(JSON.parse(data)) } catch { /* bỏ qua dòng lỗi */ }
    }
  }
  if (errMsg) throw new Error(errMsg)
  if (stop === 'max_tokens') console.warn('AI output truncated (max_tokens) for', task)
  const lt = lastTool as { name: string; input: any } | null
  return { tool: lt?.input ?? null, toolName: lt?.name ?? null, text, stop_reason: stop }
}

/** Nhà cung cấp AI đang dùng (đổi bằng Secrets AI_PROVIDER trong Supabase) */
export async function aiInfo(): Promise<{ provider: string; model: string; search_model?: string } | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(`${FUNCTIONS_URL}/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify({ task: 'info' }),
    })
    return r.ok ? await r.json() : null
  } catch { return null }
}
