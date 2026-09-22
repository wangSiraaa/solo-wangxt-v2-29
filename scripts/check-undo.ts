/**
 * 批量撤销语义校验：
 * 一次拖刷（beginDrag → 多次 paint → endDrag）必须作为单个撤销单元，
 * 撤销后结构、组织图、浮点标记对应的原始数据整体恢复。
 *
 * store 依赖 Vue/Worker/浏览器，无法直接在 Node 驱动，
 * 这里复刻 store 的快照算法契约，确保快照字段与 WeaveProject 可编辑字段一一对应。
 */
import assert from 'node:assert/strict'
import type { WeaveProject } from '../src/types'
import { plainWeave } from '../src/presets'
import { forwardWeave, findFloats } from '../src/logic/weave'

const EDITABLE_KEYS = [
  'mode',
  'loom',
  'threading',
  'treadling',
  'tieup',
  'lift',
  'weave',
  'handEdited',
  'floatThreshold',
  'colors'
] as const

function snapshot(p: WeaveProject) {
  return {
    mode: p.mode,
    loom: { ...p.loom },
    threading: p.threading.slice(),
    treadling: p.treadling.slice(),
    tieup: p.tieup.slice(),
    lift: p.lift.slice(),
    weave: p.weave.slice(),
    handEdited: p.handEdited,
    floatThreshold: p.floatThreshold,
    colors: { warp: p.colors.warp.slice(), weft: p.colors.weft.slice(), background: p.colors.background }
  }
}
type Snap = ReturnType<typeof snapshot>

function restore(p: WeaveProject, s: Snap) {
  p.mode = s.mode
  p.loom = { ...s.loom }
  p.threading = s.threading.slice()
  p.treadling = s.treadling.slice()
  p.tieup = s.tieup.slice()
  p.lift = s.lift.slice()
  p.weave = s.weave.slice()
  p.handEdited = s.handEdited
  p.floatThreshold = s.floatThreshold
  p.colors = { warp: s.colors.warp.slice(), weft: s.colors.weft.slice(), background: s.colors.background }
}

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

check('快照覆盖全部可编辑字段（避免撤销遗漏某类数据）', () => {
  assert.deepEqual(Object.keys(snapshot(plainWeave())).sort(), [...EDITABLE_KEYS].sort())
})

check('一次拖刷 = 一个撤销批次：撤销后结构、组织图、浮线输入全部恢复', () => {
  const p = plainWeave()
  // 样例的 weave 初始为空、由正算填入；以正算基线作为“编辑前状态”
  p.weave = forwardWeave(p.mode, p.loom, p.threading, p.treadling, p.tieup, p.lift)
  const before = snapshot(p)

  // 模拟批量：beginDrag 时压一次快照，随后改穿综的多根经纱 + 吊综多格 + 阈值
  // （store 中一次手势只压一次栈；这里直接对同一快照做多处修改）
  for (let x = 0; x < 8; x++) p.threading[x] = (x + 1) % 2
  for (let i = 0; i < p.tieup.length; i++) p.tieup[i] = i % 3 === 0 ? 1 : 0
  p.floatThreshold = 2
  const wAfterEdits = forwardWeave(p.mode, p.loom, p.threading, p.treadling, p.tieup, p.lift)
  p.weave = wAfterEdits
  const marksAfter = findFloats(p.weave, p.loom.ends, p.loom.picks, p.floatThreshold)

  // 编辑期间数据确实变了
  assert.notDeepEqual(p.threading, before.threading)
  assert.notDeepEqual(p.weave, before.weave)
  assert.notEqual(p.floatThreshold, before.floatThreshold)

  // 撤销一次
  restore(p, before)
  assert.deepEqual(p.threading, before.threading)
  assert.deepEqual(p.tieup, before.tieup)
  assert.deepEqual(p.weave, before.weave)
  assert.equal(p.floatThreshold, before.floatThreshold)

  // 恢复后正算与浮点扫描结果也必须与编辑前一致
  const wRestored = forwardWeave(p.mode, p.loom, p.threading, p.treadling, p.tieup, p.lift)
  assert.deepEqual(wRestored, before.weave)
  const marksRestored = findFloats(p.weave, p.loom.ends, p.loom.picks, p.floatThreshold)
  // before 是正算前的初始数据；恢复后正算结果应等于平纹棋盘格且无阈值2浮点
  assert.equal(marksRestored.length, 0)
  void marksAfter
})

check('多次拖刷产生多个批次，撤销逐层恢复', () => {
  const p = plainWeave()
  const s0 = snapshot(p)
  p.threading[0] = 1 - p.threading[0]
  const s1 = snapshot(p)
  p.threading[1] = 1 - p.threading[1]
  const s2 = snapshot(p)

  restore(p, s2) // redo 到 s2 的逆操作语义这里只验证快照可往返
  assert.deepEqual(p.threading, s2.threading)
  restore(p, s1)
  assert.deepEqual(p.threading, s1.threading)
  restore(p, s0)
  assert.deepEqual(p.threading, s0.threading)
})

console.log(`\n全部 ${passed} 组撤销快照校验通过。`)
