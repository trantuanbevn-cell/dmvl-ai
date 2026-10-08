import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadImage } from '../lib/crop'
import { uploadImage } from '../lib/imageUpload'
import { useAuth } from '../lib/auth'
import type { ProjectData } from '../lib/useProject'
import type { Entry } from '../lib/types'
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

/** Ô "Hình ảnh vật liệu": ảnh tải lên > ảnh link hãng > ô màu. Bấm ✎ để cắt vùng hoặc thay bằng ảnh từ máy */
export default function MatImage({ d, e }: { d: ProjectData; e: Entry }) {
  const { canEdit } = useAuth()
  const [ed, setEd] = useState(false)
  const [big, setBig] = useState(false)
  const up = e.mat_view?.img ? d.urls[e.mat_view.img] : undefined
  const src = up ?? e.product_image_url ?? undefined
  const region = e.mat_view?.region ?? null
  const save = async (r: EditorResult) => {
    let img = e.mat_view?.img ?? null
    if (r.file) img = await uploadImage(r.file, `${e.project_id}/mat/${e.id}-${Date.now()}.jpg`)
    const mv = (img || r.region) ? { img, region: r.region ?? null } : null
    const { error } = await supabase.from('entries').update({ mat_view: mv }).eq('id', e.id)
    if (error) throw new Error(error.message)
    await d.reload()
  }
  return (
    <div className="mat-wrap">
      {src ? <MatView url={src} region={region} onDouble={() => setBig(true)} />
        : e.color_hex ? <div className="mat-sw" style={{ background: e.color_hex }} title={e.color_hex}><span>{e.color_hex}</span></div>
        : <div className="ic-none tiny"><span>Chưa có mẫu</span></div>}
      {canEdit && <button className="crop-edit show" title="Cắt / thay ảnh vật liệu" onClick={ev => { ev.stopPropagation(); setEd(true) }}>✎</button>}
      {ed && <CropEditor mode="mat" baseUrl={src} matRegion={region} onSave={save} onClose={() => setEd(false)} />}
      {big && src && <div className="lightbox" onMouseDown={() => setBig(false)}><div className="lb-body"><MatView url={src} region={region} maxW={Math.round(window.innerWidth * 0.9)} maxH={Math.round(window.innerHeight * 0.85)} /></div></div>}
    </div>
  )
}
