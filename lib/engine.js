// 黑马榜引擎：日期解析 → 分类映射 → 调 RedFox 接口（最多 2 次请求：首次 + 回退）→ 清洗排序。
import { DARKHORSE_PATH, SOURCE_LABEL, postRank, resolveApiKey, resolveApiBase, DateWindowError, InsufficientCreditsError } from './redfox.js'
import { matchCategory, VALID_CATEGORIES } from './categories.js'
import { resolveRankDate, fallbackRankDate } from './dates.js'
import { normalizeArticle, sortArticles, dedupeArticles } from './normalize.js'

// 工具/面板共用的参数装配（settings + config + env → fetch opts）
export function rankOpts({ settings = {}, config = {} } = {}) {
  return {
    apiKey: resolveApiKey({ settings, config }),
    apiBase: resolveApiBase({ settings }),
    proxyUrl: config?.proxyUrl || settings.proxy_url || '',
  }
}

async function callOnce({ category, rankDate, topN, apiKey, apiBase, proxyUrl }) {
  const json = await postRank(DARKHORSE_PATH, {
    category, rankDate, source: SOURCE_LABEL,
  }, { apiKey, apiBase, proxyUrl })
  const raw = Array.isArray(json?.data) ? json.data : (json?.data && Array.isArray(json.data.data) ? json.data.data : [])
  const articles = dedupeArticles(raw.filter((it) => it && typeof it === 'object').map(normalizeArticle))
  return articles
}

/**
 * 抓取黑马爆文榜（同步，秒级返回）。
 * @param {object} opts { category|keyword, rankDate, topN=50, noFallback=false, apiKey, apiBase, proxyUrl }
 * @returns {{ category, rank_date, articles, total_raw, fell_back, fallback_reason, fetched_at }}
 */
export async function fetchRank({
  category, keyword, rankDate, topN = 50, noFallback = false,
  apiKey, apiBase, proxyUrl = '', now = new Date(),
} = {}) {
  const opts = { apiKey, apiBase, proxyUrl }
  if (!apiKey) throw new Error('未配置 RedFox API Key。请到面板「设置」页填入，或在插件配置/环境变量 REDFOX_API_KEY 里配置（获取：https://redfox.hk/settings/api-keys?source=github）。')

  let queryCategory = matchCategory(keyword || category)
  if (VALID_CATEGORIES.includes(category)) queryCategory = category
  const resolved = resolveRankDate(rankDate, now)
  const firstDate = resolved.date
  const fallbackDate = fallbackRankDate(now)

  let articles = []
  let usedDate = firstDate
  let fellBack = false
  let fallbackReason = ''
  let totalRaw = 0

  try {
    articles = await callOnce({ category: queryCategory, rankDate: firstDate, topN, ...opts })
    totalRaw = articles.length
  } catch (err) {
    // 积分不足不回退直接抛；日期类错误或空数据 → 自动回退 7 天前窗口（主流程最多 2 次 API 请求）
    if (err instanceof InsufficientCreditsError) throw err
    const dateError = err instanceof DateWindowError
    if (noFallback || (!dateError && firstDate === fallbackDate)) throw err
    fallbackReason = dateError ? err.message : `指定日期 ${firstDate} 暂无数据`
    articles = await callOnce({ category: queryCategory, rankDate: fallbackDate, topN, ...opts })
    totalRaw = articles.length
    usedDate = fallbackDate
    fellBack = true
  }

  if (!articles.length && !fellBack && !noFallback && firstDate !== fallbackDate) {
    // 成功响应但 0 条：同样回退一次（17:30 前查昨日未更新等场景）
    fallbackReason = `指定日期 ${firstDate} 暂无黑马爆文数据`
    articles = await callOnce({ category: queryCategory, rankDate: fallbackDate, topN, ...opts })
    totalRaw = articles.length
    usedDate = fallbackDate
    fellBack = true
  }

  return {
    category: queryCategory,
    rank_date: usedDate,
    articles: sortArticles(articles, topN),
    total_raw: totalRaw,
    fell_back: fellBack,
    fallback_reason: fallbackReason,
    fetched_at: new Date().toISOString(),
  }
}
