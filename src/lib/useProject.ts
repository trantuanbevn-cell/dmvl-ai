import { useCallback, useEffect, useState } from 'react'
import { supabase, signedUrls } from './supabase'
import type { Project, Room, Page, Entry, Occurrence, Warning } from './types'

export type ProjectData = {
  project: Project | null; rooms: Room[]; pages: Page[]; entries: Entry[]; occ: Occurrence[]; warnings: Warning[]
  urls: Record<string, string>; loading: boolean; reload: () => Promise<void>
}

export function useProject(id: string): ProjectData {
  const [s, setS] = useState<Omit<ProjectData, 'reload'>>({ project: null, rooms: [], pages: [], entries: [], occ: [], warnings: [], urls: {}, loading: true })
  const reload = useCallback(async () => {
    const [p, r, pg, e, w] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('rooms').select('*').eq('project_id', id).order('sort'),
      supabase.from('pages').select('*').eq('project_id', id).order('page_no'),
      supabase.from('entries').select('*').eq('project_id', id).order('code'),
      supabase.from('warnings').select('*').eq('project_id', id),
    ])
    const entries = (e.data ?? []) as Entry[]
    let occ: Occurrence[] = []
    // lấy occurrences theo lô để tránh URL quá dài
    for (let i = 0; i < entries.length; i += 150) {
      const { data } = await supabase.from('occurrences').select('*').in('entry_id', entries.slice(i, i + 150).map(x => x.id))
      occ = occ.concat((data ?? []) as Occurrence[])
    }
    const pages = (pg.data ?? []) as Page[]
    const paths = pages.flatMap(x => [x.image_path, x.thumb_path].filter(Boolean) as string[])
    const urls = paths.length ? await signedUrls(paths) : {}
    setS({ project: p.data as Project, rooms: (r.data ?? []) as Room[], pages, entries, occ, warnings: (w.data ?? []) as Warning[], urls, loading: false })
  }, [id])
  useEffect(() => { reload() }, [reload])
  return { ...s, reload }
}
