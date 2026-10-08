import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clampBox, contextRegion, defaultArrowPage, type CropViewT } from '../lib/crop'
import { CropView } from './Crop'
import { MatView } from './MatImage'

type Drag = { kind: string; sx: number; sy: number; region: number[]; bb: number[] }
const cl = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const MIN = 0.03

export type EditorResult = { bbox?: number[]; view?: CropViewT | null; keepImg?: boolean; region?: number[] | null; file?: File | null; removeImg?: boolean }

/** Chỉnh ảnh: kéo khung vùng cắt trên ảnh gốc, kéo mũi tên đỏ, hoặc thay bằng ảnh khác từ máy.
 *  mode 'occ' = ảnh phối cảnh của 1 hạng mục (nền: ảnh trang concept); mode 'mat' = ảnh vật liệu (nền: ảnh mẫu) */
export default function CropEditor({ mode, baseUrl, bbox, pageW, pageH, view, replUrl, matRegion, onSave, onClose }: {
  mode: 'occ' | 'mat'; baseUrl?: string; bbox?: number[] | null; pageW?: number | null; pageH?: number | null
  view?: CropViewT | null; replUrl?: string; matRegion?: number[] | null
  onSave: (r: EditorResult) => Promise<void>; onClose: () => void
}) {
  const occ = mode === 'occ'
  const [ob, setOb] = useState<number[] | null>(bbox ? [...clampBox(bbox)] : null)   // vị trí vật liệu (kéo được)
  const defReg = useMemo(() => { if (!occ) return [0, 0, 1, 1]; const r = contextRegion(ob!); return [r.rx, r.ry, r.rw, r.rh] }, [occ, ob])
  const init = occ ? (view?.region?.length === 4 ? view.region : defReg) : (matRegion?.length === 4 ? matRegion : defReg)
  const [region, setRegion] = useState<number[]>([...init])
  const [custom, setCustom] = useState<{ tail: number[]; tip: number[] } | null>(view?.arrow ? { tail: [...view.arrow.tail], tip: [...view.arrow.tip] } : null)
  const [noArrow, setNoArrow] = useState(!!view?.noArrow)
  const [file, setFile] = useState<File | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [keep, setKeep] = useState(occ ? !!(view?.img && replUrl) : false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl) }, [fileUrl])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  const replacing = occ ? (!!file || keep) : false
  const shownUrl = occ ? (file ? fileUrl! : keep ? replUrl : baseUrl) : (fileUrl ?? baseUrl)
  const reg = { rx: region[0], ry: region[1], rw: region[2], rh: region[3] }
  const arrow = custom ?? (occ ? defaultArrowPage(ob!, reg) : null)

  const pt = (e: { clientX: number; clientY: number }) => { const r = box.current!.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] }
  const start = (kind: string) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const [x, y] = pt(e)
    if ((kind === 'tail' || kind === 'tip') && !custom && arrow) setCustom({ tail: [...arrow.tail], tip: [...arrow.tip] })
    setDrag({ kind, sx: x, sy: y, region: [...region], bb: ob ? [...ob] : [0, 0, 1, 1] })
  }
  useEffect(() => {
    if (!drag) return
    const mv = (e: PointerEvent) => {
      const [x, y] = pt(e), dx = x - drag.sx, dy = y - drag.sy, [rx, ry, rw, rh] = drag.region
      if (drag.kind.startsWith('o:')) {
        const [bx, by, bw, bh] = drag.bb, k = drag.kind.slice(2), OM = 0.02
        let nb: number[]
        if (k === 'move') nb = [cl(bx + dx, 0, 1 - bw), cl(by + dy, 0, 1 - bh), bw, bh]
        else {
          let l = bx, t = by, r = bx + bw, b = by + bh
          if (k.includes('l')) l = cl(bx + dx, 0, r - OM)
          if (k.includes('r')) r = cl(r + dx, l + OM, 1)
          if (k.includes('t')) t = cl(by + dy, 0, b - OM)
          if (k.includes('b')) b = cl(b + dy, t + OM, 1)
          nb = [l, t, r - l, b - t]
        }
        setOb(nb)
        // vùng cắt đang ở chế độ tự động thì đi theo vị trí mới của vật liệu
        const oldReg = contextRegion(drag.bb), od = [oldReg.rx, oldReg.ry, oldReg.rw, oldReg.rh]
        if (drag.region.every((v, i) => Math.abs(v - od[i]) < 0.003)) { const nr = contextRegion(nb); setRegion([nr.rx, nr.ry, nr.rw, nr.rh]) }
      }
      else if (drag.kind === 'move') setRegion([cl(rx + dx, 0, 1 - rw), cl(ry + dy, 0, 1 - rh), rw, rh])
      else if (drag.kind === 'tail' || drag.kind === 'tip') setCustom(c => (c ? { ...c, [drag.kind]: [cl(x, 0, 1), cl(y, 0, 1)] } : c))
      else {
        let l = rx, t = ry, r = rx + rw, b = ry + rh
        if (drag.kind.includes('l')) l = cl(rx + dx, 0, r - MIN)
        if (drag.kind.includes('r')) r = cl(r + dx, l + MIN, 1)
        if (drag.kind.includes('t')) t = cl(ry + dy, 0, b - MIN)
        if (drag.kind.includes('b')) b = cl(b + dy, t + MIN, 1)
        setRegion([l, t, r - l, b - t])
      }
    }
    const up = () => setDrag(null)
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  const pick = (f?: File | null) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return alert('Hãy chọn file ảnh (JPG, PNG, WebP…)')
    setFile(f); setFileUrl(URL.createObjectURL(f)); setKeep(false)
    if (!occ) setRegion([0, 0, 1, 1])
  }
  const reset = () => { setOb(bbox ? [...clampBox(bbox)] : null); setRegion(occ && bbox ? (() => { const r = contextRegion(clampBox(bbox)); return [r.rx, r.ry, r.rw, r.rh] })() : [0, 0, 1, 1]); setCustom(null); setNoArrow(false); setFile(null); setFileUrl(null); setKeep(false) }
  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 0.003)

  const tempBb = ob ?? bbox
  const tempView: CropViewT = { region: near(region, defReg) ? null : region, arrow: custom, noArrow, img: replacing ? 'x' : null }
  const save = async () => {
    setBusy(true)
    try {
      if (occ) {
        const v: CropViewT = { region: near(region, defReg) ? null : region, arrow: custom, noArrow: noArrow || undefined }
        const empty = !v.region && !v.arrow && !v.noArrow && !replacing
        await onSave({ view: empty ? null : v, keepImg: keep && !file, file, bbox: ob ?? undefined })
      } else await onSave({ region: near(region, [0, 0, 1, 1]) ? null : region, file, removeImg: !file && !baseUrl })
      onClose()
    } catch (e: any) { alert(e.message ?? String(e)) }
    setBusy(false)
  }

  const [rx, ry, rw, rh] = region
  const pc = (v: number) => `${v * 100}%`
  const bb = occ && ob ? ob : null
  const showOverlay = !!shownUrl && !replacing
  return createPortal(
    <div className="lightbox editor-bg" onMouseDown={onClose}>
      <div className="editor" onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3 style={{ margin: 0 }}>{occ ? 'Chỉnh ảnh phối cảnh của hạng mục' : 'Chỉnh ảnh vật liệu'}</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div className="editor-main">
          <div className="editor-stage">
            {shownUrl ? (
              <div className="ed-box" ref={box}>
                <img src={shownUrl} alt="" draggable={false} />
                {showOverlay && <>
                  <div className="ed-region" style={{ left: pc(rx), top: pc(ry), width: pc(rw), height: pc(rh) }} onPointerDown={start('move')}>
                    {(['tl', 'tr', 'bl', 'br'] as const).map(k => <i key={k} className={'ed-h ' + k} onPointerDown={start(k)} />)}
                  </div>
                  {bb && <div className="ed-obj" style={{ left: pc(bb[0]), top: pc(bb[1]), width: pc(bb[2]), height: pc(bb[3]) }} onPointerDown={start('o:move')} title="Kéo để dời khung đỏ đúng vị trí vật liệu">
                    {(['tl', 'tr', 'bl', 'br'] as const).map(k => <i key={k} className={'ed-h obj ' + k} onPointerDown={start('o:' + k)} />)}
                  </div>}
                  {occ && arrow && !noArrow && <>
                    <svg className="ed-arrow" viewBox="0 0 1 1" preserveAspectRatio="none"><line x1={arrow.tail[0]} y1={arrow.tail[1]} x2={arrow.tip[0]} y2={arrow.tip[1]} stroke="#fff" strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinecap="round" /><line x1={arrow.tail[0]} y1={arrow.tail[1]} x2={arrow.tip[0]} y2={arrow.tip[1]} stroke="#e5322d" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" /></svg>
                    <i className="ed-pt tail" style={{ left: pc(arrow.tail[0]), top: pc(arrow.tail[1]) }} onPointerDown={start('tail')} title="Kéo để dời đuôi mũi tên" />
                    <i className="ed-pt tip" style={{ left: pc(arrow.tip[0]), top: pc(arrow.tip[1]) }} onPointerDown={start('tip')} title="Kéo để dời đầu mũi tên (điểm chỉ vào vật liệu)" />
                  </>}
                </>}
              </div>
            ) : <div className="ic-none" style={{ width: 360 }}><span>Chưa có ảnh nguồn – hãy tải ảnh lên</span></div>}
            <div className="small muted" style={{ marginTop: 6 }}>
              {replacing ? 'Đang dùng ảnh bạn tải lên thay cho ảnh crop.' : occ ? 'Kéo khung cam để đổi vùng cắt (kéo góc để to/nhỏ). Kéo chấm đỏ để dời mũi tên. Khung đỏ nét đứt là vị trí vật liệu: kéo để dời, kéo góc để to/nhỏ cho đúng chỗ.' : 'Kéo khung cam để chọn phần ảnh vật liệu muốn lấy (kéo góc để to/nhỏ).'}
            </div>
          </div>
          <div className="editor-side">
            <b className="small">Kết quả</b>
            <div className="editor-prev">
              {occ
                ? <CropView url={baseUrl} bbox={tempBb} pageW={pageW} pageH={pageH} view={tempView} replUrl={shownUrl} height={170} maxWidth={300} />
                : shownUrl ? <MatView url={shownUrl} region={near(region, [0, 0, 1, 1]) ? null : region} maxW={240} maxH={170} /> : null}
            </div>
            <label className="btn" style={{ justifyContent: 'center' }}>📁 {occ ? 'Thay bằng ảnh khác từ máy' : 'Tải ảnh vật liệu từ máy'}<input type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} /></label>
            <div className="small muted">Hoặc dán ảnh (Ctrl+V) vào khung này.</div>
            {occ && (replacing) && <button className="btn" onClick={() => { setFile(null); setFileUrl(null); setKeep(false) }}>↩ Quay lại ảnh gốc</button>}
            {occ && !replacing && <label className="row gap sm-gap small"><input type="checkbox" checked={noArrow} onChange={e => setNoArrow(e.target.checked)} /> Ẩn mũi tên và khung đỏ</label>}
            {occ && !replacing && custom && <button className="btn sm" onClick={() => setCustom(null)}>↺ Mũi tên tự động</button>}
            <div style={{ flex: 1 }} />
            <button className="btn ghost" onClick={reset}>Đặt lại mặc định</button>
            <div className="row gap" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={onClose}>Huỷ</button>
              <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
            </div>
          </div>
        </div>
        <PasteCatcher onFile={pick} />
      </div>
    </div>, document.body)
}

function PasteCatcher({ onFile }: { onFile: (f: File) => void }) {
  useEffect(() => {
    const h = (e: ClipboardEvent) => { const f = [...(e.clipboardData?.files ?? [])].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); onFile(f) } }
    window.addEventListener('paste', h); return () => window.removeEventListener('paste', h)
  }, [onFile])
  return null
}
