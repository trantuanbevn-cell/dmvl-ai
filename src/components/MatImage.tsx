import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadImage } from '../lib/crop'
import { uploadImage } from '../lib/imageUpload'
import { useAuth } from '../lib/auth'
import type { ProjectData } from '../lib/useProject'
import type { Entry } from '../lib/types'
import { extrasOf, MAT_MAX } from '../lib/matImages'
import CropEditor, { type EditorResult } from './CropEditor'

/** Ảnh vật liệu: hiển thị ảnh (có thể cắt theo vùng region 0..1) vừa khung maxW × maxH */
export function MatView({ url, region, maxW = 96, maxH = 70, onDouble }: { url: string; region?: number[] | null; maxW?: number; maxH?: number; onDouble?: () => void }) {
  const [dim, setDim] = useState<[number, number] | null>(null)
  useEffect(() => { let off = false; loadImage(url).then(im => { if (!off) setDim([im.naturalWidth, im.naturalHeight]) }).catch(() => { if (!off) setDim(null) }); return () => { off = true } }, [url])
  if (!dim) return <img className="mat-img" src={url} alt="" style={{ maxWidth: maxW, maxHeight: maxH }} onDoubleClick={onDouble} />
  const [x, y, w, h] = region && region.length === 4 ? region : [0, 0, 1, 1]
  const ar = (w * dim[0]) / (h * dim[1])
  let cw = maxW, ch = cw / ar; if (ch > maxH) { ch = maxH; cw = ch * ar }
  return <div className="mat-img crop-like" onDoubleClick={onDouble} title="Kích đúp để xem to" style={{ width: cw, height: ch, backgroundImage: `url("${url}")`, backgroundSize: `${100 / w}% ${100 / h}%`, backgroundPosition: `${w >= 1 ? 0 : (x / (1 - w)) * 100}% ${h >= 1 ? 0 : (y / (1 - h)) * 100}%`, backgroundRepeat: 'no-repeat' }} />
}

/** Ô "Hình ảnh vật liệu": tối đa 3 ảnh (vd. bộ tranh 3 bức). Ảnh 1: ảnh tải lên > ảnh link hãng > ô màu; ảnh 2–3 là ảnh tải lên. Bấm ✎ để cắt vùng hoặc thay ảnh */
export default function MatImage({ d, e }: { d: ProjectData; e: Entry }) {
  const { canEdit } = useAuth()
  const [ed, setEd] = useState<number | null>(null)   // chỉ số ảnh đang sửa (0 = chính, 1–2 = ảnh phụ)
  const [big, setBig] = useState<string | null>(null)
  const extras = extrasOf(e)
  const up = e.mat_view?.img ? d.urls[e.mat_view.img] : undefined
  const src0 = up ?? e.product_image_url ?? undefined
  const slots = [{ src: src0, region: e.mat_view?.region ?? null }, ...extras.map(x => ({ src: x.img ? d.urls[x.img] : undefined, region: x.region ?? null }))]
  const multi = extras.length > 0, mw = multi ? 62 : 96, mh = multi ? 56 : 70
  const write = async (patch: Partial<Entry>) => {
    const { error } = await supabase.from('entries').update(patch).eq('id', e.id)
    if (error) throw new Error(error.message)
    await d.reload()
  }
  const save = async (r: EditorResult) => {
    const i = ed ?? 0
    if (i === 0) {
      let img = e.mat_view?.img ?? null
      if (r.file) img = await uploadImage(r.file, `${e.project_id}/mat/${e.id}-${Date.now()}.jpg`)
      await write({ mat_view: (img || r.region) ? { img, region: r.region ?? null } : null })
      return
    }
    const list = extras.slice()
    let img = list[i - 1]?.img ?? null
    if (r.file) img = await uploadImage(r.file, `${e.project_id}/mat/${e.id}-${i}-${Date.now()}.jpg`)
    if (!img) return
    list[i - 1] = { img, region: r.region ?? null }
    await write({ mat_extra: list })
  }
  const removeExtra = (i: number) => write({ mat_extra: extras.filter((_, j) => j !== i - 1) })
  const cur = ed != null ? slots[ed] : undefined
  return (
    <div className="mat-wrap">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
        {slots.map((s, i) => (
          <div key={i} style={{ position: 'relative' }}>
            {s.src ? <MatView url={s.src} region={s.region} maxW={mw} maxH={mh} onDouble={() => setBig(s.src!)} />
              : i === 0 && e.color_hex ? <div className="mat-sw" style={{ background: e.color_hex }} title={e.color_hex}><span>{e.color_hex}</span></div>
              : <div className="ic-none tiny"><span>Chưa có mẫu</span></div>}
            {canEdit && i > 0 && <button className="crop-edit show" style={{ right: 'auto', left: 0 }} title="Xoá ảnh này" onClick={ev => { ev.stopPropagation(); removeExtra(i) }}>✕</button>}
            {canEdit && <button className="crop-edit show" title="Cắt / thay ảnh vật liệu" onClick={ev => { ev.stopPropagation(); setEd(i) }}>✎</button>}
          </div>))}
      </div>
      {canEdit && slots.length < MAT_MAX && <button className="btn ghost sm" style={{ marginTop: 3 }} title="Thêm ảnh vật liệu (tối đa 3)" onClick={ev => { ev.stopPropagation(); setEd(slots.length) }}>＋ ảnh ({slots.length}/{MAT_MAX})</button>}
      {ed != null && <CropEditor mode="mat" baseUrl={cur?.src} matRegion={cur?.region ?? null} onSave={save} onClose={() => setEd(null)} />}
      {big && <div className="lightbox" onMouseDown={() => setBig(null)}><div className="lb-body"><MatView url={big} region={slots.find(s => s.src === big)?.region} maxW={Math.round(window.innerWidth * 0.9)} maxH={Math.round(window.innerHeight * 0.85)} /></div></div>}
    </div>
  )
}
