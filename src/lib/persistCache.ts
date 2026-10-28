// Bộ nhớ đệm bền trong trình duyệt (IndexedDB) cho các bảng lớn (thư viện vật liệu hàng chục nghìn dòng…).
// Mỗi lần mở trang Thư viện / hộp tìm mẫu trước đây tải lại TOÀN BỘ bảng từ Supabase (hàng chục MB) → egress rất lớn.
// Giờ chỉ tải lại khi quá hạn (TTL) hoặc khi người dùng bấm làm mới / vừa thay đổi dữ liệu.
const DB = 'dmvl-cache-v1', STORE = 'kv'
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE) }
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    } catch (e) { rej(e) }
  })
}
async function getRaw<T>(key: string): Promise<{ t: number; v: T } | undefined> {
  try {
    const db = await open()
    return await new Promise(res => { const q = db.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result as { t: number; v: T } | undefined); q.onerror = () => res(undefined) })
  } catch { return undefined }
}
async function put(key: string, v: unknown) {
  try {
    const db = await open()
    await new Promise<void>(res => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put({ t: Date.now(), v }, key); tx.oncomplete = () => res(); tx.onerror = () => res(); tx.onabort = () => res() })
  } catch { /* không có IndexedDB / đầy bộ nhớ → bỏ qua, vẫn chạy bình thường */ }
}
export async function dropCache(...keys: string[]) {
  try {
    const db = await open()
    await new Promise<void>(res => { const tx = db.transaction(STORE, 'readwrite'); keys.forEach(k => tx.objectStore(STORE).delete(k)); tx.oncomplete = () => res(); tx.onerror = () => res(); tx.onabort = () => res() })
  } catch { /* bỏ qua */ }
}
/** Lấy từ bộ nhớ đệm nếu còn hạn; không thì tải mới bằng loader rồi lưu lại. force = bỏ qua đệm */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>, force = false): Promise<T> {
  if (!force) { const c = await getRaw<T>(key); if (c && Date.now() - c.t < ttlMs) return c.v }
  const v = await loader()
  void put(key, v)
  return v
}
