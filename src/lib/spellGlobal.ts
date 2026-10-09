// Tự kiểm chính tả + dấu câu cho MỌI ô nhập văn bản trong phần mềm: khi rời khỏi ô (blur) thì tự sửa.
// Ô có thể khai báo data-lang="vn" | "en" | "name" (chỉ dấu câu) | "none" (bỏ qua). Ô không khai báo: tự nhận ra tiếng Việt qua dấu.
import { fixText, detectLang, loadEnglish, englishReady, type SpellLang, type Fix } from './spell'
import { toast } from './toast'

const SKIP_PH = /mật khẩu|password|email|tên đăng nhập|http|url|link|mã |code|tìm|search|lọc/i
function setNative(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
const summary = (fx: Fix[]) => {
  const spell = fx.filter(f => f.kind === 'spell' || f.kind === 'tone'), other = fx.length - spell.length
  const parts = spell.slice(0, 3).map(f => `“${f.from}” → “${f.to}”`)
  return `✎ Đã tự sửa${parts.length ? ': ' + parts.join(', ') + (spell.length > 3 ? '…' : '') : ' dấu câu / khoảng trắng'}${parts.length && other ? ' + dấu câu' : ''}`
}

function onFocusOut(ev: FocusEvent) {
  const el = ev.target
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
  if (el.readOnly || el.disabled) return
  if (el instanceof HTMLInputElement && el.type !== 'text') return
  const mode = el.dataset.lang
  if (mode === 'none' || el.closest('[data-nospell]')) return
  const ac = el.autocomplete
  if (ac === 'username' || ac === 'email' || ac === 'current-password' || ac === 'new-password') return
  const value = el.value
  if (!value || value.length < 3 || /^https?:\/\//i.test(value)) return
  if (!mode && SKIP_PH.test(el.placeholder ?? '')) return
  const lang: SpellLang = mode === 'vn' ? 'vi' : mode === 'en' ? 'en' : mode === 'name' ? null : detectLang(value)
  const natural = mode === 'vn' || mode === 'en' || el.dataset.cap !== undefined
  const r = fixText(value, lang, { cap: natural })
  if (r.text !== value) { setNative(el, r.text); toast(summary(r.fixes), 'ok') }
  if (r.flags.length) el.setAttribute('data-spell-warn', r.flags.map(f => f.word + (f.suggestions[0] ? ` → ${f.suggestions[0]}` : '')).join('; '))
  else el.removeAttribute('data-spell-warn')
}

let on = false
/** Gọi một lần khi mở app: bật bộ tự sửa toàn cục và nạp từ điển tiếng Anh ở nền */
export function installSpellGlobal() {
  if (on) return; on = true
  document.addEventListener('focusout', onFocusOut, true)
  setTimeout(() => { if (!englishReady()) loadEnglish() }, 1500)
}
