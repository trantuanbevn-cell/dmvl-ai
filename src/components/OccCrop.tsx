import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { uploadImage } from '../lib/imageUpload'
import { useAuth } from '../lib/auth'
import type { ProjectData } from '../lib/useProject'
import type { Occurrence } from '../lib/types'
import Crop from './Crop'
import CropEditor, { type EditorResult } from './CropEditor'

/** Ảnh crop của 1 lần xuất hiện (hạng mục trong phòng): đã áp phần người dùng chỉnh, và có nút ✎ để chỉnh vùng cắt / mũi tên / thay ảnh */
export default function OccCrop({ d, o, height = 64, maxWidth = 90, arrow = true, onClick, active }: { d: ProjectData; o: Occurrence; height?: number; maxWidth?: number; arrow?: boolean; onClick?: () => void; active?: boolean }) {
  const { canEdit } = useAuth()
  const [ed, setEd] = useState(false)
  const pg = o.page_id ? d.pages.find(p => p.id === o.page_id) : undefined
  const url = pg ? d.urls[pg.image_path] : undefined
  const repl = o.view?.img ? d.urls[o.view.img] : undefined
  const can = canEdit && !!o.bbox && !!url
  const save = async (r: EditorResult) => {
    let img = r.keepImg ? o.view?.img ?? null : null
    if (r.file) img = await uploadImage(r.file, `${d.project!.id}/crops/${o.id}-${Date.now()}.jpg`)
    const view = r.view ? { ...r.view, img } : img ? { img } : null
    const { error } = await supabase.from('occurrences').update({ view }).eq('id', o.id)
    if (error) throw new Error(error.message)
    await d.reload()
  }
  return (
    <span className="crop-wrap">
      <Crop url={url} bbox={o.bbox} pageW={pg?.width} pageH={pg?.height} height={height} maxWidth={maxWidth} arrow={arrow} onClick={onClick} active={active} view={o.view} replUrl={repl} onEdit={can ? () => setEd(true) : undefined} />
      {can && <button className="crop-edit" title="Chỉnh vùng cắt, mũi tên hoặc thay ảnh" onClick={ev => { ev.stopPropagation(); setEd(true) }}>✎</button>}
      {ed && <CropEditor mode="occ" baseUrl={url} bbox={o.bbox} pageW={pg?.width} pageH={pg?.height} view={o.view} replUrl={repl} onSave={save} onClose={() => setEd(false)} />}
    </span>
  )
}
