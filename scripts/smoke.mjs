// 冒烟测试（离线）：假 RedFox 服务器 + 工具直调全链路 + 面板 API 全路由。
// 运行：npm run smoke
const { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const http = await import('node:http')

const tmp = mkdtempSync(join(tmpdir(), 'dsh-darkhorse-smoke-'))
process.env.DSH_HOME = tmp
delete process.env.REDFOX_API_KEY
delete process.env.X_API_KEY

let failed = 0
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!cond) failed++
}

// ── 假 RedFox：黑马榜接口（10 条：互动量乱序 + 一条 interactiveCount=null 靠兜底求和 + 2w+ 格式）──
const ARTICLES = Array.from({ length: 10 }, (_x, i) => ({
  photoId: `photo_${i}`,
  userId: `user_${i}`,
  userName: `作者${i}`,
  fans: i === 0 ? null : `${i}000`,
  publicTime: '2026-11-11 09:04:47',
  title: `${i === 0 ? '被问爆了！' : '实测'}这篇黑马笔记 ${i}（收藏向）`,
  desc: i % 2 === 0 ? '好物分享 #居家 #收纳整理' : '',
  coverUrl: `https://sns-img-hw.xhscdn.com/cover_${i}`,
  thumbnail: `http://sns-img-hw.xhscdn.com/thumb_${i}`,
  userHeadUrl: '',
  useLikeCount: `${9 - i}000`,
  collectedCount: i === 3 ? null : '1000',
  useCommentCount: '200',
  useShareCount: '100',
  interactiveCount: i === 3 ? null : (i === 4 ? '2w+' : String((9 - i) * 1000 + 1300)),
}))

// 指定日期断档：2026-10-01 报日期类错误，回退日期给数据
const srv = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    const reply = (obj) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
    if (req.headers['redfox_api_key'] !== 'ak_smoke') return reply({ code: 401, msg: 'bad key' })
    const payload = JSON.parse(body || '{}')
    if (!payload.category || !payload.rankDate) return reply({ code: 500, data: null, msg: '请求异常，请仔细检查填写的参数是否有误' })
    if (payload.rankDate === '2026-10-01') return reply({ code: 500, data: null, msg: '接口执行异常，积分未扣除: 日期格式错误' })
    if (payload.rankDate === '2026-11-11') return reply({ code: 2000, data: [], msg: '成功' })
    reply({ code: 2000, data: ARTICLES, msg: '成功' })
  })
})
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
mkdirSync(join(tmp, 'xhs-darkhorse'), { recursive: true })
writeFileSync(join(tmp, 'xhs-darkhorse', 'settings.json'), JSON.stringify({ api_key: 'ak_smoke', api_base: `http://127.0.0.1:${srv.address().port}` }))

// ── 工具直调 ──
const { darkhorseRankTool } = await import('../src/host.js')
const call = async (args) => {
  try { return await darkhorseRankTool.execute(args, {}) } catch (e) { return { ok: false, summary: String(e?.message || e) } }
}
let rid
{
  const r = await call({ action: 'fetch', category: '居家装修', rankDate: '2026-11-10' })
  check('fetch 启动并入库', r.ok && r.summary.includes('rankId='), r.summary.slice(0, 60))
  rid = r.summary.match(/rankId=([\p{L}\p{N}-]+)/u)?.[1]
  check('fetch 榜单表头', r.data.includes('黑马爆文榜（TOP') && r.data.includes('统计窗口开始日期：2026-11-10'), '')
  check('fetch 首行是互动量最高的笔记（2w+ 的 i=4）', r.data.split('\n').some((l) => l.startsWith('| 🥇 |') && l.includes('黑马笔记 4')), '')
  check('fetch 互动总数兜底（i=3 null→四项求和 6300）', /\| 6300 \|/.test(r.data), '')
  check('fetch 2w+ 格式解析在规律分析里体现', r.data.includes('爆款规律分析'), '')
  check('fetch 参考笔记带链接', r.data.includes('https://www.xiaohongshu.com/explore/photo_0') && r.data.includes('['), '')
  check('fetch 25 分类提示', r.data.includes('潮流鞋包'), '')
  check('fetch 页脚带记录', (r.footer || '').includes('redfox.hk') && (r.footer || '').includes(rid), (r.footer || '').slice(0, 90))
}
{
  const r = await call({ action: 'fetch', category: '居家装修', rankDate: '2026-10-01', noFallback: 'true' })
  check('noFallback 日期断档如实报错', !r.ok && r.summary.includes('回溯窗口'), r.summary.slice(0, 70))
  const r2 = await call({ action: 'fetch', category: '居家装修', rankDate: '2026-10-01' })
  check('日期断档自动回退 7 天前', r2.ok && r2.summary.includes('2026-') && r2.footer.includes('统计窗口开始日期'), r2.summary.slice(0, 60))
  const r3 = await call({ action: 'fetch', category: '化妆美容', rankDate: '2026-11-11', noFallback: 'true' })
  check('成功但空榜如实说明', !r3.ok && r3.summary.includes('暂无黑马爆文数据'), r3.summary.slice(0, 70))
}
{
  const r = await call({ action: 'fetch', category: '穿搭方面的黑马' })
  check('自然语言映射分类（穿搭→时尚穿搭）', r.ok && r.summary.includes('时尚穿搭'), r.summary.slice(0, 50))
}
{
  const r = await call({ action: 'list', rankId: rid, offset: 8, limit: 5 })
  check('list 补读尾部条目', r.ok && r.summary.includes('第 9-10 条 / 共 10') && r.data.includes('黑马笔记'), r.summary.slice(0, 40))
  const r2 = await call({ action: 'list', rankId: rid, offset: 99 })
  check('list 越界提示', !r2.ok && r2.summary.includes('没有更多条目'), '')
}
{
  const r = await call({ action: 'history' })
  check('history 列表', r.ok && r.data.split('\n').length >= 3, (r.data || '').split('\n')[0])
}
{
  const bad = await call({ action: 'fetch', rankDate: '2026/11/01' })
  check('非法日期格式友好报错', !bad.ok && bad.summary.includes('yyyy-MM-dd'), bad.summary.slice(0, 60))
  const unknown = await call({ action: 'destroy' })
  check('未知 action 报错', !unknown.ok && unknown.summary.includes('只能是'), '')
  const nolimit = await call({ action: 'fetch', extra: 1 })
  check('未知参数拒绝', !nolimit.ok && nolimit.summary.includes('未知参数'), '')
}

// ── 面板 API ──
const { registerApi } = await import('../lib/api.js')
const { Writable } = await import('node:stream')
const { EventEmitter } = await import('node:events')
const routes = {}
registerApi({ get: () => undefined, webServer: { register: (r) => { routes[r.path] = r.handler } } }, { config: {} })
const req = async (method, path, body) => {
  const reqObj = new EventEmitter()
  reqObj.method = method
  reqObj.url = `/xhs-darkhorse${path}`
  reqObj.headers = body ? { 'content-type': 'application/json', host: 'x', origin: 'http://x' } : { host: 'x' }
  const chunks = []
  const resObj = new Writable({ write(c, _e, cb) { chunks.push(c); cb() } })
  resObj.statusCode = 0
  resObj.writeHead = (code) => { resObj.statusCode = code }
  const done = new Promise((resolve) => {
    const origEnd = resObj.end.bind(resObj)
    resObj.end = (...args) => { origEnd(...args); resolve({ status: resObj.statusCode, json: (() => { try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return null } })(), text: () => Buffer.concat(chunks).toString('utf8') }) }
  })
  const p = routes['/xhs-darkhorse'](reqObj, resObj)
  if (body) reqObj.emit('data', Buffer.from(JSON.stringify(body)))
  reqObj.emit('end')
  await p
  return done
}
{
  const cat = await req('GET', '/api/catalog')
  check('catalog：key/25分类/历史', cat.status === 200 && cat.json.has_key && cat.json.categories.length === 25 && cat.json.ranks.length >= 3, `cats=${cat.json?.categories?.length}`)
  const one = await req('GET', `/api/ranks/${rid}`)
  check('榜单详情带 raw+analysis', one.status === 200 && one.json.raw?.articles?.length === 10 && one.json.analysis?.title_types?.length > 0, '')
  check('详情分析含参考笔记链接', JSON.stringify(one.json.analysis).includes('https://www.xiaohongshu.com/explore/photo_'), '')
}
{
  const created = await req('POST', '/api/ranks', { category: '潮流鞋包', rank_date: '', top_n: 20 })
  check('面板直查榜单', created.status === 200 && created.json.ok && created.json.rank.total === 10, `total=${created.json?.rank?.total}`)
  const badCat = await req('POST', '/api/ranks', { category: '不存在分类' })
  check('未知分类 400', badCat.status === 400, '')
  // HTML 导出（0 次数据请求）
  const mk = await req('POST', `/api/ranks/${created.json.rank.rank_id}/report`, {})
  check('面板导出 HTML', mk.status === 200 && mk.json.ok, mk.json?.error || '')
  const rep = await req('GET', `/api/ranks/${created.json.rank.rank_id}/report`)
  const html = rep.text ? rep.text() : ''
  check('导出含榜单内容', rep.status === 200 && html.includes('黑马笔记 0') && html.includes('article-item'), '')
  // 模板自身 JS 有 typeof html2pdf === 'undefined'，只查占位符残留
  check('导出无模板占位符残留', !html.includes('{{KEYWORD}}') && !html.includes('{{TOP_N}}') && !html.includes('{{UPDATE_TIME}}') && !html.includes('{{ARTICLES_HTML}}'), '')
  const del = await req('DELETE', `/api/ranks/${created.json.rank.rank_id}`)
  check('面板删记录', del.status === 200 && del.json.ok, '')
}
{
  const st = await req('GET', '/api/settings')
  check('settings GET 尾号', st.status === 200 && st.json.settings.has_key && st.json.settings.key_tail.length === 6, String(st.json.settings.key_tail))
  const bad = await req('POST', '/api/settings', { api_key: 'no-prefix' })
  check('settings 非 ak_ 拒绝', bad.status === 400, '')
}
{
  const idx = readFileSync(new URL('../lab/index.html', import.meta.url), 'utf8')
  check('lab 引用 scheme/app', idx.includes('app.js') && idx.includes('scheme.js'), '')
  const appjs = readFileSync(new URL('../lab/app.js', import.meta.url), 'utf8')
  check('lab 消息类型与 client 对齐', appjs.includes('xhs-darkhorse:refresh') && appjs.includes('xhs-darkhorse:start-ok'), '')
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  check('client 消息类型一致', client.includes('xhs-darkhorse:refresh') && client.includes('xhs-darkhorse:start-ok'), '')
}

srv.close()
rmSync(tmp, { recursive: true, force: true })
console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
process.exit(failed ? 1 : 0)
