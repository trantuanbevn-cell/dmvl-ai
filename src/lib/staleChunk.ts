/** Tab mở từ bản cũ: file lazy (OpenCV…) đã đổi tên sau khi cập nhật → tải lỗi. Tự tải lại trang đúng 1 lần để lấy bản mới. */
export const isChunkError = (e: unknown) => /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(String((e as Error)?.message ?? e))
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem('dmvl_chunk_reload') ?? 0)
    if (Date.now() - last < 60000) return false
    sessionStorage.setItem('dmvl_chunk_reload', String(Date.now()))
  } catch { /* */ }
  const u = new URL(location.href); u.searchParams.set('v', String(Date.now())); location.replace(u.toString())
  return true
}
