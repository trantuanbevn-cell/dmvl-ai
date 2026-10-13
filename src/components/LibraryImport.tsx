// Nhập thư viện vật liệu từ file .zip (manifest.json + img/*.jpg) – chỉ admin. Dữ liệu đi thẳng từ máy bạn lên Supabase.
import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Item = { code: string; name: string; line: string; pattern: string; file: string; key: string }
const FAM: Record<string, string> = { 'Formica Laminate': 'Laminate', 'Formica Incanto': 'Incanto', 'Formica DecoMetal': 'DecoMetal' }

export default function LibraryImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [brand, setBrand] = useState('Formica'), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [pct, setPct] = useState(0)
  const run = async (f: File) => {
    setBusy(true); setMsg('Đang đọc file…'); setPct(0)
    try {
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(f)
      const man = JSON.parse(await zip.file('manifest.json')!.async('string')) as Item[]
      const slug = brand.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      let done = 0
      const rows: any[] = []
      for (let i = 0; i < man.length; i += 8) {
        await Promise.all(man.slice(i, i + 8).map(async x => {
          const ent = zip.file(`img/${x.key}.jpg`); if (!ent) return
          const blob = await ent.async('blob')
          const path = `${slug}/map_${x.key}.jpg`
          const { error } = await supabase.storage.from('materials').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
          if (error) throw error
          rows.push({ brand, source_id: 'map/' + x.key, product_code: x.code, name: x.name || null, line: x.pattern, kind: 'wood', url: null, image_url: null,
            tex_url: supabase.storage.from('materials').getPublicUrl(path).data.publicUrl,
            attrs: { family: FAM[x.line] ?? x.line, pattern: x.pattern, source_file: x.file }, variants: [], updated_at: new Date().toISOString() })
        }))
        done = Math.min(man.length, i + 8); setPct(Math.round(done / man.length * 100)); setMsg(`Đã tải ${done}/${man.length} ảnh…`)
      }
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from('materials').upsert(rows.slice(i, i + 100), { onConflict: 'brand,source_id' })
        if (error) throw error
      }
      setMsg(`✅ Xong: nhập ${rows.length} mã ${brand}.`); onDone()
    } catch (e: any) { setMsg('⚠ ' + String(e.message ?? e)) }
    setBusy(false)
  }
  return (
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ width: 'min(520px, 96vw)' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3>Nhập thư viện từ file</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <label className="small">Tên hãng <input value={brand} onChange={e => setBrand(e.target.value)} style={{ width: 160 }} /></label>
        <input type="file" accept=".zip" disabled={busy || !brand.trim()} onChange={e => e.target.files?.[0] && run(e.target.files[0])} />
        {busy && <div style={{ height: 6, background: '#eee', borderRadius: 3 }}><div style={{ width: pct + '%', height: 6, background: 'var(--brown)', borderRadius: 3 }} /></div>}
        {msg && <div className="small">{msg}</div>}
        <div className="small muted">File .zip gồm manifest.json và thư mục img/ (ví dụ pack.zip Formica đã chuẩn bị).</div>
      </div>
    </div>
  )
}
