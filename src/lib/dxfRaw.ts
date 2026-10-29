// Đọc bổ sung những phần thư viện dxf-parser bỏ sót (cách làm học theo ezdxf / dxf-viewer, viết lại bằng TypeScript):
//  - DXF nhị phân, mã hoá chữ theo $ACADVER / $DWGCODEPAGE (file đời cũ), ký tự \U+XXXX
//  - ATTRIB (nhãn phòng dạng block có thuộc tính), MULTILEADER (ghi chú), MLINE (tường vẽ bằng đường đôi)
//  - đối tượng có hệ toạ độ lật (pháp tuyến −Z), tên thật của block động (*U123 → tên gốc)
//  - SPLINE: tính đường cong B-spline thật thay vì nối thẳng các điểm điều khiển

type Pt = [number, number]

// ───────── Mã hoá chữ ─────────
const CODEPAGE: Record<string, string> = { ANSI_874: 'windows-874', ANSI_932: 'shift_jis', ANSI_936: 'gbk', ANSI_949: 'euc-kr', ANSI_950: 'big5', ANSI_1250: 'windows-1250', ANSI_1251: 'windows-1251', ANSI_1252: 'windows-1252', ANSI_1253: 'windows-1253', ANSI_1254: 'windows-1254', ANSI_1255: 'windows-1255', ANSI_1256: 'windows-1256', ANSI_1257: 'windows-1257', ANSI_1258: 'windows-1258' }
const BIN_SENTINEL = 'AutoCAD Binary DXF\r\n\x1a\x00'
export const isBinaryDxf = (u: Uint8Array) => u.length > 22 && String.fromCharCode(...u.subarray(0, 22)) === BIN_SENTINEL

/** \U+XXXX (chữ Unicode trong DXF đời cũ) → ký tự thật */
export const decodeDxfUnicode = (s: string) => s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))

/** Đọc tham số đầu file: phiên bản + bảng mã */
function headerParams(head: string): { ver: string; enc: string } {
  const v = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d{4})/.exec(head)?.[1] ?? 'AC1009'
  const cp = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*([A-Za-z_0-9]+)/.exec(head)?.[1]?.toUpperCase()
  return { ver: v, enc: v >= 'AC1021' ? 'utf-8' : (cp && CODEPAGE[cp]) || 'windows-1252' }
}

/** DXF (ASCII hoặc nhị phân) → chuỗi DXF ASCII đã giải mã đúng bảng mã */
export function decodeDxf(data: ArrayBuffer): string {
  const u = new Uint8Array(data)
  let s: string
  if (isBinaryDxf(u)) s = binaryToText(u)
  else {
    const head = new TextDecoder('latin1').decode(u.subarray(0, Math.min(u.length, 65536)))
    const { ver, enc } = headerParams(head)
    if (ver >= 'AC1021') s = new TextDecoder('utf-8').decode(u)
    else { // file đời cũ: một số phần mềm vẫn ghi UTF-8 → thử UTF-8 chặt trước, sai thì theo bảng mã trong file
      try { s = new TextDecoder('utf-8', { fatal: true }).decode(u) } catch { let d: TextDecoder; try { d = new TextDecoder(enc) } catch { d = new TextDecoder('windows-1252') } s = d.decode(u) }
    }
  }
  return decodeDxfUnicode(s)
}

// nhóm mã DXF nhị phân (theo ezdxf lldxf/types.py)
const inR = (c: number, a: number, b: number) => c >= a && c < b
const isBin = (c: number) => inR(c, 310, 320) || c === 1004
const isBool = (c: number) => inR(c, 290, 300)
const isI16 = (c: number) => inR(c, 60, 80) || inR(c, 170, 180) || inR(c, 270, 290) || inR(c, 370, 390) || inR(c, 400, 410) || inR(c, 1060, 1071)
const isI32 = (c: number) => inR(c, 90, 100) || inR(c, 420, 430) || inR(c, 440, 460) || c === 1071
const isI64 = (c: number) => inR(c, 160, 170)
const isDbl = (c: number) => inR(c, 10, 60) || inR(c, 110, 150) || inR(c, 210, 240) || inR(c, 460, 470) || inR(c, 1010, 1060)

/** DXF nhị phân → văn bản DXF ASCII (cặp dòng mã / giá trị) để dùng chung bộ đọc */
function binaryToText(u: Uint8Array): string {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength)
  const find = (needle: string) => { const n = new TextEncoder().encode(needle); outer: for (let i = 22; i < Math.min(u.length - n.length, 4096); i++) { for (let j = 0; j < n.length; j++) if (u[i + j] !== n[j]) continue outer; return i } return -1 }
  let ver = 'AC1009', enc = 'windows-1252'
  const strAt = (i: number) => { let e = i; while (e < u.length && u[e] !== 0) e++; return new TextDecoder('latin1').decode(u.subarray(i, e)) }
  const iv = find('$ACADVER'); if (iv >= 0) { let st = iv + 10; if (u[st] !== 65) st++; ver = strAt(st) }
  if (ver >= 'AC1021') enc = 'utf-8'
  else { const ic = find('$DWGCODEPAGE'); if (ic >= 0) { let st = ic + 14; if (u[st] !== 65) st++; enc = CODEPAGE[strAt(st).toUpperCase()] ?? enc } }
  let dec: TextDecoder; try { dec = new TextDecoder(enc) } catch { dec = new TextDecoder('windows-1252') }
  const r12 = ver <= 'AC1009', out: string[] = []
  let i = 22
  while (i < u.length) {
    let code = u[i]
    if (r12) { if (code === 255) { code = u[i + 1] | (u[i + 2] << 8); i += 3 } else i += 1 }
    else { code = u[i] | (u[i + 1] << 8); i += 2 }
    let val: string
    if (isBin(code)) { const n = u[i]; i++; let h = ''; for (let k = 0; k < n; k++) h += u[i + k].toString(16).padStart(2, '0'); i += n; val = h.toUpperCase() }
    else if (isI16(code)) { val = String(dv.getInt16(i, true)); i += 2 }
    else if (isDbl(code)) { val = String(dv.getFloat64(i, true)); i += 8 }
    else if (isI32(code)) { val = String(dv.getInt32(i, true)); i += 4 }
    else if (isI64(code)) { val = String(dv.getBigInt64(i, true)); i += 8 }
    else if (isBool(code)) { val = String(u[i]); i += 1 }
    else { let e = i; while (e < u.length && u[e] !== 0) e++; val = dec.decode(u.subarray(i, e)); i = e + 1 }
    out.push(String(code), val)
    if (code === 0 && val === 'EOF') break
  }
  return out.join('\n')
}

// ───────── Quét thô các đối tượng dxf-parser bỏ qua ─────────
export type RawText = { type: 'ATTRIB'; layer: string; startPoint: { x: number; y: number }; endPoint?: { x: number; y: number }; halign: number; valign: number; textHeight: number; rotation: number; text: string; negZ: boolean; inPaperSpace: boolean; colorIndex?: number }
export type RawPoly = { type: '_POLY'; layer: string; pts: Pt[]; closed: boolean; colorIndex?: number; inPaperSpace: boolean }
export type RawHatch = { type: 'HATCH'; layer: string; loops: Pt[][]; solid: number; pat: string; inPaperSpace: boolean }
export type RawExtras = { /** layer → kiểu nét (CONTINUOUS, HIDDEN, DASHED…) */ layerLt: Map<string, string>; model: (RawText | RawPoly | RawHatch)[]; blocks: Record<string, (RawText | RawPoly | RawHatch)[]>; negZ: Set<string>; dynName: Map<string, string> }

/** Một lần quét văn bản DXF: ATTRIB, MLINE, MULTILEADER, đối tượng pháp tuyến −Z, tên thật của block động */
export function rawExtras(L: string[]): RawExtras {
  const model: RawExtras['model'] = [], blocks: RawExtras['blocks'] = {}, negZ = new Set<string>()
  const layerLt = new Map<string, string>()
  const recByName = new Map<string, string>(), nameByHandle = new Map<string, string>(), repOf = new Map<string, string>()
  let sec = '', blk = '', tbl = ''
  const push = (e: RawText | RawPoly | RawHatch) => { if (sec === 'ENTITIES') model.push(e); else if (sec === 'BLOCKS' && blk) (blocks[blk] ??= []).push(e) }
  for (let i = 0; i + 1 < L.length; i += 2) {
    const c = L[i].trim(), v = L[i + 1].trim()
    if (c !== '0') continue
    if (v === 'SECTION') { sec = (L[i + 3] ?? '').trim(); continue }
    if (v === 'TABLE') { tbl = (L[i + 3] ?? '').trim(); continue }
    if (v === 'BLOCK') { for (let j = i + 2; j < Math.min(L.length, i + 60); j += 2) if (L[j].trim() === '2') { blk = L[j + 1].trim(); break } continue }
    if (v === 'ENDBLK') { blk = ''; continue }
    // bảng BLOCK_RECORD: handle ↔ tên, và block ẩn danh *U… trỏ về block động gốc (xdata AcDbBlockRepBTag → 1005)
    if (sec === 'TABLES' && tbl === 'BLOCK_RECORD' && v === 'BLOCK_RECORD') {
      let h = '', name = '', inRep = false, rep = ''
      for (let j = i + 2; j + 1 < L.length; j += 2) { const cc = L[j].trim(), vv = L[j + 1].trim(); if (cc === '0') break
        if (cc === '5') h = vv; else if (cc === '2') name = vv; else if (cc === '1001') inRep = vv === 'AcDbBlockRepBTag'; else if (cc === '1005' && inRep) rep = vv }
      if (name) { if (h) { nameByHandle.set(h, name); recByName.set(name, h) } if (rep) repOf.set(name, rep) }
      continue
    }
    if (sec === 'TABLES' && tbl === 'LAYER' && v === 'LAYER') { let name = '', lt = ''
      for (let j = i + 2; j + 1 < L.length; j += 2) { const cc = L[j].trim(); if (cc === '0') break; if (cc === '2') name = L[j + 1].trim(); else if (cc === '6') lt = L[j + 1].trim() }
      if (name) layerLt.set(name, lt.toUpperCase()); continue }
    if (sec !== 'ENTITIES' && sec !== 'BLOCKS') continue
    // pháp tuyến −Z (hệ toạ độ đối tượng bị lật): ghi lại handle để bộ đọc chính lật toạ độ
    if (v !== 'ATTRIB' && v !== 'MLINE' && v !== 'MULTILEADER') {
      let h = ''
      for (let j = i + 2; j + 1 < L.length; j += 2) { const cc = L[j].trim(); if (cc === '0') break
        if (cc === '5' && !h) h = L[j + 1].trim(); else if (cc === '230' && +L[j + 1] < -0.5 && h) { negZ.add(h); break } }
      continue
    }
    if (v === 'ATTRIB') {
      const e: RawText = { type: 'ATTRIB', layer: '0', startPoint: { x: 0, y: 0 }, halign: 0, valign: 0, textHeight: 1, rotation: 0, text: '', negZ: false, inPaperSpace: false }
      let flags = 0, emb = false
      for (let j = i + 2; j + 1 < L.length; j += 2) { const cc = +L[j], vv = L[j + 1].trim(); if (cc === 0) break
        if (cc === 101) emb = true   // phần MTEXT nhúng (thuộc tính nhiều dòng) – toạ độ sau đó không phải của ATTRIB
        if (emb) { if (cc === 1 || cc === 3) e.text = e.text || vv; continue }
        if (cc === 8) e.layer = vv; else if (cc === 1) e.text = vv; else if (cc === 10) e.startPoint.x = +vv; else if (cc === 20) e.startPoint.y = +vv
        else if (cc === 11) e.endPoint = { x: +vv, y: 0 }; else if (cc === 21 && e.endPoint) e.endPoint.y = +vv
        else if (cc === 40) e.textHeight = +vv; else if (cc === 50) e.rotation = +vv; else if (cc === 70) flags = +vv; else if (cc === 72) e.halign = +vv; else if (cc === 74) e.valign = +vv
        else if (cc === 60) flags |= +vv === 1 ? 1 : 0; else if (cc === 230) e.negZ = +vv < -0.5; else if (cc === 67) e.inPaperSpace = +vv === 1; else if (cc === 62) e.colorIndex = +vv }
      if (!(flags & 1) && e.text.trim()) push(e)   // thuộc tính ẩn (invisible) → bỏ
      continue
    }
    if (v === 'MULTILEADER') {
      let inCtx = false, text = '', x = NaN, y = NaN, h = NaN, layer = '0', paper = false
      for (let j = i + 2; j + 1 < L.length; j += 2) { const cc = +L[j], vv = L[j + 1].trim(); if (cc === 0) break
        if (cc === 8) layer = vv; else if (cc === 67) paper = +vv === 1
        else if (cc === 300 && /CONTEXT_DATA/.test(vv)) inCtx = true; else if (cc === 301) inCtx = false
        else if (inCtx) { if (cc === 304 && !text) text = vv; else if (cc === 12 && isNaN(x)) x = +vv; else if (cc === 22 && isNaN(y)) y = +vv; else if (cc === 41 && isNaN(h)) h = +vv } }
      if (text && isFinite(x) && isFinite(y)) push({ type: 'ATTRIB', layer, startPoint: { x, y }, halign: 0, valign: 0, textHeight: isFinite(h) ? h : 1, rotation: 0, text, negZ: false, inPaperSpace: paper })
      continue
    }
    // MLINE: điểm của từng nét = đỉnh + hướng miter × tham số đầu tiên của nét (giống ezdxf render/mline.py)
    let layer = '0', flags = 0, paper = false, color: number | undefined
    const verts: { p: Pt; m: Pt; prm: number[] }[] = []
    let cur: { p: Pt; m: Pt; prm: number[] } | null = null, inPrm = false
    for (let j = i + 2; j + 1 < L.length; j += 2) { const cc = +L[j], vv = L[j + 1].trim(); if (cc === 0) break
      if (cc === 60 && +vv === 1) { layer = '\u0000hidden'; break }
      if (cc === 8) layer = vv; else if (cc === 71) flags = +vv; else if (cc === 67) paper = +vv === 1; else if (cc === 62) color = +vv
      else if (cc === 11) { cur = { p: [+vv, 0], m: [0, 0], prm: [] }; verts.push(cur); inPrm = false } else if (cc === 21 && cur) cur.p[1] = +vv
      else if (cc === 13 && cur) cur.m[0] = +vv; else if (cc === 23 && cur) cur.m[1] = +vv
      else if (cc === 74 && cur) inPrm = true   // bắt đầu tham số một nét: tham số đầu = khoảng lệch dọc miter
      else if (cc === 41 && cur && inPrm) { cur.prm.push(+vv); inPrm = false } }
    if (verts.length < 2 || layer === '\u0000hidden') continue
    const n = Math.min(...verts.map(q => q.prm.length)); if (!n) continue
    const closed = !!(flags & 2)
    const line = (k: number): Pt[] => verts.map(q => [q.p[0] + q.m[0] * q.prm[k], q.p[1] + q.m[1] * q.prm[k]] as Pt)
    const ks = [...Array(n).keys()].sort((a, b) => verts[0].prm[a] - verts[0].prm[b]), lo = ks[0], hi = ks[ks.length - 1]
    // nét của từng lớp (đủ để dò tường theo nét) + hai đầu hở
    for (const k of ks) push({ type: '_POLY', layer, pts: line(k), closed, colorIndex: color, inPaperSpace: paper })
    if (n >= 2 && lo !== hi) {
      const A = line(lo), B = line(hi)
      if (!closed) { push({ type: '_POLY', layer, pts: [A[0], B[0]], closed: false, colorIndex: color, inPaperSpace: paper }); push({ type: '_POLY', layer, pts: [A[A.length - 1], B[B.length - 1]], closed: false, colorIndex: color, inPaperSpace: paper }) }
      // thân tường như một vùng hatch: MLINE kín = vành (viền ngoài + viền trong, chẵn–lẻ), MLINE hở = dải kín
      push({ type: 'HATCH', layer, loops: closed ? [A, B] : [[...A, ...B.reverse()]], solid: 1, pat: '_MLINE', inPaperSpace: paper } )
    }
  }
  const dynName = new Map<string, string>()
  for (const [name, h] of repOf) { const real = nameByHandle.get(h); if (real && real !== name) dynName.set(name, real) }
  void recByName
  return { layerLt, model, blocks, negZ, dynName }
}

// ───────── SPLINE ─────────
/** Điểm trên đường cong B-spline (có trọng số nếu có) – thuật toán Cox–de Boor; dữ liệu hỏng → trả null để dùng cách cũ */
export function splinePts(ctrl: Pt[], knots: number[], deg: number, weights?: number[], seg = 0): Pt[] | null {
  const n = ctrl.length, p = deg
  if (!(p >= 1) || n < p + 1 || knots.length !== n + p + 1) return null
  const t0 = knots[p], t1 = knots[n]; if (!(t1 > t0)) return null
  const N = seg || Math.min(400, Math.max(16, n * 8)), out: Pt[] = []
  const basis = (i: number, k: number, t: number): number => {
    if (k === 0) return (knots[i] <= t && t < knots[i + 1]) || (t === t1 && knots[i] < t && t <= knots[i + 1]) ? 1 : 0
    const a = knots[i + k] - knots[i], b = knots[i + k + 1] - knots[i + 1]
    return (a ? ((t - knots[i]) / a) * basis(i, k - 1, t) : 0) + (b ? ((knots[i + k + 1] - t) / b) * basis(i + 1, k - 1, t) : 0)
  }
  for (let s = 0; s <= N; s++) {
    const t = t0 + ((t1 - t0) * s) / N
    let x = 0, y = 0, w = 0
    for (let i = 0; i < n; i++) { const b = basis(i, p, t); if (!b) continue; const wi = weights?.[i] ?? 1; x += b * wi * ctrl[i][0]; y += b * wi * ctrl[i][1]; w += b * wi }
    if (w > 1e-12) out.push([x / w, y / w])
  }
  return out.length >= 2 ? out : null
}
