import test from 'node:test'
import assert from 'node:assert/strict'
import { parseNumber, formatNumber, normalizeArticle, sortArticles, dedupeArticles } from '../lib/normalize.js'

test('parseNumber：纯数字/千分位/加号', () => {
  assert.equal(parseNumber('5000'), 5000)
  assert.equal(parseNumber('5,000'), 5000)
  assert.equal(parseNumber('+300'), 300)
  assert.equal(parseNumber(''), 0)
  assert.equal(parseNumber(null), 0)
  assert.equal(parseNumber(undefined), 0)
})

test('parseNumber：2w+/13w 格式按 1w=10000', () => {
  assert.equal(parseNumber('2w+'), 20000)
  assert.equal(parseNumber('4w'), 40000)
  assert.equal(parseNumber('1.5w'), 15000)
})

test('formatNumber：过万显示 w', () => {
  assert.equal(formatNumber(20000), '2w')
  assert.equal(formatNumber(5267), '5267')
})

test('normalizeArticle：链接拼接 + 互动总数兜底 + null 字段', () => {
  const it = normalizeArticle({
    photoId: 'abc', userId: 'u1', userName: '作者',
    useLikeCount: '2w+', collectedCount: '5267', useCommentCount: '979', useShareCount: '1115',
    interactiveCount: null, fans: null, desc: null, coverUrl: '', thumbnail: 'http://sns.example.com/t', userHeadUrl: null,
  })
  assert.equal(it.url, 'https://www.xiaohongshu.com/explore/abc')
  assert.equal(it.author_url, 'https://www.xiaohongshu.com/user/profile/u1')
  // 2w+ + 5267 + 979 + 1115 = 27361
  assert.equal(it.interactive_num, 27361)
  assert.equal(it.author, '作者')
  assert.equal(it.author_fans, '0')
  assert.equal(it.desc, '')
  // http 缩略图升级 https
  assert.equal(it.thumbnail_url, 'https://sns.example.com/t')
})

test('normalizeArticle：interactiveCount 有值不兜底', () => {
  const it = normalizeArticle({ photoId: 'a', interactiveCount: '1.4w+' })
  assert.equal(it.interactive_num, 14000)
})

test('normalizeArticle：无标题兜底 + 空作者', () => {
  const it = normalizeArticle({ title: '   ', userName: null })
  assert.equal(it.title, '无笔记标题')
  assert.equal(it.author, '未知作者')
})

test('sortArticles：按互动总量降序取 TOP N', () => {
  const items = [100, 300, 200, 50].map((n) => ({ ...normalizeArticle({ photoId: `p${n}` }), interactive_num: n }))
  const sorted = sortArticles(items, 3)
  assert.deepEqual(sorted.map((i) => i.interactive_num), [300, 200, 100])
})

test('dedupeArticles：photoId 去重', () => {
  const items = [normalizeArticle({ photoId: 'x' }), normalizeArticle({ photoId: 'x', title: '另一篇' }), normalizeArticle({ photoId: 'y' })]
  assert.equal(dedupeArticles(items).length, 2)
})
