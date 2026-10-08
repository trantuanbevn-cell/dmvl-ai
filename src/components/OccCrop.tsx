import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uploadImage } from '../lib/imageUpload'
import { useAuth } from '../lib/auth'
import type { ProjectData } from '../lib/useProject'
import type { Occurrence } from '../lib/types'
import Crop from './Crop'
import CropEditor, { type EditorResult } from './CropEditor'

const dimCache = new Map<string, { w: number; h: number }>()
function useImgDims(url?: string) {
  const [dm, setDm] = useState(url ? dimCache.get(url) : undefined)
  useEffect(() => {
    if (!url) { setDm(undefined); return }
    const c = dimCache.get(url); if (c) { setDm(c); return }
    const im = new Image(); im.onload = () => { const v = { w: im.naturalWidth, h: im.naturalHeight }; dimCache.set(url, v); setDm(v) }; im.src = url
  }, [url])
  return dm
}

/** Ảnh crop của 1 lần xuất hiện (hạng mục trong phòng): đã áp phần người dùng chỉnh, và có nút ✎ để chỉnh vùng cắt / mũi tên / thay ảnh */
export default function OccCrop({ d, o, height = 64, maxWidth = 90, arrow = true, onClick, active }: { d: ProjectData; o: Occurrence; height?: number; maxWidth?: number; arrow?: boolean; onClick?: () => void; active?: boolean }) {
  const { canEdit } = useAuth()
  const [ed, setEd] = useState(false)
  const pg = o.page_id ? d.pages.find(p => p.id === o.page_id) : undefined
  const repl = o.view?.img ? d.urls[o.view.img] : undefined
  // ảnh tải từ máy (không thuộc trang concept) cũng được vẽ khung đỏ + mũi tên và chỉnh được như ảnh trang
  const standalone = !pg && !!repl
  const dims = useImgDims(standalone ? repl : undefined)
  const url = pg ? d.urls[pg.image_path] : standalone ? repl : undefined
  const pw = pg ? pg.width : dims?.w, ph = pg ? pg.height : dims?.h
  const vw = standalone ? { ...o.view, img: null } : o.view
  const can = canEdit && !!o.bbox && !!url && (!standalone || !!dims)
  const save = async (r: EditorResult) => {
    let img = r.keepImg || standalone ? o.view?.img ?? null : null
    if (r.file) img = await uploadImage(r.file, `${d.project!.id}/crops/${o.id}-${Date.now()}.jpg`)
    const view = r.view ? { ...r.view, img } : img ? { img } : null
    const patch: Record<string, unknown> = { view }
    if (r.bbox) patch.bbox = r.bbox.map(v => +v.toFixed(4))
    const { error } = await supabase.from('occurrences').update(patch).eq('id', o.id)
    if (error) throw new Error(error.message)
    await d.reload()
  }
  return (
    <span className="crop-wrap">
      <Crop url={url} bbox={o.bbox} pageW={pw} pageH={ph} height={height} maxWidth={maxWidth} arrow={arrow} onClick={onClick} active={active} view={vw} replUrl={standalone ? undefined : repl} onEdit={can ? () => setEd(true) : undefined} />
      {can && <button className="crop-edit" title="Chỉnh vùng cắt, mũi tên hoặc thay ảnh" onClick={ev => { ev.stopPropagation(); setEd(true) }}>✎</button>}
      {ed && <CropEditor mode="occ" baseUrl={url} bbox={o.bbox} pageW={pw} pageH={ph} view={vw} replUrl={standalone ? undefined : repl} onSave={save} onClose={() => setEd(false)} />}
    </span>
  )
}
