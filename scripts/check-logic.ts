/**
 * 纯逻辑校验（不依赖浏览器）：
 *   npx tsx scripts/check-logic.ts
 * 覆盖：平纹正算、2/2 斜纹正算与浮线、反推可行/计数/枚举验证、超综框无解、撤销快照完整性。
 */
import assert from 'node:assert/strict'
import { forwardWeave, findFloats } from '../src/logic/weave'
import { analyzeWeave } from '../src/logic/solve'
import { plainWeave, twillWeave, overCapacityWeave } from '../src/presets'
import type { LoomSpec } from '../src/types'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// ---------- 平纹正算 ----------
check('平纹：正算得到标准棋盘格，1/1 无 ≥2 浮线', () => {
  const p = plainWeave()
  const w = forwardWeave(p.mode, p.loom, p.threading, p.treadling, p.tieup, p.lift)
  for (let y = 0; y < p.loom.picks; y++) {
    for (let x = 0; x < p.loom.ends; x++) {
      assert.equal(w[y * p.loom.ends + x], (x + y) % 2 === 0 ? 1 : 0)
    }
  }
  const marks = findFloats(w, p.loom.ends, p.loom.picks, 2)
  assert.equal(marks.length, 0)
})

// ---------- 斜纹正算 + 浮线 ----------
check('2/2 斜纹：正算为 2 上 2 下，阈值 2 时每行每列都有 2 连浮', () => {
  const t = twillWeave()
  const w = forwardWeave(t.mode, t.loom, t.threading, t.treadling, t.tieup, t.lift)
  // 第一纬（t=0 踏板）提起 0、3 两页综，顺穿 x%4 下行模式为 1100 循环
  assert.equal(w.slice(0, 12).join(''), '110011001100')
  // 第二纬右移一位，形成斜纹走向
  assert.equal(w.slice(12, 24).join(''), '011001100110')
  const marks2 = findFloats(w, t.loom.ends, t.loom.picks, 2)
  // 12 纬 2/2 斜纹：列/行均为 1100 周期，线性扫描下最长连续为 2，
  // 某些相位首/尾为孤立 1 不计浮；经/纬浮点格各 66 个。
  const warpMarks = marks2.filter((m) => m.kind === 'warp')
  const weftMarks = marks2.filter((m) => m.kind === 'weft')
  assert.equal(warpMarks.length, 66)
  assert.equal(weftMarks.length, 66)
  assert.ok(warpMarks.every((m) => m.length === 2))
  // 阈值 3 时 2/2 斜纹不再有长浮（正是 2/2 组织的特点）
  const marks4 = findFloats(w, t.loom.ends, t.loom.picks, 3)
  assert.equal(marks4.length, 0)
})

// ---------- 斜纹反推：可行 + 计数 = P(4,4)*P(4,4) = 576，全部枚举验证 ----------
check('斜纹反推：4 列签名 / 4 行签名，标号解 24×24=576，枚举解全部正算一致', () => {
  const t = twillWeave()
  const w = forwardWeave(t.mode, t.loom, t.threading, t.treadling, t.tieup, t.lift)
  const r = analyzeWeave({ mode: 'tieup', loom: t.loom, weave: w, alternativesCap: 600 })
  assert.equal(r.feasible, true)
  assert.equal(r.shaftsNeeded, 4)
  assert.equal(r.treadlesNeeded, 4)
  assert.equal(r.labeledCount, (24n * 24n).toString())
  assert.equal(r.alternatives.length, 576)
  assert.equal(r.alternativesTruncated, false)
  for (const alt of r.alternatives) {
    assert.equal(alt.verified, true)
  }
  // 编号解确实两两不同
  const sig = new Set(r.alternatives.map((a) => a.threading.join('|') + '#' + a.treadling.join('|') + '#' + a.tieup.join('')))
  assert.equal(sig.size, 576)
})

// ---------- 平纹反推：2 列 / 2 行签名，用 4 综 4 踏时计数 P(4,2)^2=144 ----------
check('平纹在 4 综 4 踏织机上：反推可行，标号解 P(4,2)²=144 且逐一验证', () => {
  const p = plainWeave()
  const w = forwardWeave(p.mode, p.loom, p.threading, p.treadling, p.tieup, p.lift)
  const loom: LoomSpec = { shafts: 4, treadles: 4, ends: p.loom.ends, picks: p.loom.picks }
  const r = analyzeWeave({ mode: 'tieup', loom, weave: w, alternativesCap: 200 })
  assert.equal(r.feasible, true)
  assert.equal(r.shaftsNeeded, 2)
  assert.equal(r.treadlesNeeded, 2)
  assert.equal(r.labeledCount, (12n * 12n).toString())
  assert.equal(r.alternatives.length, 144)
  assert.ok(r.alternatives.every((a) => a.verified))
})

// ---------- 超综框：必须无解 ----------
check('超综框样例：6 种列纹 > 4 综，反推明确无解且不返回方案', () => {
  const o = overCapacityWeave()
  const r = analyzeWeave({ mode: 'tieup', loom: o.loom, weave: o.weave })
  assert.equal(r.feasible, false)
  assert.equal(r.shaftsNeeded, 6)
  assert.ok(r.reason!.includes('综框'))
  assert.equal(r.canonical, undefined)
  assert.equal(r.alternatives.length, 0)
})

// ---------- dobby 反推 ----------
check('dobby 模式：同一织纹只需列归并，标号解 P(shafts,kCol)', () => {
  const p = twillWeave()
  const w = forwardWeave(p.mode, p.loom, p.threading, p.treadling, p.tieup, p.lift)
  const r = analyzeWeave({ mode: 'dobby', loom: p.loom, weave: w })
  assert.equal(r.feasible, true)
  assert.equal(r.shaftsNeeded, 4)
  assert.equal(r.labeledCount, '24')
  for (const a of r.alternatives) assert.equal(a.verified, true)
})

// ---------- 全 0 组织图：1 种列签名、1 种行签名，可行 ----------
check('全 0 组织图：唯一列签名，1 综 1 踏即可，计数 1', () => {
  const loom: LoomSpec = { shafts: 2, treadles: 2, ends: 6, picks: 6 }
  const w = new Array(36).fill(0)
  const r = analyzeWeave({ mode: 'tieup', loom, weave: w })
  assert.equal(r.feasible, true)
  assert.equal(r.shaftsNeeded, 1)
  assert.equal(r.treadlesNeeded, 1)
  assert.equal(r.labeledCount, (2n * 2n).toString()) // P(2,1)*P(2,1)=4
})

// ---------- 手工构造不可二元分解的图（行签名冲突）----------
check('列纹够用但踏板不够：行签名 3 种 > 2 踏板 => 无解', () => {
  const loom: LoomSpec = { shafts: 4, treadles: 2, ends: 4, picks: 3 }
  // 三个互不相同的行，且列也互不相同（4 列内）
  const rows = ['1100', '1010', '1001']
  const w: number[] = []
  for (const r of rows) for (const ch of r) w.push(Number(ch))
  const res = analyzeWeave({ mode: 'tieup', loom, weave: w })
  assert.equal(res.feasible, false)
  assert.ok(res.reason!.includes('踏板'))
})

console.log(`\n全部 ${passed} 组逻辑校验通过。`)
