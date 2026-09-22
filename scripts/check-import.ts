/** JSON 导入校验测试：坏格式必须被拒绝，合法样例必须通过并去掉库 id */
import assert from 'node:assert/strict'
import { validateImport } from '../src/db'
import { plainWeave, twillWeave } from '../src/presets'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}
function reject(raw: unknown, fragment: string) {
  assert.throws(
    () => validateImport(raw),
    (e: unknown) => e instanceof Error && e.message.includes(fragment),
    `期望抛出包含 "${fragment}" 的错误`
  )
}

check('合法平纹样例可导入，且 id 被清除（作为新工程）', () => {
  const p = plainWeave()
  p.id = 99
  const imported = validateImport(JSON.parse(JSON.stringify(p)))
  assert.equal(imported.id, undefined)
  assert.equal(imported.name, p.name)
  assert.equal(imported.weave.length, p.loom.ends * p.loom.picks)
})

check('合法斜纹样例可导入', () => {
  const t = twillWeave()
  const imported = validateImport(JSON.parse(JSON.stringify(t)))
  assert.equal(imported.loom.shafts, 4)
  assert.equal(imported.tieup.length, 16)
})

check('格式标识错误被拒绝', () => {
  reject({ format: 'other', version: 1 }, '格式标识')
})
check('版本号不受支持被拒绝', () => {
  const p = plainWeave()
  reject({ ...p, version: 99 }, '版本')
})
check('穿综长度不符被拒绝', () => {
  const p = plainWeave()
  reject({ ...p, threading: [0, 1] }, 'threading')
})
check('组织图长度不符被拒绝', () => {
  const p = plainWeave()
  reject({ ...p, weave: new Array(10).fill(0) }, 'weave')
})
check('颜色数组长度不符被拒绝', () => {
  const p = plainWeave()
  reject(
    { ...p, colors: { warp: ['#000'], weft: p.colors.weft, background: '#fff' } },
    'colors.warp'
  )
})
check('尺寸越界被拒绝', () => {
  const p = plainWeave()
  reject({ ...p, loom: { ...p.loom, shafts: 99 } }, '综框')
})
check('非对象 JSON 被拒绝', () => {
  reject(null, 'JSON 对象')
  reject('hello', 'JSON 对象')
})

console.log(`\n全部 ${passed} 组导入校验通过。`)
