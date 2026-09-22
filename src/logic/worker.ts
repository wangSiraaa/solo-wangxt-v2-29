/// <reference lib="webworker" />
import type { WorkerRequest, WorkerResponse } from '../types'
import { recompute, findFloats } from './weave'
import { analyzeWeave } from './solve'

/**
 * 所有约束计算（正算组织图、浮线扫描、反推可行性/枚举）都在 Worker 中执行，
 * 主线程只负责编辑与渲染。
 */
const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data
  try {
    if (req.type === 'recompute') {
      const result = recompute(
        req.mode,
        req.loom,
        req.threading,
        req.treadling,
        req.tieup,
        req.lift,
        req.floatThreshold ?? 4
      )
      const res: WorkerResponse = { id: req.id, type: 'recompute', ok: true, result }
      scope.postMessage(res)
    } else if (req.type === 'floats') {
      const weave = req.weave ?? []
      const marks = findFloats(weave, req.loom.ends, req.loom.picks, req.floatThreshold ?? 4)
      const res: WorkerResponse = { id: req.id, type: 'floats', ok: true, marks }
      scope.postMessage(res)
    } else {
      const result = analyzeWeave({
        mode: req.mode,
        loom: req.loom,
        weave: req.weave ?? [],
        alternativesCap: 32
      })
      const res: WorkerResponse = { id: req.id, type: 'analyze', ok: true, result }
      scope.postMessage(res)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (req.type === 'recompute') {
      scope.postMessage({ id: req.id, type: 'recompute', ok: false, error: msg } satisfies WorkerResponse)
    } else if (req.type === 'floats') {
      scope.postMessage({ id: req.id, type: 'floats', ok: false, error: msg } satisfies WorkerResponse)
    } else {
      scope.postMessage({ id: req.id, type: 'analyze', ok: false, error: msg } satisfies WorkerResponse)
    }
  }
}
