import { useState } from 'react'
import type { ProjectData } from '../lib/useProject'
import type { PaperSize } from '../lib/deck'
import { usePlanPaint, useSheet } from '../lib/planSheet'
import FloorPlans from './FloorPlans'
import PlanPainter from './PlanPainter'
import ConceptSheet from './ConceptSheet'

const STAGES = [['pdf', '① Tải PDF mặt bằng'], ['paint', '② Tô màu · gộp · tách · đặt tên phòng'], ['sheet', '③ Trang mặt bằng tổng (bố cục + xuất)']] as const
type Stage = (typeof STAGES)[number][0]

/** Trang đặc biệt “Mặt bằng tổng”: từ PDF AutoCAD vector → tô màu sàn từng phòng, gộp/tách, đo diện tích, đặt tên → tờ mặt bằng tổng có ô tên nét đứt */
export default function MasterPlan({ d, size }: { d: ProjectData; size: PaperSize }) {
  const floors = d.floors
  const [stage, setStageRaw] = useState<Stage>(() => { try { return (sessionStorage.getItem('mp-stage') as Stage) || 'pdf' } catch { return 'pdf' } })
  const setStage = (s: Stage) => { setStageRaw(s); try { sessionStorage.setItem('mp-stage', s) } catch { /* bỏ qua */ } }
  const [fid, setFid] = useState(floors[0]?.id ?? '')
  const fp = floors.find(f => f.id === fid) ?? floors[0]
  const { pp, busy } = usePlanPaint(stage === 'pdf' ? undefined : fp)
  const { sheet, commit } = useSheet(fp, d)
  const st: Stage = floors.length ? stage : 'pdf'
  return (
    <div className="card concept">
      <div className="row between wrap"><h3 style={{ margin: 0 }}>Mặt bằng tổng <span className="muted small">– tờ mặt bằng lớn: tô màu từng phòng, gộp/tách, đo diện tích, đặt tên</span></h3>
        {floors.length > 0 && <select value={fp.id} onChange={e => setFid(e.target.value)}>{floors.map(f => <option key={f.id} value={f.id}>{f.floor_label}</option>)}</select>}</div>
      <div className="mp-tabs">{STAGES.map(([k, l]) => <button key={k} className={'mp-tab' + (st === k ? ' on' : '')} disabled={k !== 'pdf' && !floors.length} onClick={() => setStage(k)}>{l}</button>)}</div>
      {st === 'pdf' && <FloorPlans d={d} concept />}
      {st === 'paint' && fp && <PlanPainter key={fp.id} d={d} fp={fp} sheet={sheet} commit={commit} pp={pp} busy={busy} />}
      {st === 'sheet' && fp && <ConceptSheet key={fp.id} d={d} fp={fp} sheet={sheet} commit={commit} pp={pp} busy={busy} size={size} />}
    </div>)
}
