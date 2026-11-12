// ============================================================================
// 小红书黑马爆文榜 · 浏览器半边
//   - 侧栏加「小红书黑马爆文榜」入口，主区域是插件页面（/xhs-darkhorse/，iframe）
//   - 页面发 xhs-darkhorse:refresh：postMessage 一段草稿，这里开新对话并填进输入框（不自动发送）
//   - 明暗跟随 dsh 主题
//
// 注意：这里**不要**自己写 window.__ModuleLoader__.load(...)——scripts/build.mjs 的
// banner 已包了一层注册，再包一次会 duplicate factory registration 让 web boot 失败。
// ============================================================================
const React = require('react')
const h = React.createElement

const PANEL = 'xhs-darkhorse'
const SRC = '/xhs-darkhorse/'

// 侧栏图标：马蹄形赛道 + 冲线黑马
function PanelIcon(props) {
  const s = (props && props.size) || 18
  return h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
    h('path', { d: 'M4 19c2.5-1 3.5-3 4-5.5C8.6 10.6 10 6 14.5 5.2c3.4-.6 5.5 1.6 5.5 4.3 0 3.5-3 4.5-5.5 4.5-3 0-4.5-1.5-4.5-1.5' }),
    h('path', { d: 'M9 13.5 7 19' }),
    h('path', { d: 'M3 21.5h18', strokeDasharray: '2 3' }))
}

function apply(ctx) {
  const frames = new Set()
  let scheme = null
  const post = (frame) => {
    try { if (scheme && frame.contentWindow) frame.contentWindow.postMessage({ type: 'xhs-darkhorse:scheme', scheme }, location.origin) } catch {}
  }
  ctx.inject(['theme'], (c) => {
    const push = (snap) => { scheme = snap.active.colorScheme; frames.forEach(post) }
    try { push(c.theme.getTheme()) } catch {}
    c.on('theme/change', push)
  })

  function DarkhorsePanel() {
    const ref = React.useRef(null)
    React.useEffect(() => {
      const self = ref.current
      if (self) frames.add(self)
      function onMessage(e) {
        const frame = ref.current
        if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return
        const m = e.data
        if (!m || m.type !== 'xhs-darkhorse:refresh' || typeof m.prompt !== 'string') return
        try {
          ctx.uiWorkspace.startSession(undefined, { prompt: m.prompt, whenDraftExists: 'replace' })
          try { frame.contentWindow.postMessage({ type: 'xhs-darkhorse:start-ok' }, location.origin) } catch {}
        } catch (err) {
          console.error('[xhs-darkhorse] 开新对话失败', err)
          try { frame.contentWindow.postMessage({ type: 'xhs-darkhorse:start-failed', message: String((err && err.message) || err) }, location.origin) } catch {}
        }
      }
      addEventListener('message', onMessage)
      return () => { removeEventListener('message', onMessage); frames.delete(self) }
    }, [])
    return h('iframe', {
      ref,
      src: SRC,
      title: '小红书黑马爆文榜',
      allow: 'fullscreen',
      onLoad: (e) => post(e.currentTarget),
      style: { width: '100%', height: '100%', border: 0, display: 'block' },
    })
  }

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 16, label: () => '小红书黑马爆文榜' }, PanelIcon))
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, DarkhorsePanel))
}

exports.isPlugin = true
exports.inject = ['slots', 'uiWorkspace']
exports.apply = apply
