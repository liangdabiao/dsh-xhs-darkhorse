// RedFox API · 小红书黑马爆文榜传输层。
// 与 geo-analyzer/cn30 同款：JSON POST + 可选 CONNECT 隧道代理；双 header（X-API-KEY / REDFOX_API_KEY）；
// 3108 限频退避、3201 积分不足不重试；业务响应到达后不再重试（防重复扣积分）。
import http from 'node:http'
import https from 'node:https'
import { TLSSocket } from 'node:tls'

export const DEFAULT_API_BASE = 'https://redfox.hk'
export const DARKHORSE_PATH = '/story/api/cozeSkill/getLowPowderExplosiveArticle'
export const SOURCE_LABEL = '小红书黑马爆文榜-dsh'

export function resolveApiKey({ settings = {}, config = {} } = {}) {
  return String(config.apiKey || settings.api_key || process.env.REDFOX_API_KEY || process.env.X_API_KEY || '').trim()
}

export function resolveApiBase({ settings = {} } = {}) {
  const base = String(settings.api_base || process.env.REDFOX_API_BASE || '').trim()
  return (base || DEFAULT_API_BASE).replace(/\/+$/, '')
}

// ── 传输层（geo-analyzer 同款）──────────────────────────────────────────

function connectTunnel(proxyUrl, targetHost, targetPort, timeout) {
  return new Promise((resolve, reject) => {
    const proxy = new URL(proxyUrl)
    const req = http.request({
      host: proxy.hostname,
      port: Number(proxy.port) || 80,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers: { host: `${targetHost}:${targetPort}` },
      timeout,
    })
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); reject(new Error(`proxy CONNECT ${res.statusCode}`)); return }
      resolve(socket)
    })
    req.on('timeout', () => req.destroy(new Error('proxy connect timeout')))
    req.on('error', reject)
    req.end()
  })
}

export function httpPostJson(url, body, { timeout = 45000, proxyUrl = '', headers = {} } = {}) {
  const u = new URL(url)
  const isHttp = u.protocol === 'http:'
  const port = Number(u.port) || (isHttp ? 80 : 443)
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  const transport = isHttp ? http : https
  const opts = {
    host: u.hostname,
    port,
    method: 'POST',
    path: `${u.pathname}${u.search}`,
    headers: {
      'content-type': 'application/json',
      'content-length': payload.length,
      ...headers,
    },
  }
  return new Promise((resolve, reject) => {
    const finish = (socket) => {
      const req = transport.request(socket ? { ...opts, socket, agent: false } : { ...opts, agent: false }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          try {
            resolve({ status: res.statusCode, json: JSON.parse(text) })
          } catch {
            reject(new Error(`响应不是合法 JSON（HTTP ${res.statusCode}）：${text.slice(0, 200)}`))
          }
        })
      })
      req.on('error', reject)
      req.setTimeout(timeout, () => req.destroy(new Error(`请求超时（${timeout}ms）`)))
      req.end(payload)
    }
    if (proxyUrl && !isHttp) {
      connectTunnel(proxyUrl, u.hostname, port, timeout)
        .then((socket) => finish(new TLSSocket(socket, { servername: u.hostname })))
        .catch(reject)
    } else {
      finish()
    }
  })
}

export class InsufficientCreditsError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InsufficientCreditsError'
  }
}

export class DateWindowError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DateWindowError'
  }
}

// 业务错误码翻译
export function friendlyApiError(json) {
  const code = json?.code
  const msg = String(json?.msg || json?.message || '')
  if (code === 3201 || msg.includes('积分不足')) {
    return new InsufficientCreditsError('RedFox 账户积分不足（3201）：请到 https://redfox.hk/dashboard/recharge 充值，或确认 Key 已绑定可用积分。')
  }
  if (code === 3203 || msg.includes('付费调用')) {
    return new Error('RedFox 该接口已转为付费调用（3203）：请到 https://redfox.hk/dashboard/recharge 充值后重试。')
  }
  if (code === 3108) return new Error('RedFox 提交被限频（3108），稍等片刻再试。')
  if (code === 401 || code === 403) return new Error(`RedFox 鉴权失败（${code}）：请检查面板「设置」页的 API Key。`)
  // 上游实测：超窗/断档日期会误报「日期格式错误」——格式本身正确，按日期窗口问题处理
  if (msg.includes('日期')) return new DateWindowError(`指定日期暂无数据或超出可回溯窗口（接口返回：${msg}）`)
  return new Error(`API 错误（code=${code ?? '?'}）：${msg || JSON.stringify(json).slice(0, 200)}`)
}

// 带重试 POST：3108 退避 5s/10s/15s；3201 直接抛 InsufficientCreditsError；日期窗口错误不重试（交给上层回退日期）
export async function postRank(url, payload, { apiKey, apiBase, proxyUrl = '', timeout = 45000, maxRetries = 3 } = {}) {
  if (!apiKey) {
    throw new Error('未配置 RedFox API Key。请到面板「设置」页填入，或在插件配置/环境变量 REDFOX_API_KEY 里配置（获取：https://redfox.hk/settings/api-keys?source=github）。')
  }
  const fullUrl = `${apiBase}${url}`
  const headers = {
    'X-API-KEY': apiKey,
    'REDFOX_API_KEY': apiKey,
    'User-Agent': 'xhs-darkhorse/0.1',
  }
  let lastErr = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { json } = await httpPostJson(fullUrl, payload, { timeout, proxyUrl, headers })
      const code = json?.code
      if (code === 3108) {
        lastErr = friendlyApiError(json)
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)))
        continue
      }
      if (code === 3201) throw friendlyApiError(json)
      if (code !== 200 && code !== 2000) throw friendlyApiError(json)
      return json
    } catch (err) {
      if (err instanceof InsufficientCreditsError || err instanceof DateWindowError) throw err
      lastErr = err
      if (attempt < maxRetries - 1) await new Promise((r) => setTimeout(r, 2000 ** attempt))
    }
  }
  throw lastErr || new Error(`请求失败（已尝试 ${maxRetries} 次）`)
}
