import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { toast } from './toast'
import { newDeck, type Deck } from './deck'
import type { ProjectData } from './useProject'

/** Bộ trang của dự án concept (projects.deck), lưu tự động sau 0,7 giây */
export function useDeck(d: ProjectData) {
  const pid = d.project?.id ?? ''
  const [deck, setDeck] = useState<Deck>(() => ((d.project as any)?.deck as Deck) ?? newDeck('westin'))
  const timer = useRef<number | undefined>(), dirty = useRef(false)
  useEffect(() => { if (!dirty.current) setDeck(((d.project as any)?.deck as Deck) ?? newDeck('westin')) }, [pid]) // eslint-disable-line
  const update = (fn: (x: Deck) => Deck) => setDeck(cur => {
    const next = fn(cur); dirty.current = true
    clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => { const { error } = await supabase.from('projects').update({ deck: next }).eq('id', pid); if (error) toast('Lưu lỗi: ' + error.message); else dirty.current = false }, 700)
    return next
  })
  return { deck, update }
}
