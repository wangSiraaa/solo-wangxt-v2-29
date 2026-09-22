import type { FloatMark, WeaveProject } from './types'
import { gridPixelSize, markMap, paintGrid, paintFabric } from './render'

/** 导出可导回的工程 JSON（去掉本地库 id，导入即新工程） */
export function exportJSON(project: WeaveProject): void {
  const payload = { ...project, id: undefined, updatedAt: Date.now() }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json'
  })
  triggerDownload(blob, safeName(project.name) + '.weave.json')
}

/** 织物模拟 PNG，带明确的经向 / 纬向箭头标识与浮线高亮 */
export function exportFabricPNG(project: WeaveProject, marks: FloatMark[], cell = 20): void {
  const { ends, picks } = project.loom
  const marginL = 70
  const marginT = 60
  const marginB = 76
  const marginR = 40
  const w = marginL + ends * cell + marginR
  const h = marginT + picks * cell + marginB
  const { canvas, ctx } = makeCanvas(w, h)

  ctx.fillStyle = '#fbf8f1'
  ctx.fillRect(0, 0, w, h)

  paintFabric(ctx, project, marginL, marginT, cell, marks)
  header(ctx, project.name + ' · 织物模拟（颜色与交织结构分离存储）', w)
  drawDirections(ctx, marginL, marginT, ends * cell, picks * cell)
  legend(ctx, 40, h - 30)

  saveCanvas(canvas, safeName(project.name) + '_fabric.png')
}

/**
 * 组织设计意匠图 PNG：穿综 / 吊综或多臂纹板 / 纹板 / 组织图，
 * 标注经向（水平）与纬向（垂直），浮线高亮一并导出。
 */
export function exportDraftPNG(
  project: WeaveProject,
  marks: FloatMark[],
  cell = 20
): void {
  const { shafts, treadles, ends, picks } = project.loom
  const threadingSize = gridPixelSize(shafts, ends, cell)
  const controlCols = project.mode === 'tieup' ? treadles : shafts
  const topRows = project.mode === 'tieup' ? shafts : picks
  const topSize = gridPixelSize(topRows, controlCols, cell)
  const weaveSize = gridPixelSize(picks, ends, cell)
  const bottomRows = project.mode === 'tieup' ? picks : 0
  const bottomSize =
    project.mode === 'tieup' ? gridPixelSize(bottomRows, treadles, cell) : { w: 0, h: 0 }

  const gap = 30
  const headerH = 66
  const dirH = 96
  const col1W = threadingSize.w
  const col2W = Math.max(topSize.w, bottomSize.w)
  const w = 40 + col1W + gap + col2W + 40
  const topY = headerH
  const bottomY = topY + Math.max(threadingSize.h, topSize.h) + gap
  const h = bottomY + Math.max(weaveSize.h, bottomSize.h) + dirH

  const { canvas, ctx } = makeCanvas(w, h)
  ctx.fillStyle = '#fbf8f1'
  ctx.fillRect(0, 0, w, h)
  header(
    ctx,
    `${project.name} · 组织意匠图（${project.mode === 'tieup' ? '吊综 tie-up 模式' : '多臂 dobby 模式'}）`,
    w
  )

  const col1X = 40
  const col2X = 40 + col1W + gap
  const everyE = Math.max(1, Math.ceil(ends / 20))
  const everyP = Math.max(1, Math.ceil(picks / 20))

  // 穿综图：列 = 经纱（1..ends），行 = 综框，第 1 综在最下
  paintGrid(ctx, {
    ox: col1X,
    oy: topY,
    rows: shafts,
    cols: ends,
    cell,
    isOn: (r, c) => project.threading[c] === shafts - 1 - r,
    marker: 'circle',
    onColor: '#7a1f18',
    offColor: '#fbf8f1',
    gridColor: '#9aa4ad',
    labelColor: '#444',
    colLabel: (c) => `经${c + 1}`,
    rowLabel: (r) => `综${shafts - r}`,
    labelEvery: everyE
  })
  label(ctx, col1X + 26, topY - 28, '穿综图（列 = 经纱，行 = 综框，圆点 = 该经穿入此综）')

  if (project.mode === 'tieup') {
    paintGrid(ctx, {
      ox: col2X,
      oy: topY,
      rows: shafts,
      cols: treadles,
      cell,
      isOn: (r, c) => project.tieup[(shafts - 1 - r) * treadles + c] === 1,
      marker: 'square',
      onColor: '#26303f',
      offColor: '#fbf8f1',
      gridColor: '#9aa4ad',
      labelColor: '#444',
      colLabel: (c) => `踏${c + 1}`,
      rowLabel: (r) => `综${shafts - r}`
    })
    label(ctx, col2X + 26, topY - 28, '吊综图（行 = 综框，列 = 踏板，黑格 = 相连）')

    paintGrid(ctx, {
      ox: col2X,
      oy: bottomY,
      rows: picks,
      cols: treadles,
      cell,
      isOn: (r, c) => project.treadling[r] === c,
      marker: 'circle',
      onColor: '#1f3a5f',
      offColor: '#fbf8f1',
      gridColor: '#9aa4ad',
      labelColor: '#444',
      colLabel: (c) => `踏${c + 1}`,
      rowLabel: (r) => `纬${r + 1}`,
      labelEvery: everyP
    })
    label(ctx, col2X + 26, bottomY - 28, '纹板（行 = 纬纱，每纬踩一个踏板）')
  } else {
    paintGrid(ctx, {
      ox: col2X,
      oy: topY,
      rows: picks,
      cols: shafts,
      cell,
      isOn: (r, c) => project.lift[r * shafts + (shafts - 1 - c)] === 1,
      marker: 'square',
      onColor: '#26303f',
      offColor: '#fbf8f1',
      gridColor: '#9aa4ad',
      labelColor: '#444',
      colLabel: (c) => `综${shafts - c}`,
      rowLabel: (r) => `纬${r + 1}`,
      labelEvery: everyP
    })
    label(ctx, col2X + 26, topY - 28, '多臂纹板（行 = 纬纱，列 = 综框，黑格 = 提起）')
  }

  paintGrid(ctx, {
    ox: col1X,
    oy: bottomY,
    rows: picks,
    cols: ends,
    cell,
    isOn: (r, c) => project.weave[r * ends + c] === 1,
    marker: 'square',
    onColor: '#7a1f18',
    offColor: '#f4efe6',
    gridColor: '#9aa4ad',
    labelColor: '#444',
    marks: markMap(marks, ends),
    colLabel: (c) => `经${c + 1}`,
    rowLabel: (r) => `纬${r + 1}`,
    labelEvery: everyE
  })
  label(ctx, col1X + 26, bottomY - 28, '组织图（深色 = 经浮点；红框 = 经浮线，橙框 = 纬浮线）')

  drawDirections(ctx, col1X + 26, bottomY + picks * cell + 16, ends * cell, picks * cell)
  legend(ctx, 40, h - 28)

  saveCanvas(canvas, safeName(project.name) + '_draft.png')
}

// ---------- 通用 ----------

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeName(name: string) {
  return name.replace(/[\\/:*?"<>|\s]+/g, '_') || 'weave'
}

function makeCanvas(w: number, h: number) {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { canvas, ctx }
}

function saveCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (blob) triggerDownload(blob, filename)
  }, 'image/png')
}

function header(ctx: CanvasRenderingContext2D, text: string, w: number) {
  ctx.fillStyle = '#26303f'
  ctx.font = 'bold 18px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(text, w / 2, 18)
}

function label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.fillStyle = '#5b6570'
  ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, x, y)
}

function legend(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.font = '12px "PingFang SC", sans-serif'
  ctx.textBaseline = 'middle'
  const items: [string, string][] = [
    ['#c9302c', '经浮线（经纱连续越过若干纬纱）'],
    ['#d9821f', '纬浮线（纬纱连续越过若干经纱）']
  ]
  let cx = x
  for (const [color, text] of items) {
    ctx.fillStyle = color
    ctx.fillRect(cx, y - 6, 12, 12)
    ctx.fillStyle = '#444'
    ctx.textAlign = 'left'
    ctx.fillText(text, cx + 18, y)
    cx += 18 + ctx.measureText(text).width + 28
  }
}

/** 方向标识：水平红箭头 = 经向（列），垂直蓝箭头 = 纬向（行） */
function drawDirections(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const ay = y + 10
  ctx.strokeStyle = '#7a1f18'
  ctx.fillStyle = '#7a1f18'
  ctx.lineWidth = 2
  arrowLine(ctx, x, ay, x + w, ay)
  ctx.font = 'bold 13px "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('经向 WARP（经纱排列方向 = 水平 / 列）', x + w / 2, ay - 6)

  ctx.strokeStyle = '#1f3a5f'
  ctx.fillStyle = '#1f3a5f'
  const ax = x - 46
  arrowLine(ctx, ax, y + h, ax, y)
  ctx.save()
  ctx.translate(ax - 14, y + h / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('纬向 WEFT（纬纱打入方向 = 垂直 / 行）', 0, 0)
  ctx.restore()
}

function arrowLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = 8
  for (const [px, py, dir] of [
    [x1, y1, angle + Math.PI],
    [x2, y2, angle]
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(px + head * Math.cos(dir - 0.4), py + head * Math.sin(dir - 0.4))
    ctx.lineTo(px + head * Math.cos(dir + 0.4), py + head * Math.sin(dir + 0.4))
    ctx.closePath()
    ctx.fill()
  }
}
