# 织造工作室 · 经纬组织设计台

浏览器内运行的单层织物组织设计工具：**组织点阵 ⇄ 穿综 / 纹板 / 吊综** 始终保持可解释的一致关系。
无后台接口；工程通过 Dexie 存入浏览器 IndexedDB，并支持带版本标识的 JSON 导回。

## 技术栈

- Vue 3 + TypeScript（Composition API）
- Canvas 2D 绘制所有网格与织物模拟（支持拖刷、DPR 适配）
- Web Worker（`src/logic/worker.ts`）承载全部约束计算：正算组织图、浮线扫描、反推求解
- Dexie 4 管理本地工程库
- Vite 构建，Worker 以 ES 模块打包

## 快速开始

```bash
npm install
npm run dev        # 开发
npm run build      # 类型检查 + 生产构建
npm run test:logic # 纯逻辑校验（正算/浮线/反推/无解/计数）
npm run test:undo  # 撤销快照与批量恢复校验
```

## 数据模型与一致性原则

| 字段 | 含义 |
| --- | --- |
| `loom` | `shafts`（综框数）、`treadles`（踏板数）、`ends`（经纱数/列）、`picks`（纬纱数/行） |
| `threading[x]` | 第 x 根经纱穿入的综框（0 起，-1 为空穿） |
| `treadling[y]` | 第 y 纬踩下的踏板（tie-up 模式，单选） |
| `tieup[s][t]` | 综框 s 是否吊在踏板 t 上 |
| `lift[y][s]` | dobby 模式下第 y 纬是否提起综框 s |
| `weave[y][x]` | 组织点：1 = 经浮（经在上），0 = 纬浮 |
| `colors` | 每根经/纬纱的颜色，与 `weave` 结构**分开存储** |

- **正算**：编辑穿综 / 纹板 / 吊综 / 多臂后，Worker 重算 `weave`，主线程只渲染。
- **手绘组织图**：只改结构点阵，进入 `handEdited` 状态，UI 明确提示“方案未声称一致”，
  不会偷偷给出一组可能错误的穿综数字。
- **反推**：对组织图做列签名 / 行签名归并：
  - 列签名种类数 > 综框数 → **无解**（同一综框只能穿列纹完全相同的经纱）；
  - tie-up 下行签名种类数 > 踏板数 → **无解**；
  - 可行时返回规范解（紧凑编号）和标号解数量
    `P(shafts, kCol) × P(treadles, kRow)`（dobby 为 `P(shafts, kCol)`），
    枚举解**逐一经过正算逐位验证**才允许“采用”，未验证的方案拒绝写入。
  - 解数量来自排列公式与真实枚举（受上限截断时会明示），不是猜测。
- **浮线**：同列连续经浮点（经浮线）/ 同行连续纬浮点（纬浮线），长度 ≥ 阈值即高亮；
  阈值可在织机面板调整。

### 撤销语义

一次拖刷（pointerdown → 多次绘制 → pointerup）只压入一个撤销快照，
快照覆盖结构、尺寸、模式、阈值、颜色等全部可编辑字段；
撤销一次批量操作即整体恢复所有受影响数据。

## 内置样例

- **平纹 1/1**（2 综 2 踏）：基础棋盘格，无浮线。
- **2/2 斜纹**（4 综 4 踏）：反推展示 576 个标号解（24×24，含综框/踏板重编号的等价方案）。
- **超综框能力**：8 纬 × 6 经中含 6 种互异列纹而只有 4 页综框——反推如实报告**无解**。

## 导入 / 导出

- JSON：`weave-studio-json` 格式 + 版本号；导入时做尺寸、长度、模式严格校验，作为新工程入本地库。
- PNG（意匠图）：穿综 / 吊综或多臂纹板 / 纹板 / 组织图四宫格 + 浮线高亮。
- PNG（织物）：纱线交织模拟。
- 两张 PNG 均带红色水平**经向 WARP（列方向）**与蓝色垂直**纬向 WEFT（行方向）**双向箭头标识。

## 目录

```
src/
  logic/
    weave.ts    正算 + 浮线扫描（纯函数）
    solve.ts    反推：签名归并、可行性、计数公式、枚举与验证
    worker.ts   Worker 入口
    client.ts   Worker Promise 封装
  components/
    GridCanvas.vue   通用可刷绘网格
    ColorStrip.vue   经/纬纱颜色条
    FabricPreview.vue 织物交织模拟
  presets.ts   教学样例
  db.ts        Dexie 表结构、存取、导入校验
  exporter.ts  JSON / PNG 导出
  store.ts     响应式状态、撤销栈、Worker 调度
  render.ts    Canvas 绘制（交互与导出共用）
scripts/       可在 Node 直接跑的逻辑/撤销校验
```
