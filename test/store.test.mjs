import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// store 依赖 DSH_HOME，必须在 import 前设置
const tmp = mkdtempSync(join(tmpdir(), 'dsh-darkhorse-store-'))
process.env.DSH_HOME = tmp
delete process.env.REDFOX_API_KEY

const { saveRank, getMeta, getRaw, listRanks, publicMeta, deleteRank, getSettings, saveSettings, saveReportHtml, readReportHtml, resolveRank } = await import('../lib/store.js')

test.after(() => { rmSync(tmp, { recursive: true, force: true }) })

const rankFixture = (category, articles) => ({
  category,
  rank_date: '2026-11-10',
  requested_date: '2026-11-11',
  fell_back: false,
  fallback_reason: '',
  top_n: 50,
  articles,
  analysis: { highlights: ['**收藏驱动**：测试'] },
  fetched_at: '2026-11-12T15:00:00.000Z',
})

test('saveRank/listRanks/getMeta/getRaw 全链路', () => {
  const articles = [{ title: 'A', url: 'u1' }, { title: 'B', url: 'u2' }]
  const meta = saveRank(rankFixture('化妆美容', articles))
  assert.ok(meta.rank_id.includes('-化妆美容'))
  const got = getMeta(meta.rank_id)
  assert.equal(got.category, '化妆美容')
  assert.equal(got.total, 2)
  assert.deepEqual(got.highlights, ['**收藏驱动**：测试'])
  const raw = getRaw(meta.rank_id)
  assert.equal(raw.articles.length, 2)
  const pub = publicMeta(got)
  assert.ok(!('articles' in pub) && pub.total === 2 && pub.has_report === false)
  const list = listRanks()
  assert.equal(list.length, 1)
})

test('settings：merge + 读取', () => {
  saveSettings({ api_key: 'ak_test123', proxy_url: 'http://127.0.0.1:7890' })
  const s = getSettings()
  assert.equal(s.api_key, 'ak_test123')
  assert.equal(s.proxy_url, 'http://127.0.0.1:7890')
  saveSettings({ proxy_url: '' })
  assert.equal(getSettings().api_key, 'ak_test123')
  assert.equal(getSettings().proxy_url, '')
})

test('resolveRank：指定 id 与缺省最新', () => {
  const meta = resolveRank(undefined)
  assert.equal(meta.category, '化妆美容')
  assert.equal(resolveRank(meta.rank_id).rank_id, meta.rank_id)
  assert.throws(() => resolveRank('not-exist-id'), /不存在/)
})

test('saveReportHtml/readReportHtml', () => {
  const meta = listRanks()[0]
  const file = saveReportHtml(meta.rank_id, '<html>report</html>')
  assert.ok(existsSync(file))
  assert.equal(readFileSync(readReportHtml(meta.rank_id), 'utf8'), '<html>report</html>')
  assert.equal(publicMeta(getMeta(meta.rank_id)).has_report, true)
})

test('deleteRank 清索引', () => {
  const meta = listRanks()[0]
  assert.deepEqual(deleteRank(meta.rank_id), { ok: true })
  assert.equal(listRanks().length, 0)
  assert.equal(deleteRank(meta.rank_id).ok, false)
})

test('report.js：formatRankHtml 渲染模板占位符', async () => {
  const { formatRankHtml } = await import('../lib/report.js')
  const raw = {
    category: '居家装修',
    rank_date: '2026-11-10',
    articles: [{
      title: '标题<含特殊字符>', url: 'https://www.xiaohongshu.com/explore/p1', author: '作者', author_url: 'https://www.xiaohongshu.com/user/profile/u1',
      author_fans: '4w+', like_count: '2w+', collect_count: '5267', comment_count: '979', share_count: '1115', interactive_count: '27361',
      desc: '好物 #收纳', thumbnail_url: 'https://sns.example.com/t.jpg', avatar_url: '',
      published_at: '2026-11-10 09:04:47',
    }],
  }
  const html = formatRankHtml(raw)
  assert.ok(html.includes('居家装修黑马爆文榜 · 小红书黑马爆文榜TOP'))
  assert.ok(html.includes('2026-11-10 起'))
  assert.ok(html.includes('标题&lt;含特殊字符&gt;'))
  assert.ok(html.includes('https://www.xiaohongshu.com/explore/p1'))
  // 模板自身 JS 里有 typeof html2pdf === 'undefined'，只查占位符残留
  assert.ok(!html.includes('{{KEYWORD}}') && !html.includes('{{TOP_N}}') && !html.includes('{{UPDATE_TIME}}') && !html.includes('{{ARTICLES_HTML}}'))
})

test('engine.fetchRank：走真实 HTTP（假服务器），空数据自动回退', async () => {
  // 覆盖 settings：指向一个只会返回空数据的假服务器
  const { saveSettings: ss } = await import('../lib/store.js')
  const { createServer } = await import('node:http')
  const srv = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const payload = JSON.parse(body || '{}')
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(payload.rankDate === '2026-11-09' ? { code: 2000, data: [] } : { code: 2000, data: [{ photoId: 'p1', title: 'T', interactiveCount: '3w+' }] }))
    })
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  try {
    ss({ api_key: 'ak_engine', api_base: `http://127.0.0.1:${srv.address().port}` })
    const { fetchRank } = await import('../lib/engine.js')
    const r = await fetchRank({ category: '综合全部', rankDate: '2026-11-09', apiKey: 'ak_engine', apiBase: `http://127.0.0.1:${srv.address().port}` })
    // 2026-11-09 空 → 回退 7 天前窗口（相对真实时钟），拿到数据
    assert.equal(r.articles.length, 1)
    assert.equal(r.fell_back, true)
    assert.ok(r.fallback_reason.includes('2026-11-09'))
  } finally {
    await new Promise((r) => srv.close(r))
  }
})
