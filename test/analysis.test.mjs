import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeArticles } from '../lib/analysis.js'
import { normalizeArticle } from '../lib/normalize.js'

const mk = (title, desc, interactive, collect = '100', share = '100') => ({
  ...normalizeArticle({ photoId: `p${Math.random()}`, title, desc, useLikeCount: '1000', collectedCount: collect, useCommentCount: '10', useShareCount: share }),
  interactive_num: interactive,
})

test('analyzeArticles：标题特征统计（疑问/感叹/数字/短标题）', () => {
  const articles = [
    mk('怎么才能瘦下来？', '', 100),
    mk('太绝了！这个方法', '', 90),
    mk('5个收纳技巧', '', 80),
    mk('好物', '', 70), // 短标题
    mk('完全普通标题但比较长哦', '', 60),
  ]
  const a = analyzeArticles(articles)
  const types = Object.fromEntries(a.title_types.map((t) => [t.type, t.count]))
  assert.equal(types['疑问句式'], 1)
  assert.equal(types['感叹强调型'], 1)
  assert.equal(types['数字列举型'], 1)
  // ≤10 字的标题有 4 个（一条标题可命中多类，对齐上游）
  assert.equal(types['短标题'], 4)
  assert.equal(types['其他类型'], 1)
  const q = a.title_types.find((t) => t.type === '疑问句式')
  assert.equal(q.pct, '20.0%')
  assert.ok(q.examples[0].url.startsWith('https://www.xiaohongshu.com/explore/'))
})

test('analyzeArticles：主题按 title+desc 命中，一票归一', () => {
  const articles = [mk('普通标题', '今天做了猫饭给猫咪 #宠物', 100), mk('旅行攻略：小众海岛', '', 90), mk('没主题的标题', '', 80)]
  const a = analyzeArticles(articles)
  const themes = Object.fromEntries(a.themes.map((t) => [t.theme, t.count]))
  assert.equal(themes['宠物萌宠'], 1)
  assert.equal(themes['旅行打卡'], 1)
  assert.equal(themes['其他'], 1)
})

test('analyzeArticles：收藏/分享比亮点', () => {
  const a = analyzeArticles([mk('A', '', 100, '15000', '100'), mk('B', '', 90, '15000', '100')])
  assert.ok(a.highlights.some((h) => h.includes('收藏驱动')))
  const b = analyzeArticles([mk('A', '', 100, '100', '15000')])
  assert.ok(b.highlights.some((h) => h.includes('分享驱动')))
})

test('analyzeArticles：黑马集中（互动 >5w）与 markdown 产物', () => {
  const a = analyzeArticles([mk('A', '', 60000), mk('B', '', 52000), mk('C', '', 100)])
  assert.ok(a.highlights.some((h) => h.includes('黑马集中') && h.includes('2条')))
  assert.ok(a.markdown.includes('| 标题类型 |'))
  assert.ok(a.markdown.includes('| 内容分类 |'))
  assert.ok(a.markdown.includes('可参考亮点'))
})

test('analyzeArticles：空数据安全', () => {
  const a = analyzeArticles([])
  assert.deepEqual(a.title_types, [])
  assert.deepEqual(a.themes, [])
  assert.equal(a.markdown, '')
})
