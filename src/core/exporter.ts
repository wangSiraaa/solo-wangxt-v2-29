import type { Project } from '../core/types'
import type { Pattern } from './weave'

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadText(filename: string, text: string): void {
  downloadBlob(filename, new Blob([text], { type: 'application/json;charset=utf-8' }))
}

function setupCanvas(w: number, h: number): { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas')
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  cv.width = w * dpr
  cv.height = h * dpr
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  return { cv, ctx }
}

function drawGridLines(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  cols: number,
  rows: number,
  cell: number,
): void {
  ctx.strokeStyle = '#c8c8c8'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i <= cols; i++) {
    ctx.moveTo(x0 + i * cell + 0.5, y0)
    ctx.lineTo(x0 + i * cell + 0.5, y0 + rows * cell)
  }
  for (let j = 0; j <= rows; j++) {
    ctx.moveTo(x0, y0 + j * cell + 0.5)
    ctx.lineTo(x0 + cols * cell, y0 + j * cell + 0.5)
  }
  ctx.stroke()
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = 7
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6))
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6))
  ctx.stroke()
}

/**
 * 导出标准意匠图 PNG：穿综图（上）+ 纹板图（右上）+ 组织图（中）+ 踏板顺序图（右），
 * 并以箭头与文字明确标出经向（纵向）与纬向（横向）。
 */
export function exportDraftPng(project: Project, pattern: Pattern, floatThreshold: number): void {
  const cell = 16
  const ends = project.threading.length
  const picks = project.treadling.length
  const S = project.shaftCount
  const T = project.treadleCount
  const gap = 12
  const marginL = 110
  const marginT = 92
  const marginR = 40
  const marginB = 56

  const threadingW = ends * cell
  const threadingH = S * cell
  const patternW = ends * cell
  const patternH = picks * cell
  const tieupW = T * cell
  const treadlingW = T * cell

  const width = marginL + Math.max(threadingW, patternW) + gap + Math.max(tieupW, treadlingW) + marginR
  const height = marginT + threadingH + gap + patternH + marginB

  const { cv, ctx } = setupCanvas(width, height)

  // 标题
  ctx.fillStyle = '#1a1a1a'
  ctx.font = 'bold 15px sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(`意匠图 · ${project.name}`, 16, 26)
  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#555'
  ctx.fillText(
    `经纱 ${ends} 根 · 纬纱 ${picks} 根 · 综框 ${S} 页 · 踏板 ${T} 只 · 长浮线阈值 ≥ ${floatThreshold}`,
    16,
    44,
  )
  ctx.fillText('黑色 = 经组织点（经纱在上） · 白色 = 纬组织点（纬纱在上）', 16, 62)

  const xPattern = marginL
  const yThreading = marginT
  const yPattern = marginT + threadingH + gap
  const xTreadling = marginL + patternW + gap

  // 穿综图（行 = 综框，列 = 经纱；底部为第 1 页综）
  for (let s = 0; s < S; s++) {
    for (let x = 0; x < ends; x++) {
      if (project.threading[x] === s) {
        ctx.fillStyle = '#1a1a1a'
        ctx.fillRect(xPattern + x * cell, yThreading + (S - 1 - s) * cell, cell, cell)
      }
    }
  }
  drawGridLines(ctx, xPattern, yThreading, ends, S, cell)

  // 纹板图（行 = 综框，列 = 踏板）
  for (let t = 0; t < T; t++) {
    for (let s = 0; s < S; s++) {
      if (project.tieUp[t] && project.tieUp[t][s]) {
        ctx.fillStyle = '#1a1a1a'
        ctx.fillRect(xTreadling + t * cell, yThreading + (S - 1 - s) * cell, cell, cell)
      }
    }
  }
  drawGridLines(ctx, xTreadling, yThreading, T, S, cell)

  // 组织图
  for (let y = 0; y < picks; y++) {
    for (let x = 0; x < ends; x++) {
      if (pattern[y] && pattern[y][x]) {
        ctx.fillStyle = '#1a1a1a'
        ctx.fillRect(xPattern + x * cell, yPattern + y * cell, cell, cell)
      }
    }
  }
  drawGridLines(ctx, xPattern, yPattern, ends, picks, cell)

  // 踏板顺序图（行 = 纬纱，列 = 踏板）
  for (let y = 0; y < picks; y++) {
    const t = project.treadling[y]
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(xTreadling + t * cell, yPattern + y * cell, cell, cell)
  }
  drawGridLines(ctx, xTreadling, yPattern, T, picks, cell)

  // 经纬颜色条（与结构分开表达）
  const strip = 8
  for (let x = 0; x < ends; x++) {
    ctx.fillStyle = project.warpColors[x] || '#999'
    ctx.fillRect(xPattern + x * cell, yThreading - strip - 4, cell, strip)
  }
  for (let y = 0; y < picks; y++) {
    ctx.fillStyle = project.weftColors[y] || '#999'
    ctx.fillRect(xTreadling + treadlingW + 4, yPattern + y * cell, strip, cell)
  }

  // 面板标签
  ctx.fillStyle = '#1a1a1a'
  ctx.font = 'bold 12px sans-serif'
  ctx.fillText('穿综图', xPattern, yThreading - strip - 10)
  ctx.fillText('纹板图', xTreadling, yThreading - 6)
  ctx.fillText('组织图', xPattern - 40, yPattern + 14)
  ctx.fillText('踏板图', xTreadling, yPattern - 6)

  // 方向标识：经向 = 纵向（沿组织图的列），纬向 = 横向（沿组织图的行）
  ctx.strokeStyle = '#b33900'
  ctx.fillStyle = '#b33900'
  ctx.lineWidth = 2
  ctx.font = 'bold 13px sans-serif'
  // 经向箭头（纵向，画在组织图左侧）
  const wx = xPattern - 26
  drawArrow(ctx, wx, yPattern + patternH - 6, wx, yPattern + 6)
  ctx.save()
  ctx.translate(wx - 8, yPattern + patternH / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.fillText('经向 Warp', 0, 0)
  ctx.restore()
  // 纬向箭头（横向，画在组织图下方）
  const wy = yPattern + patternH + 20
  drawArrow(ctx, xPattern + 6, wy, xPattern + patternW - 6, wy)
  ctx.textAlign = 'center'
  ctx.fillText('纬向 Weft', xPattern + patternW / 2, wy + 16)
  ctx.textAlign = 'left'

  cv.toBlob((blob) => {
    if (blob) downloadBlob(`${project.name}-意匠图.png`, blob)
  }, 'image/png')
}

/** 导出织物预览 PNG（画布上已含经纬方向标识，直接落盘） */
export function exportCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(filename, blob)
  }, 'image/png')
}
