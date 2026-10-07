export default function LogBox({ lines }: { lines: string[] }) {
  if (!lines.length) return null
  return <pre className="log">{lines.slice(-200).join('\n')}</pre>
}
export function useLog(set: (f: (l: string[]) => string[]) => void) {
  return (m: string) => set(l => [...l, `${new Date().toLocaleTimeString('vi-VN')}  ${m}`])
}
