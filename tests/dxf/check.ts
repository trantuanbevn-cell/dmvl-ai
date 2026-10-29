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
console.log(fail ? `${fail} lỗi` : 'Tất cả đạt'); if (fail) process.exit(1)
