import { supabase } from './supabase'
import { DEFAULT_CHECKLIST, DEFAULT_RULES, DEFAULT_PERF, CheckItem, Rule, Perf } from './rules'

export type Settings = { checklist: CheckItem[]; rules: Rule[]; perf: Perf[] }
export async function loadSettings(): Promise<Settings> {
  const { data } = await supabase.from('app_settings').select('key,value')
  const m = new Map((data ?? []).map(r => [r.key, r.value]))
  return {
    checklist: (m.get('checklist') as CheckItem[]) ?? DEFAULT_CHECKLIST,
    rules: (m.get('rules') as Rule[]) ?? DEFAULT_RULES,
    perf: (m.get('perf') as Perf[]) ?? DEFAULT_PERF,
  }
}
export async function saveSetting(key: 'checklist' | 'rules' | 'perf', value: unknown) {
  const { error } = await supabase.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() })
  if (error) throw error
}
