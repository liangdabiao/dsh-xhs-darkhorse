// 面板数据面：/xhs-darkhorse 前缀路由（榜单抓取 + 记录管理 + HTML 导出 + 设置）。
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  saveRank, getMeta, getRaw, listRanks, deleteRank, getSettings, saveSettings,
  publicMeta, saveReportHtml, readReportHtml, DATA_DIR,
} from './store.js'
import { fetchRank, rankOpts } from './engine.js'
import { formatRankHtml } from './report.js'
import { openExternal, injectOpenLinks } from './open.js'
import { VALID_CATEGORIES } from './categories.js'
import { analyzeArticles } from './analysis.js'

const BASE = '/xhs-darkhorse'
const LAB = fileURLToPath(new URL('../lab/', import.meta.url))

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
}

function json(res, statusCode, value) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return false // dsh 0.2.x 宿主已 token 鉴权
  return connection.requestRejection({ headers: req.headers })
}

function safeFile(dir, rel) {
  if (!dir || String(rel).split('/').some((p) => p.startsWith('.'))) return null
  let base
  try { base = realpathSync(dir) } catch { return null }
  const file = normalize(join(base, rel))
  if (!file.startsWith(base + sep) || !existsSync(file)) return null
  const real = realpathSync(file)
  return real.startsWith(base + sep) && statSync(real).isFile() ? real : null
}

function serveFile(req, res, file) {
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': statSync(file).size,
    'cache-control': 'no-cache',
  })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

function readJson(req, max = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const origin = req.headers.origin
    if (req.method !== 'POST') return reject(Object.assign(new Error('method'), { status: 405 }))
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('type'), { status: 415 }))
    if (origin && origin.replace(/^https?:\/\//, '') !== req.headers.host) return reject(Object.assign(new Error('origin'), { status: 403 }))
    let size = 0
    const chunks = []
    req.on('data', (c) => { size += c.length; if (size > max) req.destroy(); else chunks.push(c) })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (e) { reject(Object.assign(e, { status: 400 })) } })
    req.on('error', reject)
  })
}

function readVersion() {
  try { return JSON.parse(readFileSync(join(LAB, '..', 'package.json'), 'utf8')).version } catch { return '' }
}

export function registerApi(ctx, hooks = {}) {
  return ctx.webServer.register({
    kind: 'prefix',
    path: BASE,
    async handler(req, res) {
      try {
        const rejection = requestRejection(ctx, req)
        if (typeof rejection === 'number') return json(res, rejection, { error: '未授权' })

        const url = new URL(req.url, 'http://x')
        if (!url.pathname.startsWith(BASE + '/') && url.pathname !== BASE) return json(res, 404, { error: 'not found' })
        const path = decodeURIComponent(url.pathname.slice(BASE.length)) || '/'

        // ---- API ----
        if (path === '/api/catalog' && req.method === 'GET') {
          const settings = getSettings()
          return json(res, 200, {
            version: readVersion(),
            dataDir: DATA_DIR,
            categories: VALID_CATEGORIES,
            has_key: Boolean(settings.api_key || process.env.REDFOX_API_KEY || process.env.X_API_KEY),
            key_source: settings.api_key ? 'settings' : ((process.env.REDFOX_API_KEY || process.env.X_API_KEY) ? 'env' : 'none'),
            ranks: listRanks({ limit: 50 }),
            settings: { proxy_url: settings.proxy_url || '', api_base: settings.api_base || '' },
          })
        }

        if (path === '/api/ranks' && req.method === 'GET') return json(res, 200, { ranks: listRanks({ limit: 100 }) })

        if (path === '/api/ranks' && req.method === 'POST') {
          try {
            const body = await readJson(req)
            const opts = rankOpts({ settings: getSettings(), config: hooks.config })
            if (!opts.apiKey) return json(res, 400, { ok: false, error: '未配置 RedFox API Key（设置页或插件配置/环境变量 REDFOX_API_KEY）' })
            const category = String(body.category || '').trim() || '综合全部'
            if (!VALID_CATEGORIES.includes(category)) return json(res, 400, { ok: false, error: `未知分类：${category}（共 ${VALID_CATEGORIES.length} 个标准分类）` })
            const topN = Math.min(Math.max(Number(body.top_n) || 50, 1), 50)
            const rankDate = String(body.rank_date || '').trim()
            const data = await fetchRank({ category, rankDate, topN, ...opts })
            data.requested_date = rankDate || data.rank_date
            const meta = saveRank(data)
            return json(res, 200, { ok: true, rank: publicMeta(meta) })
          } catch (e) { return json(res, e.status || 400, { ok: false, error: e.message }) }
        }

        const rMatch = path.match(/^\/api\/ranks\/([^/]+)(\/.*)?$/)
        if (rMatch) {
          const rankId = rMatch[1]
          const sub = rMatch[2] || ''
          const meta = getMeta(rankId)
          if (!meta) return json(res, 404, { error: `榜单记录不存在: ${rankId}` })

          if (!sub && req.method === 'GET') {
            const raw = getRaw(rankId)
            const analysis = analyzeArticles(raw?.articles || [])
            return json(res, 200, { rank: publicMeta(meta), raw: raw || null, analysis })
          }
          if (!sub && req.method === 'DELETE') return json(res, 200, deleteRank(rankId))
          if (sub === '/report' && (req.method === 'GET' || req.method === 'HEAD')) {
            const file = readReportHtml(rankId)
            if (!file) return json(res, 404, { error: 'HTML 导出还没生成——点「导出 HTML」即可从本地数据渲染（0 次请求）' })
            const html = injectOpenLinks(readFileSync(file, 'utf8'))
            res.writeHead(200, {
              'content-type': 'text/html; charset=utf-8',
              'content-length': Buffer.byteLength(html),
              'cache-control': 'no-cache',
            })
            return res.end(req.method === 'HEAD' ? undefined : html)
          }
          if (sub === '/report' && req.method === 'POST') {
            try {
              const raw = getRaw(rankId)
              if (!raw) return json(res, 404, { ok: false, error: '榜单数据缺失' })
              await readJson(req).catch(() => ({}))
              const html = formatRankHtml(raw)
              const file = saveReportHtml(rankId, html)
              return json(res, 200, { ok: true, file })
            } catch (e) { return json(res, e.status || 400, { ok: false, error: e.message }) }
          }
          return json(res, 404, { error: 'not found' })
        }

        if (path === '/api/settings' && req.method === 'GET') {
          const settings = getSettings()
          const key = String(settings.api_key || '')
          return json(res, 200, {
            settings: {
              has_key: Boolean(key || process.env.REDFOX_API_KEY || process.env.X_API_KEY),
              key_tail: key ? key.slice(-6) : '',
              from_env: Boolean(process.env.REDFOX_API_KEY || process.env.X_API_KEY),
              proxy_url: settings.proxy_url || '',
              api_base: settings.api_base || '',
            },
          })
        }
        if (path === '/api/settings' && req.method === 'POST') {
          try {
            const body = await readJson(req)
            const patch = {}
            if (body.api_key !== undefined) {
              const key = String(body.api_key).trim()
              if (key && !key.startsWith('ak_')) return json(res, 400, { ok: false, error: 'RedFox API Key 以 ak_ 开头，请检查' })
              patch.api_key = key
            }
            if (body.proxy_url !== undefined) patch.proxy_url = String(body.proxy_url).trim()
            if (body.api_base !== undefined) patch.api_base = String(body.api_base).trim()
            const next = saveSettings(patch)
            return json(res, 200, { ok: true, has_key: Boolean(next.api_key || process.env.REDFOX_API_KEY) })
          } catch (e) { return json(res, e.status || 400, { ok: false, error: e.message }) }
        }
        // 打开外部链接：桌面端 iframe 里 window.open 会被 deny，只能由宿主用系统浏览器打开
        if (path === '/api/open' && req.method === 'POST') {
          try {
            const body = await readJson(req, 4 * 1024)
            const opened = await openExternal(body.url)
            return json(res, 200, { ok: true, mode: 'system', opened })
          } catch (e) { return json(res, e.status || 400, { ok: false, error: e.message }) }
        }
        if (path.startsWith('/api/')) return json(res, 404, { error: 'not found' })

        // ---- 静态页面 ----
        if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' })
        const file = safeFile(LAB, path === '/' ? 'index.html' : path.replace(/^\/+/, ''))
        return file ? serveFile(req, res, file) : json(res, 404, { error: 'not found' })
      } catch (err) {
        json(res, 500, { error: err?.message || '内部错误' })
      }
    },
  })
}
