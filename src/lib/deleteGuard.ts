// Chặn xoá nhầm / xoá do người khác dùng tài khoản admin: hỏi thêm mật khẩu xoá (mặc định 204290). Chỉ lưu mã băm SHA-256, không lưu chữ thường.
const HASH = 'c9ac2173f7a9dfb94f1b4827f35d74f1b73a6f2299d61cb41645842ea24b9d1a'
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('')
/** true nếu người dùng xác nhận và nhập đúng mật khẩu xoá */
export async function confirmDelete(what: string): Promise<boolean> {
  if (!confirm(`Xoá ${what} và toàn bộ dữ liệu?`)) return false
  const pw = prompt('Nhập mật khẩu xoá để xác nhận:')
  if (pw === null) return false
  if ((await sha(pw.trim())) !== HASH) { alert('Sai mật khẩu xoá. Không xoá gì cả.'); return false }
  return true
}
