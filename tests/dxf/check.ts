// Kiểm tra bộ đọc DXF trên các file mẫu (tạo bằng gen.py – ezdxf). Chạy: npx vite-node tests/dxf/check.ts
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { readDxfPage } from '../../src/lib/dxf'
const dir = fileURLToPath(new URL('.', import.meta.url))
let fail = 0
const ok = (cond: boolean, msg: string) => { if (!cond) { fail++; console.log('  ✗', msg) } else console.log('  ✓', msg) }
for (const f of ['t2018.dxf', 't2000.dxf', 'tmline.dxf', 'tbin.dxf']) {
  console.log(f)
  const b = readFileSync(dir + f)
  const v: any = await readDxfPage(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
  const k = v.dxf.den * 25.4 / 72
  let x0 = 1e9, y1 = -1e9
  for (let i = 0; i < v.nSeg; i++) if (v.classes[v.cls[i]].layer === 'A-WALL') for (const j of [0, 2]) { x0 = Math.min(x0, v.segs[i * 4 + j]); y1 = Math.max(y1, v.segs[i * 4 + j + 1]) }
  const off = f === 'tmline.dxf' ? 200 : 0   // MLINE căn mép trên: viền ngoài lệch 200 mm
  const at = (t: string) => v.texts.find((z: any) => z.t === t)
  const near = (z: any, x: number, y: number) => z && Math.abs((z.x - x0) * k - off - x) < 60 && Math.abs((y1 - z.y) * k - off - y) < 60
  ok(v.classes.some((c: any) => c.layer === 'A-WALL' && c.n > 0), 'có nét tường (kể cả MLINE)')
  ok(near(at('PHÒNG KHÁCH'), 2000, 2500), 'chữ căn giữa nằm đúng tâm phòng, đúng tiếng Việt')
  ok(near(at('PHÒNG NGỦ'), 6000, 2500) && !!at('S=19,6m2'), 'nhãn block (ATTRIB) đọc được')
  ok(!!at('BẾP'), 'MULTILEADER đọc được')
  const a = v.arcs[0]; ok(!!a && Math.abs((a.a[0] - x0) * k - off - 10200) < 60, 'cung có pháp tuyến −Z đặt đúng chỗ')
}

// ---- bản vẽ không layer / không block: phải nhận tường, cửa, thang (bậc đầu) mà không nhận nhầm đồ đạc ----
{
  const { modelFromVec } = await import('../../src/lib/plan3d/model')
  console.log('tnolayer.dxf')
  const b = readFileSync(dir + 'tnolayer.dxf')
  const v: any = await readDxfPage(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, undefined, { draw: true })
  const M = modelFromVec(v, v.dxf.den)
  const brick = M.walls.filter(w => w.role === 'wall' && w.kind === 'brick')
  ok(brick.length >= 5 && brick.length <= 6, `nhận đúng tường theo hình, không nhận nhầm bàn / sofa (${brick.length})`)
  ok(M.doors.length === 1 && Math.abs(M.doors[0].w - 0.9) < 0.1, `nhận 1 cửa 900 (${M.doors.map(d => d.w).join(',')})`)
  const st = (M.furn ?? []).filter(f => f.kind === 'stair')
  ok(st.length === 1, `nhận 1 vế thang (${st.length})`)
  if (st[0]) { const f = st[0], x0 = f.x - Math.cos(f.ang) * f.w / 2; ok(Math.abs(x0 - Math.min(...M.walls.flatMap(w => w.shape.type === 'poly' ? w.shape.rings[0].map(p => p[0]) : [w.shape.a[0], w.shape.b[0]])) - 0.7) < 0.4, 'bậc đầu ở phía vòng tròn (chân thang)') }
}
console.log(fail ? `${fail} lỗi` : 'Tất cả đạt (cả bản không layer)'); if (fail) process.exit(1)
