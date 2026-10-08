/** Thanh tiến độ 3 màu: đã xác nhận / chờ duyệt / chưa có */
export default function Bar({ approved, pending, total, height = 8 }: { approved: number; pending: number; total: number; height?: number }) {
  const t = Math.max(total, 1)
  return (
    <div className="bar" style={{ height }} title={`${approved}/${total} đã xác nhận · ${pending} chờ duyệt`}>
      <span className="bar-ok" style={{ width: `${(approved / t) * 100}%` }} />
      <span className="bar-pend" style={{ width: `${(pending / t) * 100}%` }} />
    </div>
  )
}
