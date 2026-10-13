// Nhập thư viện vật liệu từ file .zip (manifest.json + img/*.jpg) – chỉ admin. Dữ liệu đi thẳng từ máy bạn lên Supabase.
import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Item = { kind?: string; brand?: string; code: string; name: string; line: string; pattern: string; file: string; key: string; extra?: Record<string, string>; name2?: string; attrs?: Record<string, string>; variants?: { sub: string; size: string; th: string; edge?: string | null; page?: number }[] }
const FAM: Record<string, string> = { 'Formica Laminate': 'Laminate', 'Formica Incanto': 'Incanto', 'Formica DecoMetal': 'DecoMetal' }

export default function LibraryImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [brand, setBrand] = useState('Formica'), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [pct, setPct] = useState(0)
  const run = async (f: File) => {
    setBusy(true); setMsg('Đang đọc file…'); setPct(0)
    try {
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(f)
      const man = JSON.parse(await zip.file('manifest.json')!.async('string')) as Item[]
      if (man.length && (man[0].variants || man[0].attrs) && !man[0].key) { // file bổ sung quy cách: chỉ cập nhật các mã đã có
        setMsg('Đang cập nhật quy cách…')
        const ex: { id: string; product_code: string; name: string | null; attrs: any }[] = []
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from('materials').select('id,product_code,name,attrs').eq('brand', brand).range(from, from + 999)
          if (error) throw error
          ex.push(...(data ?? []) as any); if (!data || data.length < 1000) break
        }
        const by = new Map<string, typeof ex>(); ex.forEach(r => by.set(r.product_code, [...(by.get(r.product_code) ?? []), r]))
        let n = 0, miss = 0
        for (let i = 0; i < man.length; i++) {
          const it = man[i], hit = by.get(it.code)
          if (!hit) { miss++; continue }
          for (const r of hit) {
            const vs = it.variants
            const extra = vs ? { finishes: [...new Set(vs.map(v => v.sub))].join(', '), catalog_page: [...new Set(vs.map(v => v.page).filter(Boolean))].join(', '), catalog_name: it.name, specs_from: 'Catalog Formica (2021/22, Incanto 2024, DecoMetal 2022)' } : {}
            const { error } = await supabase.from('materials').update({ ...(vs ? { variants: vs } : {}), ...(!r.name && it.name ? { name: it.name } : {}), attrs: { ...r.attrs, ...(it.attrs ?? {}), ...extra } }).eq('id', r.id)
            if (error) throw new Error('Lưu quy cách lỗi: ' + error.message)
            n++
          }
          if (i % 20 === 0) { setPct(Math.round(i / man.length * 100)); setMsg(`Đã cập nhật ${i}/${man.length}…`) }
        }
        setPct(100); setMsg(`✅ Xong: cập nhật quy cách cho ${n} mã (${miss} mã trong catalog chưa có ảnh map nên bỏ qua).`); onDone(); setBusy(false); return
      }
      let done = 0
      const rows: any[] = []
      for (let i = 0; i < man.length; i += 8) {
        await Promise.all(man.slice(i, i + 8).map(async x => {
          const ent = zip.file(`img/${x.key}.jpg`); if (!ent) return
          const blob = await ent.async('blob')
          const bd = x.brand || brand, sl = bd.toLowerCase().replace(/[^a-z0-9]+/g, '-'), path = `${sl}/map_${x.key}.jpg`
          const { error } = await supabase.storage.from('materials').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
          if (error && !/already exists|Duplicate/i.test(error.message)) throw new Error('Tải ảnh lỗi: ' + error.message)
          rows.push({ brand: bd, source_id: 'map/' + x.key, product_code: x.code, name: x.name || null, line: x.pattern, kind: x.kind || 'wood', url: null, image_url: null,
            tex_url: supabase.storage.from('materials').getPublicUrl(path).data.publicUrl,
            attrs: { family: FAM[x.line] ?? x.line, pattern: x.pattern, source_file: x.file, ...Object.fromEntries(Object.entries(x.extra ?? {}).filter(([, v]) => v)) }, variants: [], updated_at: new Date().toISOString() })
        }))
        done = Math.min(man.length, i + 8); setPct(Math.round(done / man.length * 100)); setMsg(`Đã tải ${done}/${man.length} ảnh…`)
      }
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from('materials').upsert(rows.slice(i, i + 100), { onConflict: 'brand,source_id' })
        if (error) throw new Error('Lưu danh sách lỗi: ' + error.message)
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
