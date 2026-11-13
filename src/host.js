// 小红书黑马爆文榜 · Host 半边（darkhorse_rank 原生工具 + xhs-darkhorse 技能提供方 + 硬规则注入 + 面板数据面）。
// 榜单抓取是同步接口（1-2 次 HTTP 秒回）；榜单呈现与解读由会话模型按技能完成。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { systemSection } from './systemPrompt.js'
import { registerApi } from '../lib/api.js'
import { fetchRank, rankOpts } from '../lib/engine.js'
import { analyzeArticles } from '../lib/analysis.js'
import { VALID_CATEGORIES } from '../lib/categories.js'
import {
  saveRank, getMeta, getRaw, listRanks, publicMeta, getSettings,
} from '../lib/store.js'

export const name = 'xhs-darkhorse' // = cordis.patch.yml 的 id

export const inject = ['tools', 'skills', 'systemPrompt', 'webServer', 'connection']

export const Config = Schema.object({
  injectRules: Schema.boolean().default(true).description('注入黑马榜工作流到系统提示'),
  apiKey: Schema.string().default('').description('RedFox API Key（ak_ 开头；留空读面板设置或环境变量 REDFOX_API_KEY）'),
  proxyUrl: Schema.string().default('').description('HTTP(S) 代理（访问 redfox.hk 用），留空直连'),
})

function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string', description: '给模型看的回执' },
      data: { type: 'string', description: '可选：榜单表格/规律分析/条目明细' },
      footer: { type: 'string', description: '可选：输出时需逐字附带的引擎页脚' },
    },
  },
  render: (_args, value) => text([value.summary, value.data, value.footer].filter(Boolean).join('\n\n')),
}

const result = (ok, summary, data = '', footer = '') => ({ ok, summary, data, footer })

const MAX_TEXT = 58000

// 引擎页脚（输出时逐字附带）
function buildFooter(rank, rankId) {
  return `🐎 数据源：redfox.hk API（小红书黑马爆文榜）· 分类 ${rank.category} · 统计窗口开始日期 ${rank.rank_date} · 记录 ${rankId}`
}

// 单条榜单行（模型可读）
function renderRow(it, idx) {
  const medal = idx === 1 ? '🥇' : idx === 2 ? '🥈' : idx === 3 ? '🥉' : String(idx)
  const pub = it.published_at ? String(it.published_at).slice(5, 16) : '--'
  return `${medal}｜[${it.title}](${it.url})｜[${it.author}](${it.author_url})（${it.author_fans}粉）｜互动 ${it.interactive_count}｜👍${it.like_count} 💬${it.comment_count} ⭐${it.collect_count} 📤${it.share_count}｜${pub}`
}

// ---------------------------------------------------------------------------
// 工具：darkhorse_rank —— fetch / list / history
// ---------------------------------------------------------------------------
export const darkhorseRankTool = {
  name: 'darkhorse_rank',
  description:
    '小红书黑马爆文榜：基于红狐数据挖掘小红书各内容分类下互动表现突出的黑马笔记（最新起量的单日榜单，不限粉丝量级；不是七日爆款周榜）。' +
    '25 个内容分类筛选、近 30 天榜单日期查询、TOP50 榜单 + 爆款规律分析 + 小红书风格 HTML 导出。' +
    '流程：fetch 抓榜（同步秒回）→ 按输出规则把榜单表格与规律分析呈现给用户 → 需要更多条目用 list。' +
    '每次调用扣 RedFox 积分：只查用户明确要求的分类与日期，绝不批量查询。' +
    '需要 RedFox API Key（面板「设置」页或环境变量 REDFOX_API_KEY）。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('fetch 抓榜；list 补读条目；history 历史记录', { enum: ['fetch', 'list', 'history'] }),
      category: str('fetch：25 个标准分类之一（默认「综合全部」）；也可以传自然语言关键词，自动映射到标准分类'),
      rankDate: str('fetch：统计窗口开始日期 yyyy-MM-dd；支持模糊词（今天/昨天/前天/大前天/一周前/半个月前/一个月前）；不传=最近已更新的数据日'),
      topN: num('fetch：返回前 N 条，默认 50（最大 50）'),
      noFallback: str('fetch："true" 时禁用自动回退：指定日期报错或无数据直接返回原因，不自动改查 7 天前窗口'),
      rankId: str('list/history 定位：目标榜单记录 id；缺省=最新一次'),
      limit: num('list：最多返回条数，默认 50'),
      offset: num('list：跳过前 N 条'),
    },
  },
  output: OUTPUT,
  async execute(args, ctxConfig) {
    check(args, this.parameters)
    const cfg = ctxConfig || {}

    // ── fetch ────────────────────────────────────────────────────────────
    if (args.action === 'fetch') {
      const opts = rankOpts({ settings: getSettings(), config: cfg })
      if (!opts.apiKey) {
        return result(false, '未配置 RedFox API Key。请用户到面板「小红书黑马爆文榜 → 设置」填入，或在插件配置/环境变量 REDFOX_API_KEY 里配置（获取：https://redfox.hk/settings/api-keys?source=github）。')
      }
      const topN = Math.min(Math.max(Number(args.topN) || 50, 1), 50)
      const noFallback = args.noFallback === 'true' || args.noFallback === true
      const rank = await fetchRank({
        category: args.category,
        rankDate: args.rankDate,
        topN,
        noFallback,
        ...opts,
      })
      if (!rank.articles.length) {
        return result(false,
          `${rank.category}在统计窗口 ${rank.rank_date} 暂无黑马爆文数据。可建议用户更换分类、或查询更近的窗口（每天 17:30 起更新昨日数据）${rank.fell_back ? '；已自动回退过 7 天前窗口仍无数据' : ''}。不要自动改查其他分类。`,
          '', buildFooter(rank, '未入库'))
      }
      const analysis = analyzeArticles(rank.articles)
      rank.analysis = analysis
      const meta = saveRank(rank)

      const tableLines = [
        `**🏆 ${rank.category === '综合全部' ? '小红书黑马爆文榜' : rank.category + '黑马爆文榜'}（TOP ${Math.min(rank.articles.length, 20)}）**`,
        `统计窗口开始日期：${rank.rank_date}`,
        '',
        '| 序号 | 笔记信息 | 互动总数 | 点赞 | 评论 | 收藏 | 分享 | 发布时间 |',
        '|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---:|',
        ...rank.articles.slice(0, 20).map((it, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1)
          const pub = it.published_at ? String(it.published_at).slice(5, 16) : '--'
          const info = `[${it.title}](${it.url})<br>[${it.author}](${it.author_url})（${it.author_fans} 粉丝）`
          return `| ${medal} | ${info} | ${it.interactive_count} | ${it.like_count} | ${it.comment_count} | ${it.collect_count} | ${it.share_count} | ${pub} |`
        }),
        '',
        `已按互动总量从高到低排列，共 ${rank.articles.length} 条。${rank.articles.length > 20 ? '可以输入"查看更多"展示剩余榜单（用 action="list"）。' : ''}`,
      ]
      if (rank.fell_back) {
        tableLines.unshift(`**指定日期超出服务端可回溯窗口/暂无数据（${rank.fallback_reason}），已自动回退查询统计窗口开始日期 ${rank.rank_date} 的黑马爆文数据。**`, '')
      }

      const summary =
        `已入库（rankId=${meta.rank_id}）。${rank.category} · 统计窗口开始日期 ${rank.rank_date} · 共 ${rank.articles.length} 条黑马爆文（互动总量降序）。` +
        `向用户输出：① 上方榜单表格（原样，含链接与粉丝数）→ ② 下方爆款规律分析（原样，表格含参考笔记链接）→ ③ 25 分类提示 → ④ 末尾逐字附页脚。` +
        `数据断档已自动回退时在最前面注明回退事实。需要 TOP21-50 用 action="list"。` +
        `桌面端 WebContentsView 会 deny window.open/target=_blank，HTML 导出只能在面板内查看——告诉用户点侧栏「小红书黑马爆文榜」的榜单详情页（rankId=${meta.rank_id}）再点「导出 HTML」，不要把磁盘路径当成可点开的入口。`

      const data = [
        tableLines.join('\n'),
        '',
        '**💡 爆款规律分析**',
        '',
        analysis.markdown,
        '',
        `💡 本榜单支持按分类查询，可选分类共 ${VALID_CATEGORIES.length} 个：${VALID_CATEGORIES.join('、')}。`,
      ].join('\n')

      return result(true, summary, data.slice(0, MAX_TEXT), buildFooter(rank, meta.rank_id))
    }

    // ── list ─────────────────────────────────────────────────────────────
    if (args.action === 'list') {
      const meta = resolveRankMeta(args.rankId)
      const raw = getRaw(meta.rank_id)
      if (!raw) throw new Error(`榜单数据缺失：${meta.rank_id}`)
      const pool = raw.articles || []
      const offset = Math.max(Number(args.offset) || 0, 0)
      const limit = Math.min(Number(args.limit) || 50, 50)
      const slice = pool.slice(offset, offset + limit)
      if (!slice.length) return result(false, `没有更多条目（pool=${pool.length}，offset=${offset}）。`)
      const body = slice.map((it, i) => renderRow(it, offset + i + 1)).join('\n')
      return result(true,
        `第 ${offset + 1}-${offset + slice.length} 条 / 共 ${pool.length}（${meta.category}，统计窗口 ${meta.rank_date}）。引用时链接取 url（笔记）与 author_url（作者）。`,
        body.slice(0, MAX_TEXT))
    }

    // ── history ──────────────────────────────────────────────────────────
    if (args.action === 'history') {
      const list = listRanks({ limit: 20 })
      if (!list.length) return result(false, '还没有榜单记录。先 fetch。')
      const lines = list.map((r) =>
        `${r.rank_id}｜${r.category}｜窗口 ${r.rank_date}｜${r.total} 条${r.fell_back ? '｜已回退' : ''}${r.has_report ? '｜有HTML导出' : ''}`)
      return result(true, `共 ${list.length} 次抓取（新→旧）。对历史记录操作传 rankId。`, lines.join('\n').slice(0, MAX_TEXT))
    }

    throw new Error(`未知 action：${args.action}`)
  },
}

function resolveRankMeta(rankId) {
  if (rankId) {
    const meta = getMeta(rankId)
    if (!meta) throw new Error(`榜单记录不存在：${rankId}。用 history 查看已有记录。`)
    return meta
  }
  const [latest] = listRanks({ limit: 1 })
  if (!latest) throw new Error('还没有榜单记录。先 fetch。')
  return getMeta(latest.rank_id)
}

// ---------------------------------------------------------------------------
// 装配
// ---------------------------------------------------------------------------
export function apply(ctx, config) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]

  const toolWithConfig = { ...darkhorseRankTool, execute(args) { return darkhorseRankTool.execute(args, config) } }

  ctx.effect(() => ctx.tools.register(toolWithConfig), `${name}: tool`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)
  if (config.injectRules !== false) {
    ctx.effect(() => ctx.systemPrompt.section(systemSection()), `${name}: workflow`)
  }
  ctx.effect(() => registerApi(ctx, { config }), `${name}: routes`)
}

export { publicMeta }
