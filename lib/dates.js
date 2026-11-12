// 榜单日期处理（移植自上游 core_workflow.md 日期规则）：
// - 数据每天 17:30 开始更新昨日数据；17:30 前查昨日窗口会返回成功但 0 条
// - 未指定日期：≥17:30 默认查昨天，<17:30 默认查前天
// - 回退窗口固定 7 天前（上游实测稳定可用），日期报错或空数据时自动回退
// - 支持模糊日期词：今天/昨天/前天/大前天/一周前/半个月前/一个月前
const pad = (n) => String(n).padStart(2, '0')

export function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function shiftDate(now, days) {
  return fmtDate(new Date(now.getTime() + days * 86400_000))
}

// 模糊日期词 → 偏移天数
export const FUZZY_DATE_OFFSETS = {
  '今天': 0, '今日': 0,
  '昨天': -1, '昨日': -1,
  '前天': -2, '前日': -2,
  '大前天': -3,
  '一周前': -7,
  '半个月前': -15,
  '一个月前': -30,
}

// 未指定日期时的默认查询日（17:30 分界）
export function defaultRankDate(now = new Date()) {
  const after1730 = now.getHours() > 17 || (now.getHours() === 17 && now.getMinutes() >= 30)
  return shiftDate(now, after1730 ? -1 : -2)
}

// 回退窗口：7 天前（上游实测稳定可用）
export function fallbackRankDate(now = new Date()) {
  return shiftDate(now, -7)
}

/**
 * 解析用户输入的 rankDate：
 * - 空值 → 默认数据日
 * - 模糊日期词 → 偏移换算
 * - yyyy-MM-dd → 校验格式合法（不合法抛错，让调用方提示而不是当默认日查）
 * @returns {{ date: string, fuzzy: boolean }}
 */
export function resolveRankDate(input, now = new Date()) {
  const raw = String(input || '').trim()
  if (!raw) return { date: defaultRankDate(now), fuzzy: false }
  if (raw in FUZZY_DATE_OFFSETS) return { date: shiftDate(now, FUZZY_DATE_OFFSETS[raw]), fuzzy: true }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`日期格式应为 yyyy-MM-dd（收到「${raw}」）。也可以用模糊词：${Object.keys(FUZZY_DATE_OFFSETS).join('/')}。`)
  }
  const [y, m, d] = raw.split('-').map(Number)
  const probe = new Date(y, m - 1, d)
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    throw new Error(`日期不存在：${raw}`)
  }
  return { date: raw, fuzzy: false }
}
