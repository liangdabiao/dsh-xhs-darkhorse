// 条目清洗（移植自上游 normalize_article）：链接拼接、互动总数兜底、2w+/null 兼容。
const URL_BASE = 'https://www.xiaohongshu.com'

export function parseNumber(value) {
  if (value === null || value === undefined) return 0
  const s = String(value).trim().replace(/,/g, '')
  if (!s) return 0
  if (/w/i.test(s)) {
    const n = Number.parseFloat(s.toLowerCase().replace('w', '').replace('+', ''))
    return Number.isFinite(n) ? Math.round(n * 10000) : 0
  }
  const n = Number.parseFloat(s.replace('+', ''))
  return Number.isFinite(n) ? Math.round(n) : 0
}

export function formatNumber(num) {
  const n = Number(num) || 0
  if (n >= 10000) return `${(n / 10000).toFixed(2).replace(/\.?0+$/, '')}w`
  return String(n)
}

export function cleanText(text) {
  if (!text) return ''
  return String(text).replace(/[ \n\r\t]+/g, ' ').trim()
}

function safeUrl(u) {
  const s = String(u || '').trim()
  return /^https?:\/\//.test(s) ? s : ''
}

// 笔记封面统一 https（thumbnail/coverUrl 混有 http://，桌面 https 页面里是混合内容会被拦）
function httpsUrl(u) {
  const s = safeUrl(u)
  return s.replace(/^http:\/\//, 'https://')
}

export function normalizeArticle(item = {}) {
  const photoId = String(item.photoId || '').trim()
  const userId = String(item.userId || '').trim()
  const likes = String(item.useLikeCount ?? '0') || '0'
  const collects = String(item.collectedCount ?? '0') || '0'
  const comments = String(item.useCommentCount ?? '0') || '0'
  const shares = String(item.useShareCount ?? '0') || '0'
  let interactive = item.interactiveCount
  if (interactive === null || interactive === undefined || parseNumber(interactive) <= 0) {
    interactive = String(parseNumber(likes) + parseNumber(collects) + parseNumber(comments) + parseNumber(shares))
  }
  return {
    title: cleanText(item.title) || '无笔记标题',
    photo_id: photoId,
    url: photoId ? `${URL_BASE}/explore/${photoId}` : '',
    user_id: userId,
    author: cleanText(item.userName) || '未知作者',
    author_url: userId ? `${URL_BASE}/user/profile/${userId}` : '',
    author_fans: String(item.fans ?? '') || '0',
    like_count: likes,
    collect_count: collects,
    comment_count: comments,
    share_count: shares,
    interactive_count: String(interactive),
    interactive_num: parseNumber(interactive),
    desc: cleanText(item.desc),
    cover_url: httpsUrl(item.coverUrl),
    thumbnail_url: httpsUrl(item.thumbnail),
    avatar_url: httpsUrl(item.userHeadUrl),
    published_at: String(item.publicTime ?? '') || '',
  }
}

export function sortArticles(articles, topN = 50) {
  return [...articles]
    .sort((a, b) => b.interactive_num - a.interactive_num)
    .slice(0, topN)
}

export function dedupeArticles(articles) {
  const seen = new Set()
  return articles.filter((a) => {
    const key = a.photo_id || a.url || `${a.title}|${a.author}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
