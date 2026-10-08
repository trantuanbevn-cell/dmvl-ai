import { supabase, BUCKET } from './supabase'

/** Ảnh người dùng tải lên: thu nhỏ (cạnh dài ≤ 1600px) → JPEG → lưu vào storage, trả về đường dẫn */
export async function uploadImage(file: File, path: string, maxEdge = 1600): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const im = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Không đọc được file ảnh')); i.src = url })
    const r = Math.min(1, maxEdge / Math.max(im.naturalWidth, im.naturalHeight))
    const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * r); c.height = Math.round(im.naturalHeight * r)
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height)
    const blob: Blob = await new Promise((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('Không nén được ảnh'))), 'image/jpeg', 0.9))
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (error) throw new Error(error.message)
    return path
  } finally { URL.revokeObjectURL(url) }
}
