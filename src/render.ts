import type { FloatMark, WeaveProject } from './types'

/** 纯 Canvas 绘制：交互组件与图片导出共用，保证所见即所出。 */

export const PAD_TOP = 20
export const PAD_LEFT = 26
export const PAD_BOTTOM = 6
export const PAD_RIGHT = 6

export interface GridPaintOptions {
  ox: number
  oy: number
  rows: number
  cols: number
  cell: number
  isOn?: (r: number, c: number) => boolean
  /** 0 = 普通二值格；穿综/纹板单选用圆点 */
  marker: 'square' | 'circle'
  onColor: string
  offColor: string
  gridColor: string
  labelColor: string
  marks?: Map<number, FloatMark>
  /** 自定义行/列标签（默认 1 起的序号） */
  rowLabel?: (r: number) => string
  colLabel?: (c: number) => string
  /** 标签每隔几格显示一次，避免大图太密 */
  labelEvery?: number
}

export function gridPixelSize(rows: number, cols: number, cell: number) {
  return {
    w: PAD_LEFT + cols * cell + PAD_RIGHT,
    h: PAD_TOP + rows * cell + PAD_BOTTOM
  }
}

export function paintGrid(ctx: CanvasRenderingContext2D, o: GridPaintOptions) {
  const { ox, oy, rows, cols, cell } = o
  const gx = ox + PAD_LEFT
  const gy = oy + PAD_TOP
  const w = cols * cell
  const h = rows * cell

  ctx.fillStyle = o.offColor
  ctx.fillRect(gx, gy, w, h)

  // 浮点高亮（半透明底色，稍后再画实心组织点覆盖，形成描边效果）
  if (o.marks) {
    for (const [, m] of o.marks) {
      ctx.fillStyle = m.kind === 'warp' ? 'rgba(214,69,65,0.28)' : 'rgba(230,140,40,0.26)'
      ctx.fillRect(gx + m.x * cell, gy + m.y * cell, cell, cell)
    }
  }

  if (o.isOn) {
    ctx.fillStyle = o.onColor
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (o.isOn(r, c)) {
          if (o.marker === 'circle') {
            ctx.beginPath()
            ctx.arc(gx + c * cell + cell / 2, gy + r * cell + cell / 2, cell * 0.34, 0, Math.PI * 2)
            ctx.fill()
          } else {
            ctx.fillRect(gx + c * cell + 1, gy + r * cell + 1, cell - 2, cell - 2)
          }
        }
      }
    }
  }

  // 浮线描边（覆盖在点之上）
  if (o.marks) {
    const lineW = Math.max(1.5, cell * 0.12)
    for (const [, m] of o.marks) {
      ctx.strokeStyle = m.kind === 'warp' ? '#c9302c' : '#d9821f'
      ctx.lineWidth = lineW
      ctx.strokeRect(gx + m.x * cell + lineW / 2, gy + m.y * cell + lineW / 2, cell - lineW, cell - lineW)
    }
  }

  ctx.strokeStyle = o.gridColor
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let c = 0; c <= cols; c++) {
    const x = Math.round(gx + c * cell) + 0.5
    ctx.moveTo(x, gy)
    ctx.lineTo(x, gy + h)
  }
  for (let r = 0; r <= rows; r++) {
    const y = Math.round(gy + r * cell) + 0.5
    ctx.moveTo(gx, y)
    ctx.lineTo(gx + w, y)
  }
  ctx.stroke()

  // 序号
  const every = o.labelEvery ?? 1
  if (every > 0 && cell >= 12) {
    ctx.fillStyle = o.labelColor
    ctx.font = `${Math.min(10, cell * 0.42)}px ui-monospace, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    for (let c = 0; c < cols; c++) {
      if (c % every === 0) {
        ctx.fillText(o.colLabel ? o.colLabel(c) : String(c + 1), gx + c * cell + cell / 2, gy - 3)
      }
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let r = 0; r < rows; r++) {
      if (r % every === 0) {
        ctx.fillText(o.rowLabel ? o.rowLabel(r) : String(r + 1), gx - 5, gy + r * cell + cell / 2)
      }
    }
  }

  return { gx, gy, w, h }
}

/** 构建浮点索引：key = y*cols + x（与网格坐标一一对应） */
export function markMap(marks: FloatMark[] | undefined, cols: number): Map<number, FloatMark> {
  const m = new Map<number, FloatMark>()
  if (!marks) return m
  for (const mark of marks) m.set(mark.y * cols + mark.x, mark)
  return m
}

/**
 * 织物交织模拟。
 * 单元格先铺下层纱，再画上层纱（圆角条带）；结构取自 weave（与颜色严格分离）。
 */
export function paintFabric(
  ctx: CanvasRenderingContext2D,
  project: WeaveProject,
  ox: number,
  oy: number,
  cell: number,
  marks?: FloatMark[]
): { w: number; h: number } {
  const { ends, picks } = project.loom
  const w = ends * cell
  const h = picks * cell
  ctx.fillStyle = project.colors.background
  ctx.fillRect(ox, oy, w, h)

  const thick = Math.max(2, cell - 2)
  const half = thick / 2
  const cx = ox + cell / 2
  const cy = oy + cell / 2

  const warpOver = (x: number, y: number) => project.weave[y * ends + x] === 1

  // 下层纱（整行/整列条带）——为控制大图开销，只在单元格范围内画短条
  for (let y = 0; y < picks; y++) {
    for (let x = 0; x < ends; x++) {
      const px = ox + x * cell
      const py = oy + y * cell
      const over = warpOver(x, y)
      if (over) {
        // 纬纱在下：横向短条
        ctx.fillStyle = project.colors.weft[y]
        roundedRect(ctx, px - 1, cy + y * cell - half, cell + 2, thick, Math.min(3, cell * 0.2))
        ctx.fill()
      } else {
        ctx.fillStyle = project.colors.warp[x]
        roundedRect(ctx, cx + x * cell - half, py - 1, thick, cell + 2, Math.min(3, cell * 0.2))
        ctx.fill()
      }
    }
  }
  for (let y = 0; y < picks; y++) {
    for (let x = 0; x < ends; x++) {
      const px = ox + x * cell
      const py = oy + y * cell
      if (warpOver(x, y)) {
        ctx.fillStyle = project.colors.warp[x]
        roundedRect(ctx, cx + x * cell - half, py - 1, thick, cell + 2, Math.min(3, cell * 0.2))
        ctx.fill()
        // 高光
        ctx.fillStyle = 'rgba(255,255,255,0.22)'
        ctx.fillRect(cx + x * cell - half + 1, py, Math.max(1, thick * 0.18), cell)
      } else {
        ctx.fillStyle = project.colors.weft[y]
        roundedRect(ctx, px - 1, cy + y * cell - half, cell + 2, thick, Math.min(3, cell * 0.2))
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.22)'
        ctx.fillRect(px, cy + y * cell - half + 1, cell, Math.max(1, thick * 0.18))
      }
    }
  }

  if (marks && marks.length) {
    const mm = markMap(marks, ends)
    ctx.lineWidth = Math.max(1.5, cell * 0.14)
    for (const [, m] of mm) {
      ctx.strokeStyle = m.kind === 'warp' ? 'rgba(201,48,44,0.95)' : 'rgba(217,130,31,0.95)'
      ctx.strokeRect(ox + m.x * cell + 1, oy + m.y * cell + 1, cell - 2, cell - 2)
    }
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1
  ctx.strokeRect(ox + 0.5, oy + 0.5, w - 1, h - 1)
  return { w, h }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
