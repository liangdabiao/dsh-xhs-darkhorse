// 小红书黑马爆文榜 · 数据层。
//   $DSH_HOME/xhs-darkhorse/
//   ├── settings.json        api_key / api_base(测试用) / proxy_url
//   ├── ranks/index.json     榜单索引（新→旧）
//   └── ranks/<id>/
//       ├── meta.json        分类/窗口日期/条数/统计
//       ├── raw.json         articles 全量（排序后）
//       └── report.html      小红书风格 HTML 导出（可选）
// 原子写（tmp + rename）与 geo-analyzer/cn30 同款。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, normalize } from 'node:path'

export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'xhs-darkhorse')
const RANKS_DIR = join(DATA_DIR, 'ranks')
const INDEX_FILE = join(RANKS_DIR, 'index.json')
const SETTINGS_FILE = join(DATA_DIR, 'settings.json')

const nowIso = () => new Date().toISOString()

function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value, mkdirAt = RANKS_DIR) {
  mkdirSync(mkdirAt, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  renameSync(tmp, file)
}

function writeFile(file, content) {
  mkdirSync(RANKS_DIR, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, String(content ?? ''), 'utf8')
  renameSync(tmp, file)
  return file
}

// ── 设置 ───────────────────────────────────────────────────────────────
export function getSettings() {
  return readJson(SETTINGS_FILE, {}) || {}
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch, updated_at: nowIso() }
  writeJson(SETTINGS_FILE, next, DATA_DIR)
  return next
}

// ── 榜单记录 ───────────────────────────────────────────────────────────
function rankDir(id) {
  const safe = String(id).replace(/[^\p{L}\p{N}_-]+/gu, '')
  if (!safe || safe !== String(id)) throw new Error('非法榜单 id')
  const dir = join(RANKS_DIR, safe)
  if (normalize(dir) !== normalize(join(RANKS_DIR, safe))) throw new Error('非法榜单 id')
  return dir
}

export function createRankId(category) {
  const ts = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const slug = String(category).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'rank'
  return `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}${String(ts.getMilliseconds()).padStart(3, '0')}-${slug}`
}

// meta 对外视图（剥掉条目数组）
export function publicMeta(meta) {
  return {
    rank_id: meta.rank_id,
    category: meta.category,
    rank_date: meta.rank_date,
    requested_date: meta.requested_date || '',
    fell_back: Boolean(meta.fell_back),
    fallback_reason: meta.fallback_reason || '',
    top_n: meta.top_n || 50,
    total: meta.total || 0,
    fetched_at: meta.fetched_at,
    highlights: meta.highlights || [],
    has_report: existsSync(join(RANKS_DIR, meta.rank_id, 'report.html')),
  }
}

export function saveRank(data) {
  const id = createRankId(data.category)
  const dir = rankDir(id)
  mkdirSync(dir, { recursive: true })
  writeJson(join(dir, 'raw.json'), { ...data, rank_id: id })
  const meta = {
    rank_id: id,
    category: data.category,
    rank_date: data.rank_date,
    requested_date: data.requested_date || data.rank_date,
    fell_back: Boolean(data.fell_back),
    fallback_reason: data.fallback_reason || '',
    top_n: data.top_n ?? 50,
    total: data.articles?.length || 0,
    fetched_at: data.fetched_at,
    highlights: data.analysis?.highlights || [],
  }
  writeJson(join(dir, 'meta.json'), meta)
  const index = getRankIndex().filter((i) => i.rank_id !== id)
  index.unshift({ rank_id: id, fetched_at: meta.fetched_at })
  writeJson(INDEX_FILE, index.slice(0, 200))
  return meta
}

export function getMeta(rankId) {
  return readJson(join(rankDir(rankId), 'meta.json'))
}

export function getRaw(rankId) {
  return readJson(join(rankDir(rankId), 'raw.json'))
}

function getRankIndex() {
  return readJson(INDEX_FILE, []) || []
}

export function listRanks({ limit = 50 } = {}) {
  const index = getRankIndex()
  const out = []
  for (const item of index.slice(0, limit)) {
    const meta = getMeta(item.rank_id)
    if (meta) out.push(publicMeta(meta))
  }
  return out
}

// 缺省解析为最新一次抓取
export function resolveRank(rankId) {
  if (rankId) {
    const meta = getMeta(rankId)
    if (!meta) throw new Error(`榜单记录不存在：${rankId}。用 history 查看已有记录。`)
    return meta
  }
  const [latest] = listRanks({ limit: 1 })
  if (!latest) throw new Error('还没有榜单记录。先 fetch。')
  return getMeta(latest.rank_id)
}

export function saveReportHtml(rankId, html) {
  return writeFile(join(rankDir(rankId), 'report.html'), html)
}

export function readReportHtml(rankId) {
  const file = join(rankDir(rankId), 'report.html')
  return existsSync(file) ? file : null
}

export function deleteRank(rankId) {
  const dir = rankDir(rankId)
  if (!existsSync(dir)) return { ok: false, error: `榜单记录不存在: ${rankId}` }
  rmSync(dir, { recursive: true, force: true })
  writeJson(INDEX_FILE, getRankIndex().filter((i) => i.rank_id !== rankId))
  return { ok: true }
}
