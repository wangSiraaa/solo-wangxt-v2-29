import type {
  FloatMark,
  LoomSpec,
  Mode,
  RecomputeResult,
  ReverseResult,
  WorkerResponse
} from '../types'
import type { WorkerRequest } from '../types'
import Worker from './worker.ts?worker'

/** Worker 的 Promise 封装：约束计算一律不进主线程 */
class WorkerClient {
  private worker: Worker
  private seq = 1
  private pending = new Map<number, (r: WorkerResponse) => void>()

  constructor() {
    this.worker = new Worker()
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const resolve = this.pending.get(e.data.id)
      if (resolve) {
        this.pending.delete(e.data.id)
        resolve(e.data)
      }
    }
  }

  private send(req: Omit<WorkerRequest, 'id'>): Promise<WorkerResponse> {
    const id = this.seq++
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      this.worker.postMessage({ ...req, id })
    })
  }

  async recompute(args: {
    mode: Mode
    loom: LoomSpec
    threading: number[]
    treadling: number[]
    tieup: number[]
    lift: number[]
    floatThreshold: number
  }): Promise<RecomputeResult> {
    const r = await this.send({ type: 'recompute', ...args })
    if (r.type !== 'recompute' || !r.ok) {
      throw new Error(r.type === 'recompute' ? r.error : 'Worker 返回类型异常')
    }
    return r.result
  }

  async floats(args: { loom: LoomSpec; weave: number[]; threshold: number }): Promise<FloatMark[]> {
    const r = await this.send({
      type: 'floats',
      mode: 'tieup',
      loom: args.loom,
      threading: [],
      treadling: [],
      tieup: [],
      lift: [],
      weave: args.weave,
      floatThreshold: args.threshold
    })
    if (r.type !== 'floats' || !r.ok) {
      throw new Error(r.type === 'floats' ? r.error : 'Worker 返回类型异常')
    }
    return r.marks
  }

  async analyze(args: {
    mode: Mode
    loom: LoomSpec
    threading: number[]
    treadling: number[]
    tieup: number[]
    lift: number[]
    weave: number[]
  }): Promise<ReverseResult> {
    const r = await this.send({ type: 'analyze', floatThreshold: 4, ...args })
    if (r.type !== 'analyze' || !r.ok) {
      throw new Error(r.type === 'analyze' ? r.error : 'Worker 返回类型异常')
    }
    return r.result
  }
}

export const workerClient = new WorkerClient()
