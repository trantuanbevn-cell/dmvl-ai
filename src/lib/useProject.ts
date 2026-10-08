import { setNameOverrides } from './sections'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, signedUrls } from './supabase'
import { toast } from './toast'
import type { Project, Room, Page, Entry, Occurrence, Warning, FloorPlan } from './types'

export type ProjectData = {
  project: Project | null; rooms: Room[]; pages: Page[]; entries: Entry[]; occ: Occurrence[]; warnings: Warning[]; floors: FloorPlan[]
  urls: Record<string, string>; loading: boolean; reload: () => Promise<void>
}

export function useProject(id: string): ProjectData {
  const [s, setS] = useState<Omit<ProjectData, 'reload'>>({ project: null, rooms: [], pages: [], entries: [], occ: [], warnings: [], floors: [], urls: {}, loading: true })
  const reload = useCallback(async () => {
    const [p, r, pg, e, w, fl] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('rooms').select('*').eq('project_id', id).order('sort'),
      supabase.from('pages').select('*').eq('project_id', id).order('page_no'),
      supabase.from('entries').select('*').eq('project_id', id).order('code'),
      supabase.from('warnings').select('*').eq('project_id', id),
      supabase.from('floor_plans').select('*').eq('project_id', id).order('created_at'),
    ])
    const entries = (e.data ?? []) as Entry[]
    let occ: Occurrence[] = []
    // lấy occurrences theo lô để tránh URL quá dài
    for (let i = 0; i < entries.length; i += 150) {
      const { data } = await supabase.from('occurrences').select('*').in('entry_id', entries.slice(i, i + 150).map(x => x.id))
      occ = occ.concat((data ?? []) as Occurrence[])
    }
    const pages = (pg.data ?? []) as Page[]
    const floors = (fl.data ?? []) as FloorPlan[]
    const paths = [...pages.flatMap(x => [x.image_path, x.thumb_path].filter(Boolean) as string[]), ...floors.map(f => f.preview_path).filter(Boolean) as string[],
      ...occ.map(o => o.view?.img).filter(Boolean) as string[], ...entries.map(e => e.mat_view?.img).filter(Boolean) as string[]]
    const urls = paths.length ? await signedUrls(paths) : {}
    setNameOverrides((p.data as any)?.section_names)
    setS({ project: p.data as Project, rooms: (r.data ?? []) as Room[], pages, entries, occ, warnings: (w.data ?? []) as Warning[], floors, urls, loading: false })
  }, [id])
  useEffect(() => { reload() }, [reload])
  // Đồng bộ trực tiếp: ai sửa gì, mọi người thấy ngay (gộp nhiều thay đổi liên tiếp thành 1 lần tải lại)
  const roomsRef = useRef<Room[]>([])
  roomsRef.current = s.rooms
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const bump = () => { clearTimeout(t); t = setTimeout(() => { reload() }, 1200) }
    const ch = supabase.channel('proj-' + id)
    for (const table of ['rooms', 'entries', 'occurrences', 'warnings', 'pages', 'floor_plans'])
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, (p: any) => {
        if (table === 'rooms' && p.eventType === 'UPDATE' && p.new?.project_id === id) {
          const old = roomsRef.current.find(r => r.id === p.new.id)
          if (old && old.work_status !== p.new.work_status && p.new.work_status === 'done') toast(`✓ ${p.new.work_by || 'Một thành viên'} đã hoàn thành phòng ${p.new.code} ${p.new.name_vn}`, 'ok')
          else if (old && old.work_status !== p.new.work_status && p.new.work_status === 'doing') toast(`${p.new.work_by || 'Một thành viên'} nhận làm phòng ${p.new.code} ${p.new.name_vn}`)
        }
        bump()
      })
    ch.subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(ch) }
  }, [id, reload])
  return { ...s, reload }
}
