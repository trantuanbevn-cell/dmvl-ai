// Nạp OpenCV.js khi cần (khoảng 10 MB, chỉ tải khi bấm "Phân tích mặt bằng"). Chạy hoàn toàn trong trình duyệt – không tốn phí.
let cvP: Promise<any> | null = null
export function loadCv(): Promise<any> {
  if (!cvP) {
    cvP = (async () => {
      const m: any = await import('@techstark/opencv-js')
      let cv: any = m.default ?? m
      if (!cv.Mat && typeof cv.then === 'function') cv = await new Promise<any>((res, rej) => cv.then((x: any) => res(x), rej))
      // tuỳ phiên bản, cv là đối tượng sẵn sàng hoặc "thenable" – chờ tới khi cv.Mat xuất hiện thay vì gọi then()
      for (let i = 0; i < 1200 && !(cv && cv.Mat); i++) await new Promise(r => setTimeout(r, 50))
      if (!cv?.Mat) throw new Error('Không nạp được OpenCV.js')
      return cv
    })()
    cvP.catch(() => { cvP = null })
  }
  return cvP
}
