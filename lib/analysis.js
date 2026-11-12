// 爆款规律分析（移植自上游 generate_insights_analysis，确定性规则，不调模型）：
// 标题特征表 / 内容主题表 / 可参考亮点。参考笔记均带可跳转链接。
import { parseNumber } from './normalize.js'

const TITLE_TYPES = [
  { type: '短标题', feature: '≤10字，简洁有力', template: 'XX的XX/XX就是XX', effect: '快速抓住注意力，降低阅读门槛',
    test: (t) => [...t].length <= 10 },
  { type: '疑问句式', feature: '含？/吗/如何/为什么', template: 'XX吗？/如何XX？/为什么XX？', effect: '激发好奇心，引导点击查看答案',
    test: (t) => /[?？]|吗|如何|为什么|怎么/.test(t) },
  { type: '情感化表达', feature: '含情感关键词（笑/哭/爱/泪）', template: '太XX了！/XX到哭/谁懂XX', effect: '引发情感共鸣，增强代入感',
    test: (t) => ['笑', '哭', '爱', '心', '泪', '喜', '悲', '感动', '心疼', '温暖'].some((w) => t.includes(w)) },
  { type: '数字列举型', feature: '含数字/N条/N个', template: 'N个XX/N条XX/XX第N天', effect: '信息量明确，用户预期清晰',
    test: (t) => /\d/.test(t) },
  { type: '感叹强调型', feature: '含！/太/超/绝', template: '太XX了！/超XX！/绝绝子', effect: '强化语气，传递强烈情绪',
    test: (t) => /[!！]|太|超|绝/.test(t) },
  { type: '悬念留白型', feature: '含居然/竟然/没想到', template: '居然XX/竟然XX/没想到XX', effect: '制造信息差，驱动点击揭秘',
    test: (t) => ['居然', '竟然', '没想到', '原来'].some((w) => t.includes(w)) },
]

const THEME_DEFS = {
  '宠物萌宠': { keywords: ['宠物', '猫', '狗', '动物', '小猫', '小狗', '猫咪', '狗狗', '橘猫', '布偶'], feature: '萌宠日常/宠物搞笑/养宠经验', effect: '高互动高收藏，情感共鸣强' },
  '美食探店': { keywords: ['美食', '吃', '料理', '味道', '吃货', '饭', '食谱', '烘焙', '烹饪'], feature: '美食教程/探店推荐/食谱分享', effect: '收藏率极高，实用性强' },
  '时尚穿搭': { keywords: ['穿搭', '时尚', '搭配', '衣服', 'OOTD', '裙子'], feature: '穿搭灵感/平价好物/搭配技巧', effect: '分享率高，传播力强' },
  '旅行打卡': { keywords: ['旅行', '景点', '打卡', '攻略', '旅游', '出游', '拍照'], feature: '旅行攻略/小众景点/拍照指南', effect: '收藏分享双高，攻略价值大' },
  '美妆护肤': { keywords: ['护肤', '化妆', '彩妆', '保养', '美妆', '口红', '面膜'], feature: '护肤心得/好物推荐/妆容教程', effect: '收藏率高，用户粘性强' },
  '情感生活': { keywords: ['情感', '生活', '日常', '家庭', '父母', '爸妈', '老公', '老婆', '闺蜜'], feature: '生活记录/情感故事/日常感悟', effect: '评论互动高，共鸣感强' },
  '搞笑娱乐': { keywords: ['搞笑', '哈哈', '笑', '幽默', '梗', '段子', '沙雕'], feature: '搞笑段子/生活趣事/反差内容', effect: '分享率最高，传播力最强' },
  '知识科普': { keywords: ['知识', '学习', '教育', '学霸', '干货', '技巧', '方法', '教程'], feature: '干货分享/知识科普/方法总结', effect: '收藏率最高，长尾效应强' },
  '健身运动': { keywords: ['健身', '运动', '减肥', '瑜伽', '锻炼', '跑步', '瘦'], feature: '健身打卡/减肥记录/运动教程', effect: '互动稳定，用户追随感强' },
}

const pct = (count, total) => total ? `${((count * 100) / total).toFixed(1)}%` : '0%'

const shortTitle = (t) => (t || '').replace(/\s+/g, ' ').slice(0, 15)

function refNotes(examples) {
  return examples.slice(0, 5).map((e) =>
    e.url ? `[${shortTitle(e.title)}](${e.url})` : shortTitle(e.title) || '无标题')
}

export function analyzeArticles(articles = []) {
  const total = articles.length
  if (!total) return { title_types: [], themes: [], highlights: [], markdown: '' }

  // ── 标题特征：一条标题可命中多类（对齐上游逻辑），未命中进「其他类型」──
  const titleStats = TITLE_TYPES.map((def) => ({ ...def, count: 0, examples: [] }))
  let otherCount = 0
  const otherExamples = []
  for (const a of articles) {
    const title = a.title === '无笔记标题' ? '' : a.title
    const ex = { title, url: a.url }
    if (!title) { otherCount++; if (otherExamples.length < 5) otherExamples.push(ex); continue }
    let matched = false
    for (const stat of titleStats) {
      if (stat.test(title)) {
        stat.count++
        if (stat.examples.length < 5) stat.examples.push(ex)
        matched = true
      }
    }
    if (!matched) { otherCount++; if (otherExamples.length < 5) otherExamples.push(ex) }
  }
  const titleTypes = titleStats
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .map(({ test, ...rest }) => ({ ...rest, pct: pct(rest.count, total) }))
  if (otherCount > 0) {
    titleTypes.push({ type: '其他类型', count: otherCount, examples: otherExamples, pct: pct(otherCount, total), feature: '无显著特征标记', template: 'XX的XX/XX和XX', effect: '靠内容本身质量驱动传播' })
  }

  // ── 内容主题：按 title+desc 关键词命中（一票即归该主题，对齐上游 break 行为）──
  const themes = Object.entries(THEME_DEFS).map(([theme, def]) => ({ theme, ...def, count: 0, examples: [] }))
  const other = { theme: '其他', count: 0, examples: [], feature: '多元内容，无明确分类', effect: '内容质量驱动传播' }
  for (const a of articles) {
    const text = `${a.title || ''}${a.desc || ''}`
    const hit = themes.find((t) => t.keywords.some((k) => text.includes(k)))
    const target = hit || other
    target.count++
    if (target.examples.length < 5) target.examples.push({ title: a.title, url: a.url })
  }
  const themeRows = [...themes, other]
    .filter((t) => t.count > 0)
    .map(({ keywords, ...rest }) => ({ ...rest, pct: pct(rest.count, total) }))

  // ── 可参考亮点 ──
  const highlights = []
  const highInteractive = articles.filter((a) => a.interactive_num > 50000)
  if (highInteractive.length) {
    highlights.push(`**黑马集中**：${highInteractive.length}条笔记互动总数突破5w，近期该方向流量正在起量`)
  }
  const totalCollect = articles.reduce((n, a) => n + parseNumber(a.collect_count), 0)
  const totalShare = articles.reduce((n, a) => n + parseNumber(a.share_count), 0)
  if (totalCollect > 0 && totalShare > 0) {
    const ratio = totalCollect / totalShare
    if (ratio > 1.5) highlights.push(`**收藏驱动**：收藏数是分享数的${ratio.toFixed(1)}倍，用户倾向收藏保存`)
    else if (ratio < 0.7) highlights.push(`**分享驱动**：分享数是收藏数的${(1 / ratio).toFixed(1)}倍，用户倾向主动传播`)
  }
  const top5Text = articles.slice(0, 5).map((a) => `${a.desc || ''} ${a.title || ''}`).join(' ')
  if (top5Text.includes('猫') || top5Text.includes('狗') || top5Text.includes('宠物')) {
    highlights.push('**宠物经济**：TOP5中宠物内容占比高，萌宠内容易引发情感共鸣')
  }
  if (top5Text.includes('笑') || top5Text.includes('搞笑') || top5Text.includes('哈哈')) {
    highlights.push('**幽默元素**：搞笑娱乐内容容易获得高互动')
  }
  if (top5Text.includes('真实') || top5Text.includes('生活')) {
    highlights.push('**真实记录**：真实生活分享更受用户欢迎')
  }
  const longDesc = articles.filter((a) => (a.desc || '').length > 50)
  if (longDesc.length > articles.length * 0.6) {
    highlights.push(`**详实描述**：${longDesc.length}篇笔记使用详细描述，信息密度高`)
  }

  // ── Markdown（工具输出用）──
  const md = [
    `基于全部 ${total} 条数据：`,
    '',
    '**1. 标题特征**',
    '',
    '| 标题类型 | 标题特征 | 占比 | 标题模版 | 描述（引发作用） | 参考笔记 |',
    '|:-------:|:-------:|:----:|:-------:|:--------------:|:-------:|',
    ...titleTypes.map((t) => `| ${t.type} | ${t.feature} | ${t.pct} | ${t.template} | ${t.effect} | ${refNotes(t.examples).join('、')} |`),
    '',
    '**2. 内容主题**',
    '',
    '| 内容分类 | 内容特征 | 占比 | 实际效果 | 参考笔记 |',
    '|:-------:|:-------:|:----:|:-------:|:-------:|',
    ...themeRows.map((t) => `| ${t.theme} | ${t.feature} | ${t.pct} | ${t.effect} | ${refNotes(t.examples).join('、')} |`),
    '',
    '**3. 可参考亮点**',
    '',
    ...(highlights.length ? highlights.map((h) => `- ${h}`) : ['- 本期数据未命中典型亮点规则，以榜单本身为参考即可']),
  ].join('\n')

  return { title_types: titleTypes, themes: themeRows, highlights, markdown: md }
}
