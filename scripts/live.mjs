// 真实网络冒烟：抓一次黑马榜（TOP50），打印成功率与样例，导出小红书风格 HTML。
//   DSH_HOME=<目录> node scripts/live.mjs [分类] [ak_xxx]
// key 优先级：命令行第二参 > 数据目录 settings.json > 环境变量 REDFOX_API_KEY。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [, , catArg, keyArg] = process.argv
const category = catArg || '综合全部'
const home = process.env.DSH_HOME || join(process.env.HOME || process.env.USERPROFILE, '.dsh')

if (keyArg) {
  mkdirSync(join(home, 'xhs-darkhorse'), { recursive: true })
  writeFileSync(join(home, 'xhs-darkhorse', 'settings.json'), JSON.stringify({ api_key: keyArg }, null, 2))
  console.log('API key 已写入 settings.json')
}
const { getSettings } = await import('../lib/store.js')
if (!getSettings().api_key && !process.env.REDFOX_API_KEY && !process.env.X_API_KEY) {
  console.error('缺少 RedFox API Key：node scripts/live.mjs <分类> ak_xxx')
  process.exit(1)
}

const { darkhorseRankTool } = await import('../src/host.js')
const call = (args) => darkhorseRankTool.execute(args, {})

console.log(`真实抓榜：「${category}」 TOP50（消耗积分）`)
const t0 = Date.now()
const r = await call({ action: 'fetch', category })
console.log(`\n[${Math.round((Date.now() - t0) / 1000)}s] ${r.summary}`)
if (r.data) console.log(r.data.split('\n').slice(0, 12).join('\n') + '\n…')
console.log(`\n页脚: ${r.footer || '—'}`)
