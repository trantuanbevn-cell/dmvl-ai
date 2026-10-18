// Duyệt thư viện: bấm một mẫu để đặt (cửa, cột) hoặc áp lên mục đang chọn (tường, vật liệu hoàn thiện).
import { useMemo, useState } from 'react'
import { COL_LIB, DOOR_LIB, FINISHES, WALL_TYPES, finishOf, swatch, type DoorSpec, type Finish } from '../lib/plan3d/library'

const dataUrl = (() => { const m = new Map<string, string>(); return (f: Finish) => { const k = f.id + (f.img ?? ''); let u = m.get(k); if (!u) { u = f.img ?? swatch(f, 64).toDataURL(); m.set(k, u) } return u } })()

export default function LibraryBrowser({ custom, customDoors, onDoor, onWall, onCol, onFinish, onAddImage, onRemoveCustom, doorSel, wallSel, colSel, hint }: {
  custom: Finish[]; customDoors: DoorSpec[]; onDoor: (id: string) => void; onWall: (key: string) => void; onCol: (id: string) => void; onFinish: (f: Finish) => void
  onAddImage: (file: File, name: string, size: number, group: Finish['group']) => void; onRemoveCustom: (id: string) => void; doorSel?: string; wallSel?: string; colSel?: string; hint: string
}) {
  const [tab, setTab] = useState<'door' | 'wall' | 'col' | 'fin'>('door'), [grp, setGrp] = useState<string>('Sàn'), [q, setQ] = useState('')
  const [name, setName] = useState(''), [size, setSize] = useState('0.6')
  const doors = useMemo(() => [...customDoors, ...DOOR_LIB].filter(d => !q || d.name.toLowerCase().includes(q.toLowerCase())), [customDoors, q])
  const groups = ['Cửa đi', 'Cửa kính', 'Cửa sổ', 'Khác', 'Của tôi']
  const fins = useMemo(() => [...custom, ...FINISHES].filter(f => (grp === 'Tất cả' || f.group === grp) && (!q || f.name.toLowerCase().includes(q.toLowerCase()))), [custom, grp, q])
  const card = (on: boolean) => ({ border: '1px solid ' + (on ? '#e07000' : '#ddd'), borderRadius: 6, padding: 6, cursor: 'pointer', background: on ? '#fff4e8' : '#fff', display: 'grid', gap: 4, fontSize: 12 } as const)
  return <div className="card" style={{ display: 'grid', gap: 8 }}>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <div className="mp-tabs">{([['door', `Cửa & cửa sổ (${DOOR_LIB.length})`], ['wall', `Tường (${WALL_TYPES.length})`], ['col', `Cột (${COL_LIB.length})`], ['fin', `Vật liệu hoàn thiện (${FINISHES.length + custom.length})`]] as const).map(([k, l]) => <button key={k} className={'mp-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}</div>
      <input placeholder="Tìm trong thư viện…" value={q} onChange={e => setQ(e.target.value)} style={{ width: 180 }} />
      <span className="muted small">{hint}</span></div>
    {tab === 'door' && groups.map(g => { const l = doors.filter(d => (g === 'Của tôi' ? customDoors.includes(d) : d.group === g && !customDoors.includes(d))); return l.length ? <div key={g}><div className="small muted" style={{ margin: '2px 0 4px' }}>{g}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 6 }}>{l.map(d => <div key={d.id} style={card(doorSel === d.id)} onClick={() => onDoor(d.id)}>
        <div style={{ display: 'flex', gap: 4 }}><span style={{ width: 22, height: 22, flex: '0 0 22px', border: '1px solid #999', backgroundImage: `url(${dataUrl(finishOf(d.leafFinish, custom) ?? FINISHES[0])})`, backgroundSize: 'cover' }} /><b style={{ fontWeight: 600 }}>{d.name}</b></div>
        <div className="muted">{Math.round(d.w * 1000)} × {Math.round(d.h * 1000)}{d.sill ? ' · bệ ' + Math.round(d.sill * 1000) : ''}</div></div>)}</div></div> : null })}
    {tab === 'wall' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 6 }}>{WALL_TYPES.filter(w => !q || w.label.toLowerCase().includes(q.toLowerCase())).map(w => <div key={w.key} style={card(wallSel === w.key)} onClick={() => onWall(w.key)}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 22, height: 22, background: w.color, border: '1px solid #999' }} /><b style={{ fontWeight: 600 }}>{w.label}</b></div><div className="muted">Dày {Math.round(w.t * 1000)} mm · {w.layers.length} lớp</div></div>)}</div>}
    {tab === 'col' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 6 }}>{COL_LIB.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase())).map(c => <div key={c.id} style={card(colSel === c.id)} onClick={() => onCol(c.id)}><b style={{ fontWeight: 600 }}>{c.name}</b><div className="muted">{c.shape === 'round' ? 'Tròn' : 'Chữ nhật'} {Math.round(c.w * 1000)}{c.shape === 'rect' ? ' × ' + Math.round(c.d * 1000) : ''}</div></div>)}</div>}
    {tab === 'fin' && <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>{['Sàn', 'Trần', 'Tường', 'Cửa / khung', 'Của tôi', 'Tất cả'].map(g => <button key={g} className={'btn sm' + (grp === g ? ' primary' : '')} onClick={() => setGrp(g)}>{g}</button>)}
        <span className="muted small" style={{ marginLeft: 'auto' }}>Nạp ảnh vật liệu thật của bạn:</span><input placeholder="Tên vật liệu" value={name} onChange={e => setName(e.target.value)} style={{ width: 130 }} /><input title="Cạnh ảnh ngoài thực tế (m)" value={size} onChange={e => setSize(e.target.value)} style={{ width: 44 }} />m
        <label className="btn sm">＋ Chọn ảnh<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onAddImage(f, name || f.name.replace(/\.[^.]+$/, ''), parseFloat(size.replace(',', '.')) || 0.6, 'Của tôi'); e.target.value = '' }} /></label></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(112px,1fr))', gap: 6 }}>{fins.map(f => <div key={f.id} style={card(false)} onClick={() => onFinish(f)} title={f.name}>
        <img src={dataUrl(f)} alt="" style={{ width: '100%', height: 54, objectFit: 'cover', borderRadius: 3, border: '1px solid #ccc' }} /><div style={{ lineHeight: 1.2 }}>{f.name}</div>
        {f.group === 'Của tôi' && <button className="btn sm" onClick={e => { e.stopPropagation(); onRemoveCustom(f.id) }}>Xoá</button>}</div>)}</div></>}
  </div>
}
