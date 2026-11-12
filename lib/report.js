// 小红书风格 HTML 导出（移植自上游 get_article_html/generate_content_analysis + assets/preview-template.html）。
// 从已入库榜单渲染（0 次数据请求），模板占位符：{{KEYWORD}}/{{TOP_N}}/{{UPDATE_TIME}}/{{ARTICLES_HTML}}。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { esc } from './html.js'

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), 'template.html')

function contentAnalysis(it) {
  const parts = []
  const title = (it.title && it.title !== '无笔记标题') ? it.title : ''
  if (title) parts.push(`笔记主题围绕「${title.slice(0, 30)}${title.length > 30 ? '...' : ''}」展开`)
  const desc = it.desc || ''
  if (desc) {
    const tags = [...desc.matchAll(/#([^\s#]+)/g)].map((m) => m[1])
    if (tags.length) parts.push(`内容涵盖${tags.slice(0, 5).join('、')}等话题`)
    const type = ['穿搭', '搭配', '时尚', '潮流'].some((w) => desc.includes(w)) ? '穿搭分享'
      : ['美食', '探店', '料理', '味道'].some((w) => desc.includes(w)) ? '美食探店'
      : ['旅行', '景点', '打卡', '攻略'].some((w) => desc.includes(w)) ? '旅行攻略'
      : ['护肤', '化妆', '彩妆', '保养'].some((w) => desc.includes(w)) ? '美妆护肤'
      : ['健身', '运动', '减肥', '瑜伽'].some((w) => desc.includes(w)) ? '健身运动'
      : '生活分享'
    parts.push(`属于${type}类型`)
  }
  const analysis = parts.length ? `${parts.join('，')}，获得了较好的用户互动和传播效果` : '内容吸引了用户的关注和互动'
  return esc(analysis)
}

function articleHtml(it, rank) {
  const stats = [
    ['❤️ 点赞', it.like_count],
    ['⭐ 收藏', it.collect_count],
    ['💬 评论', it.comment_count],
    ['📤 分享', it.share_count],
    ['互动总数', it.interactive_count],
  ].map(([label, value]) =>
    `<div class="info-item"><span class="info-stat">${esc(label)} <span class="info-stat-value">${esc(value)}</span></span></div>`)
    .join('')
  const author = it.avatar_url
    ? `<img src="${esc(it.avatar_url)}" class="author-avatar" alt="${esc(it.author)}" referrerpolicy="no-referrer">${esc(it.author)}（${esc(it.author_fans)} 粉丝）`
    : `<span class="author-avatar-placeholder"></span>${esc(it.author)}（${esc(it.author_fans)} 粉丝）`
  const titleLink = it.url
    ? `<a href="${esc(it.url)}" target="_blank" class="article-title">${esc(it.title)}</a>`
    : `<span class="article-title">${esc(it.title)}</span>`
  const authorLink = it.author_url
    ? `<a href="${esc(it.author_url)}" target="_blank" class="info-source-link">${author}</a>`
    : `<span class="info-source-link">${author}</span>`
  return `
    <div class="article-item">
      <div class="article-body">
        <div class="article-rank ${rank <= 3 ? 'top' : ''}">${rank}</div>
        <div class="article-content">
          ${titleLink}
          <div class="article-info">${authorLink}${stats}</div>
          <div class="article-analysis">
            <div class="analysis-label">🔍 内容分析</div>
            <div class="analysis-text">${contentAnalysis(it)}</div>
          </div>
        </div>
      </div>
    </div>`
}

export function formatRankHtml(raw, { topN = 50 } = {}) {
  let template
  try {
    template = readFileSync(TEMPLATE, 'utf8')
  } catch (err) {
    throw new Error(`无法读取模板文件 ${TEMPLATE}: ${err.message}`)
  }
  const articles = Array.isArray(raw?.articles) ? raw.articles : []
  const articlesHtml = articles.slice(0, topN).map((it, i) => articleHtml(it, i + 1)).join('')
  const keyword = raw.category === '综合全部' ? '小红书黑马爆文榜' : `${raw.category}黑马爆文榜`
  const updateTime = `${raw.rank_date} 起`
  return template
    .replaceAll('{{KEYWORD}}', esc(keyword))
    .replaceAll('{{TOP_N}}', String(Math.min(articles.length, topN)))
    .replaceAll('{{UPDATE_TIME}}', esc(updateTime))
    .replaceAll('{{ARTICLES_HTML}}', articlesHtml)
}
