import { solveDraft } from '../core/weave'

interface SolveRequest {
  seq: number
  pattern: boolean[][]
  shaftCount: number
  treadleCount: number
}

/** 避免同时引入 DOM 与 WebWorker 两个 lib 的类型冲突，手工声明最小接口 */
interface WorkerScope {
  onmessage: ((e: MessageEvent<SolveRequest>) => void) | null
  postMessage(msg: unknown): void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (e) => {
  const { seq, pattern, shaftCount, treadleCount } = e.data
  const result = solveDraft(pattern, shaftCount, treadleCount)
  scope.postMessage({ seq, result })
}
