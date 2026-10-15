import { supabase } from './supabase'

/** Đọc occurrences của nhiều mã: lô nhỏ + phân trang (Supabase chỉ trả tối đa 1000 dòng/lần) */
export async function fetchOccurrences<T = any>(entryIds: string[], cols = '*'): Promise<T[]> {
  let out: T[] = []
  for (let i = 0; i < entryIds.length; i += 60) {
    const ids = entryIds.slice(i, i + 60)
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('occurrences').select(cols).in('entry_id', ids).order('id').range(from, from + 999)
      if (error) throw error
      out = out.concat((data ?? []) as T[])
      if ((data?.length ?? 0) < 1000) break
    }
  }
  return out
}
