// Ghi PDF nhiều trang, mỗi trang là một ảnh JPEG (đủ cho trang dàn concept). Không cần thư viện ngoài.
const enc = (s: string) => new TextEncoder().encode(s)
export type PdfPageImg = { jpeg: Uint8Array; w: number; h: number; pt?: [number, number] }
export function jpegPdf(pages: PdfPageImg[]): Blob {
  const parts: Uint8Array[] = [], offs: number[] = []
  let len = 0
  const push = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc(b) : b; parts.push(u); len += u.length }
  const obj = (n: number) => { offs[n] = len }
  const N = 2 + pages.length * 3 // 1 catalog, 2 pages, rồi mỗi trang: page, content, image
  push('%PDF-1.4\n')
  obj(1); push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  obj(2); push(`2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>\nendobj\n`)
  pages.forEach((p, i) => {
    const pg = 3 + i * 3, ct = pg + 1, im = pg + 2
    // 1 px = 0.5 pt → trang 1920 px ≈ 960 pt (13.3 in), đủ nét khi in/chiếu
    const W = +(p.pt?.[0] ?? p.w * 0.5).toFixed(1), H = +(p.pt?.[1] ?? p.h * 0.5).toFixed(1)
    obj(pg); push(`${pg} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>\nendobj\n`)
    const cs = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`
    obj(ct); push(`${ct} 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}\nendstream\nendobj\n`)
    obj(im); push(`${im} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`); push(p.jpeg); push('\nendstream\nendobj\n')
  })
  const xref = len
  push(`xref\n0 ${N + 1}\n0000000000 65535 f \n`)
  for (let n = 1; n <= N; n++) push(String(offs[n]).padStart(10, '0') + ' 00000 n \n')
  push(`trailer\n<< /Size ${N + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}
