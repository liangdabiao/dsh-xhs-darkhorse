// 小红书黑马爆文榜 · 面板逻辑：概览（抓榜表单+历史）/ 详情页（榜单卡片 + 规律分析两个视图）/ 设置。
// 「去对话深挖」走 agent：嵌入 dsh → postMessage（client.js startSession，有 start-ok 握手）；
// 独立浏览器预览 → 复制草稿。面板直连 API 抓榜/看榜/导出小红书风格 HTML。
(() => {
  const $app = document.getElementById('app')
  const $toast = document.getElementById('toast')
  const EMBEDDED = (() => { try { return window.parent !== window } catch { return false } })()

  const state = { catalog: null, view: 'rank' }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  async function api(path) {
    const res = await fetch(`/xhs-darkhorse${path}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(body.error || `HTTP ${res.status}`)
      err.status = res.status
      throw err
    }
    return body
  }
  async function apiPost(path, payload) {
    const res = await fetch(`/xhs-darkhorse${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
    return body
  }
  async function apiDelete(path) {
    const res = await fetch(`/xhs-darkhorse${path}`, { method: 'DELETE' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
    return body
  }

  let toastTimer = null
  function toast(msg, isErr) {
    $toast.textContent = msg
    $toast.className = `toast show${isErr ? ' err' : ''}`
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { $toast.className = 'toast' }, 2600)
  }
  function copyFallback(prompt, reason) {
    navigator.clipboard?.writeText(prompt).then(
      () => toast(`${reason}，草稿已复制到剪贴板——请粘贴到 dsh 对话`, true),
      () => toast(`${reason}，复制也失败了`, true))
  }

  const ICONS = {
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0 .33-1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    go: '<path d="M9 6l6 6-6 6"/>',
    trash: '<path d="M5 7h14"/><path d="M9 7V5h6v2"/><path d="M7 7l1 13h8l1-13"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    ext: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 14v5H5V6h5"/>',
    back: '<path d="M14 6l-6 6 6 6"/>',
    play: '<path d="M8 5l11 7-11 7V5z"/>',
    download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  }
  const ic = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`

  async function loadCatalog() {
    state.catalog = await api('/api/catalog')
    renderNavCounts()
    renderRailFoot()
    return state.catalog
  }
  function renderNavCounts() {
    const c = state.catalog
    if (!c) return
    document.querySelectorAll('[data-count]').forEach((n) => {
      if (n.dataset.count === 'ranks') n.textContent = (c.ranks || []).length
    })
  }
  function renderRailFoot() {
    const c = state.catalog
    if (!c) return
    const latest = (c.ranks || [])[0]
    document.getElementById('rail-foot').innerHTML =
      `<div class="v-head">DARKHORSE RADAR v${esc(c.version)}</div>` +
      `<div class="v-row"><span>API Key</span><span>${c.has_key ? '已配置' : '未配置'}</span></div>` +
      `<div class="v-row"><span>榜单数</span><span>${(c.ranks || []).length}</span></div>` +
      `<div class="v-row"><span>最近抓取</span><span>${esc(latest ? `${latest.category} ${latest.rank_date}` : '—')}</span></div>`
  }

  // ---------- 送 prompt 到 agent 对话 ----------
  function sendAgentPrompt(prompt, okMsg = '已在宿主开新对话——agent 处理中') {
    if (!EMBEDDED) {
      navigator.clipboard?.writeText(prompt).then(
        () => toast('草稿已复制——粘贴到 dsh 对话即可开始'),
        () => copyFallback(prompt, '复制失败'))
      return
    }
    let done = false
    const cleanup = () => { done = true; clearTimeout(timer); removeEventListener('message', onMsg) }
    const onMsg = (e) => {
      if (e.origin !== location.origin) return
      if (e.data?.type === 'xhs-darkhorse:start-ok') { if (!done) { cleanup(); toast(okMsg) } }
      else if (e.data?.type === 'xhs-darkhorse:start-failed') { if (!done) { cleanup(); toast(`没能开新对话：${e.data.message || ''}`, true) } }
    }
    const timer = setTimeout(() => { if (!done) { cleanup(); copyFallback(prompt, '未收到宿主确认') } }, 1500)
    addEventListener('message', onMsg)
    parent.postMessage({ type: 'xhs-darkhorse:refresh', prompt }, location.origin)
  }

  function insightPrompt(rank) {
    return [
      `请解读小红书${rank.category === '综合全部' ? '' : rank.category}黑马爆文榜（统计窗口开始日期 ${rank.rank_date}，rankId=${rank.rank_id}）：`,
      `1. darkhorse_rank(action="list", rankId="${rank.rank_id}") 补读 TOP21-50 条目`,
      '2. 结合榜单数据与爆款规律分析回答我的问题，解读基于真实数据，引用一律内联 Markdown 链接（笔记 explore 链接）',
      '3. 末尾逐字附上工具返回的页脚。',
    ].join('\n')
  }

  // ---------- 视图：概览 ----------
  function viewHome() {
    const c = state.catalog
    const ranks = c.ranks || []
    const catOptions = (c.categories || []).map((k) =>
      `<option value="${esc(k)}"${k === '综合全部' ? ' selected' : ''}>${esc(k)}</option>`).join('')
    return `
      <header class="head">
        <span class="eyebrow">XHS DARKHORSE RADAR</span>
        <div class="head-row">
          <h1>黑马<strong>爆文榜</strong></h1>
        </div>
        <p>小红书各分类下互动表现突出的黑马笔记：最新起量的单日榜（不限粉丝量级），TOP50 + 爆款规律分析 + 小红书风格 HTML 导出。数据每天 17:30 起更新昨日榜单。RedFox API Key ${c.has_key ? '已配置' : '未配置——去「设置」页填写'}。</p>
      </header>
      ${!c.has_key ? `<div class="empty" style="margin-bottom:var(--sp-6);padding:var(--sp-4) var(--sp-5);text-align:left"><div class="e-title">🔑 还没有配置 RedFox API Key</div><p>到<a href="#/settings">「设置」</a>页填写（ak_ 开头，<a href="https://redfox.hk/settings/api-keys?source=github" target="_blank" rel="noreferrer">红狐 hub 获取 ↗</a>）。每次抓榜会消耗积分。</p></div>` : ''}
      <section class="sec" style="margin-top:0">
        <div class="sec-head"><span class="num">01</span><h2>抓一把最新榜单</h2></div>
        <div class="form" style="max-width:760px">
          <div class="form-row">
            <div class="field"><label>CATEGORY · 内容分类（25 选 1）</label>
              <select id="f-cat">${catOptions}</select></div>
            <div class="field"><label>TOP N · 榜单条数</label>
              <select id="f-topn"><option value="20">20</option><option value="50" selected>50</option></select></div>
          </div>
          <div class="field"><label>RANK DATE · 统计窗口开始日期（留空 = 最近已更新的数据日）</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <select id="f-date-preset" style="flex:1;min-width:180px">
                <option value="">最近数据日（默认）</option>
                <option value="昨天">昨天</option>
                <option value="前天">前天</option>
                <option value="一周前">一周前</option>
                <option value="半个月前">半个月前</option>
                <option value="_custom">指定日期…</option>
              </select>
              <input id="f-date" type="date" style="flex:1;min-width:160px" disabled>
            </div>
            <div class="hint">数据每天 17:30 起更新昨日榜，17:30 前查昨日会是空榜；指定日期无数据/断档时自动回退 7 天前窗口（最多 2 次请求，积分消耗最小化）。</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn accent" id="f-fetch">${ic('play')}抓取榜单</button>
          </div>
          <div class="hint" id="f-status"></div>
        </div>
      </section>
      <section class="sec">
        <div class="sec-head"><span class="num">02</span><h2>抓取历史</h2></div>
        ${ranks.length ? `<div class="cards">${ranks.map((r) => `
          <a class="card" href="#/r/${encodeURIComponent(r.rank_id)}">
            <div class="c-top">
              <div class="c-title">${esc(r.category === '综合全部' ? '综合黑马榜' : esc(r.category) + '黑马榜')}</div>
              ${r.has_report ? '<span class="chip done">有导出</span>' : '<span class="chip">可导出</span>'}
            </div>
            <div class="c-sub">窗口 ${esc(r.rank_date)} · ${r.total} 条${r.fell_back ? ' · <span style="color:var(--warn)">已回退 7 天前窗口</span>' : ''}</div>
            ${(r.highlights || []).length ? `<div class="c-sub" style="color:var(--text-secondary)">${esc(r.highlights[0].replace(/\*\*/g, ''))}</div>` : ''}
            <div class="c-foot"><span>${esc(String(r.fetched_at).slice(0, 16).replace('T', ' '))}</span></div>
          </a>`).join('')}</div>`
        : `<div class="empty"><div class="e-title">还没有抓取记录</div><p>选个分类点「抓取榜单」。每次抓取消耗 RedFox 积分，历史记录查看与 HTML 导出不再扣积分。</p></div>`}
      </section>`
  }

  // ---------- 视图：榜单详情 ----------
  function renderItems(container, items) {
    if (!items.length) {
      container.innerHTML = '<div class="empty-inline">榜单为空——试试更近的日期窗口。</div>'
      return
    }
    container.innerHTML = items.map((it, i) => {
      const rank = i + 1
      const medal = rank <= 3 ? 'medal' : ''
      const rankShow = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank
      const cover = it.thumbnail_url || it.cover_url
      return `
      <div class="plate" style="--pc:var(--accent)">
        <div class="rank ${medal}">${rankShow}</div>
        ${cover ? `<img class="p-cover" src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}
        <div class="p-main">
          <div class="p-title">${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noreferrer">${esc(it.title)}</a>` : esc(it.title)}</div>
          <div class="p-meta">${it.author_url ? `<a href="${esc(it.author_url)}" target="_blank" rel="noreferrer">@${esc(it.author)}</a>` : `@${esc(it.author)}`} · ${esc(it.author_fans)}粉 · ${esc(it.published_at ? String(it.published_at).slice(0, 16) : '--')}</div>
          ${it.desc ? `<div class="p-desc">${esc(it.desc)}</div>` : ''}
          <div class="p-eng">${[
            `互动 ${it.interactive_count}`,
            `👍 ${it.like_count}`,
            `💬 ${it.comment_count}`,
            `⭐ ${it.collect_count}`,
            `📤 ${it.share_count}`,
          ].map((s) => `<span>${esc(s)}</span>`).join('')}</div>
        </div>
        ${it.url ? `<a class="p-go" href="${esc(it.url)}" target="_blank" rel="noreferrer" title="查看原文">${ic('ext')}</a>` : ''}
      </div>`
    }).join('')
  }

  function renderAnalysis(container, analysis) {
    const tables = []
    if ((analysis.title_types || []).length) {
      tables.push(`
        <h3 style="margin:0 0 var(--sp-3);font-size:13px">1. 标题特征</h3>
        <table class="ana-table">
          <tr><th>标题类型</th><th>特征</th><th>占比</th><th>标题模版</th><th>参考笔记</th></tr>
          ${analysis.title_types.map((t) => `
            <tr>
              <td class="k">${esc(t.type)}</td>
              <td>${esc(t.feature)}</td>
              <td class="num">${esc(t.pct)}</td>
              <td>${esc(t.template)}</td>
              <td>${(t.examples || []).map((e) => e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noreferrer">${esc(e.title.slice(0, 12))}</a>` : esc(e.title.slice(0, 12))).join('、')}</td>
            </tr>`).join('')}
        </table>`)
    }
    if ((analysis.themes || []).length) {
      tables.push(`
        <h3 style="margin:0 0 var(--sp-3);font-size:13px">2. 内容主题</h3>
        <table class="ana-table">
          <tr><th>内容分类</th><th>特征</th><th>占比</th><th>实际效果</th><th>参考笔记</th></tr>
          ${analysis.themes.map((t) => `
            <tr>
              <td class="k">${esc(t.theme)}</td>
              <td>${esc(t.feature)}</td>
              <td class="num">${esc(t.pct)}</td>
              <td>${esc(t.effect)}</td>
              <td>${(t.examples || []).map((e) => e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noreferrer">${esc(e.title.slice(0, 12))}</a>` : esc(e.title.slice(0, 12))).join('、')}</td>
            </tr>`).join('')}
        </table>`)
    }
    const highlights = (analysis.highlights || []).length
      ? `<h3 style="margin:var(--sp-2) 0 var(--sp-3);font-size:13px">3. 可参考亮点</h3><div class="ana-note">${analysis.highlights.map((h) => `<div>${h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>`).join('')}</div>`
      : ''
    container.innerHTML = tables.join('') + highlights
  }

  async function viewRank(id) {
    let data
    try {
      data = await api(`/api/ranks/${encodeURIComponent(id)}`)
    } catch (e) {
      const netDown = !e.status
      return `<a class="back" href="#/">${ic('back')} 概览</a><div class="empty"><div class="e-title">${netDown ? '面板服务连接失败' : '榜单记录不存在'}</div><p>${netDown ? '开发预览：DSH_HOME=<数据目录> node scripts/devserver.mjs' : esc(e.message)}</p></div>`
    }
    const meta = data.rank
    const raw = data.raw
    const items = raw?.articles || []
    const cur = state.view || 'rank'

    const top1 = items[0]
    const collect = items.reduce((n, it) => n + (Number(String(it.collect_count).replace(/[^\d.]/g, '')) * (/w/i.test(it.collect_count) ? 10000 : 1) || 0), 0)
    const share = items.reduce((n, it) => n + (Number(String(it.share_count).replace(/[^\d.]/g, '')) * (/w/i.test(it.share_count) ? 10000 : 1) || 0), 0)
    const ratio = share > 0 ? (collect / share).toFixed(1) : '--'

    const stats = `
      <div class="pstats">
        <div class="pstat" style="--pc:var(--accent)"><div class="p-name">上榜笔记</div><div class="p-num">${meta.total}<span class="unit" style="font-size:12px;color:var(--text-helper)"> 条</span></div><div class="p-sub">TOP ${meta.top_n}</div></div>
        <div class="pstat" style="--pc:var(--accent)"><div class="p-name">TOP1 互动总量</div><div class="p-num">${esc(top1 ? top1.interactive_count : '--')}</div><div class="p-sub">${esc(top1 ? `《${(top1.title || '').slice(0, 14)}》` : '--')}</div></div>
        <div class="pstat" style="--pc:var(--accent)"><div class="p-name">收藏 / 分享</div><div class="p-num">${esc(ratio)}</div><div class="p-sub">&gt;1.5 收藏驱动 · &lt;0.7 分享驱动</div></div>
        <div class="pstat" style="--pc:var(--accent)"><div class="p-name">统计窗口</div><div class="p-num" style="font-size:15px;padding-top:6px">${esc(meta.rank_date)}</div><div class="p-sub">${meta.fell_back ? '自动回退（原指定日期无数据）' : '单日黑马榜'}</div></div>
      </div>`

    const tabs = `
      <div class="ptabs" style="margin-bottom:0">
        <button class="ptab${cur === 'rank' ? ' on' : ''}" data-view-tab="rank" style="--pt:var(--accent)">🐎 榜单 <span class="n">${meta.total}</span></button>
        <button class="ptab${cur === 'analysis' ? ' on' : ''}" data-view-tab="analysis" style="--pt:var(--accent)">💡 爆款规律分析</button>
      </div>`

    return `
      <a class="back" href="#/">${ic('back')} 概览</a>
      <div class="detail-head">
        <div>
          <h1>${esc(meta.category === '综合全部' ? '小红书黑马爆文榜' : esc(meta.category) + '黑马爆文榜')}</h1>
          <div class="c-sub" style="margin-top:4px">统计窗口开始日期 ${esc(meta.rank_date)} · 抓取于 ${esc(String(meta.fetched_at).slice(0, 16).replace('T', ' '))}${meta.fell_back ? ` · <span style="color:var(--warn)">已自动回退：${esc(meta.fallback_reason || '原日期无数据')}</span>` : ''}</div>
        </div>
        <div class="actions">
          ${meta.has_report
            ? `<button class="btn accent" data-open-report="${esc(id)}">${ic('ext')}打开 HTML 导出</button>`
            : `<button class="btn accent" id="mk-report">${ic('download')}导出 HTML</button>`}
          <button class="btn ghost" data-insight="${esc(id)}">${ic('spark')}去对话深挖</button>
          <button class="btn ghost" data-del-rank="${esc(id)}" title="删除记录">${ic('trash')}</button>
        </div>
      </div>
      ${stats}
      ${tabs}
      <div id="view-rank" class="plates" style="display:${cur === 'rank' ? '' : 'none'}"><div class="loading">LOADING…</div></div>
      <div id="view-analysis" class="block" style="display:${cur === 'analysis' ? '' : 'none'}"><div class="block-body" id="ana-body"><div class="loading">LOADING…</div></div></div>`
  }

  function bindRank(id, data) {
    const raw = data.raw
    const items = raw?.articles || []
    renderItems(document.getElementById('view-rank'), items)
    renderAnalysis(document.getElementById('ana-body'), data.analysis || {})
    document.querySelectorAll('[data-view-tab]').forEach((b) => {
      b.onclick = () => {
        state.view = b.dataset.viewTab
        document.querySelectorAll('[data-view-tab]').forEach((x) => x.classList.toggle('on', x === b))
        document.getElementById('view-rank').style.display = state.view === 'rank' ? '' : 'none'
        document.getElementById('view-analysis').style.display = state.view === 'analysis' ? '' : 'none'
      }
    })
    const del = document.querySelector('[data-del-rank]')
    if (del) del.onclick = async () => {
      if (!confirm('删除这条榜单记录？（条目与 HTML 导出一并删除，不可恢复）')) return
      try {
        await apiDelete(`/api/ranks/${encodeURIComponent(id)}`)
        toast('已删除')
        location.hash = '#/'
      } catch (e) { toast(e.message, true) }
    }
    const insight = document.querySelector('[data-insight]')
    if (insight) insight.onclick = () => {
      sendAgentPrompt(insightPrompt(data.rank), '已在宿主开新对话——agent 结合榜单数据回答')
    }
    const mk = document.getElementById('mk-report')
    if (mk) mk.onclick = async () => {
      mk.disabled = true
      try {
        await apiPost(`/api/ranks/${encodeURIComponent(id)}/report`)
        toast('HTML 导出已生成')
        location.reload()
      } catch (e) { toast(e.message, true); mk.disabled = false }
    }
  }

  // ---------- 导出查看器（面板内嵌，不依赖新窗口） ----------
  async function openReportView(id) {
    document.getElementById('report-view')?.remove()
    const el = document.createElement('div')
    el.id = 'report-view'
    el.className = 'report-view'
    el.innerHTML = `
      <div class="rv-panel" role="dialog" aria-modal="true" aria-label="HTML 导出">
        <div class="rv-bar">
          <div class="rv-title">${ic('ext')}<span>小红书风格导出（页面里可一键转 PDF）</span></div>
          <div class="rv-actions">
            <button class="btn ghost" id="rv-close">关闭</button>
          </div>
        </div>
        <div class="rv-body"><div class="loading">LOADING…</div></div>
      </div>`
    document.body.appendChild(el)
    const body = el.querySelector('.rv-body')
    const close = () => {
      removeEventListener('keydown', onKey)
      el.remove()
    }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    addEventListener('keydown', onKey)
    el.querySelector('#rv-close').onclick = close
    el.addEventListener('click', (e) => { if (e.target === el) close() })
    try {
      const res = await fetch(`/xhs-darkhorse/api/ranks/${encodeURIComponent(id)}/report`, { cache: 'no-store' })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(detail.error || `HTTP ${res.status}`)
      }
      const html = await res.text()
      const frame = document.createElement('iframe')
      frame.className = 'rv-frame'
      frame.title = 'HTML 导出'
      frame.srcdoc = html // 导出页自带的样式/导 PDF 脚本原样执行
      body.innerHTML = ''
      body.appendChild(frame)
    } catch (e) {
      body.innerHTML = `<div class="empty"><div class="e-title">导出打不开</div><p>${esc(e.message)}</p><p>若是「还没生成」，先点「导出 HTML」（从本地数据渲染，0 次请求）。</p></div>`
    }
  }

  // ---------- 视图：设置 ----------
  function viewSettings() {
    return `
      <a class="back" href="#/">${ic('back')} 概览</a>
      <header class="head">
        <span class="eyebrow">SETTINGS</span>
        <h1>设<strong>置</strong></h1>
        <p>RedFox API Key 是抓榜的唯一凭证。这里保存的 Key 优先于环境变量，低于插件配置。每次抓榜消耗积分（含空结果），查看历史与 HTML 导出不消耗。</p>
      </header>
      <div class="form">
        <div class="field"><label>API KEY · RedFox API Key（ak_ 开头）</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="s-key" placeholder="ak_…" style="flex:1;min-width:220px;font-family:var(--font-mono);font-size:12px">
            <button class="btn" id="s-key-save">保存 Key</button>
          </div>
          <div class="hint" id="s-key-hint">…</div>
          <div class="hint">获取：<a href="https://redfox.hk/settings/api-keys?source=github" target="_blank" rel="noreferrer">redfox.hk/settings/api-keys ↗</a>。保存在本机 dsh 数据目录，不上传。</div>
        </div>
        <div class="field"><label>PROXY · HTTP(S) 代理（访问 redfox.hk 走代理时填；清空 = 直连）</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="s-proxy" placeholder="http://127.0.0.1:7890" style="flex:1;min-width:220px;font-family:var(--font-mono);font-size:12px">
            <button class="btn" id="s-proxy-save">保存代理</button>
          </div>
        </div>
        <div class="field"><label>API BASE · 接口地址（测试/自建网关用，默认 https://redfox.hk）</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="s-base" placeholder="https://redfox.hk" style="flex:1;min-width:220px;font-family:var(--font-mono);font-size:12px">
            <button class="btn" id="s-base-save">保存地址</button>
          </div>
        </div>
      </div>`
  }

  async function bindSettings() {
    async function refreshSettings() {
      try {
        const { settings } = await api('/api/settings')
        const keyHint = document.getElementById('s-key-hint')
        if (keyHint) keyHint.textContent = settings.has_key
          ? `已配置（…${settings.key_tail || '******'}${settings.from_env ? '，其中环境变量可用' : ''}）。重新输入会覆盖。`
          : '未配置。'
        const inp = document.getElementById('s-key')
        if (inp && document.activeElement !== inp) inp.placeholder = settings.has_key ? `已配置（…${settings.key_tail}），输入新值覆盖` : 'ak_…'
        const proxy = document.getElementById('s-proxy')
        if (proxy && document.activeElement !== proxy) proxy.value = settings.proxy_url || ''
        const base = document.getElementById('s-base')
        if (base && document.activeElement !== base) base.value = settings.api_base || ''
      } catch { /* 宿主未就绪 */ }
    }
    await refreshSettings()
    const bind = (id, payload, clearInput = false) => {
      const btn = document.getElementById(id)
      if (!btn) return
      btn.onclick = async () => {
        try {
          const input = btn.parentElement.querySelector('input')
          await apiPost('/api/settings', payload(input.value.trim()))
          toast('设置已保存')
          if (clearInput) input.value = ''
          await refreshSettings()
          loadCatalog().catch(() => {})
        } catch (e) { toast(e.message, true) }
      }
    }
    bind('s-key-save', (v) => ({ api_key: v }), true)
    bind('s-proxy-save', (v) => ({ proxy_url: v }))
    bind('s-base-save', (v) => ({ api_base: v }))
  }

  // ---------- 渲染辅助 ----------
  function bindCommon() {
    document.querySelectorAll('[data-open-report]').forEach((b) => {
      b.onclick = () => { openReportView(b.dataset.openReport) }
    })
    const fetchBtn = document.getElementById('f-fetch')
    if (fetchBtn) fetchBtn.onclick = async () => {
      const category = document.getElementById('f-cat')?.value || '综合全部'
      const preset = document.getElementById('f-date-preset')?.value || ''
      const custom = document.getElementById('f-date')?.value || ''
      const rankDate = preset === '_custom' ? custom : preset
      if (preset === '_custom' && !/^\d{4}-\d{2}-\d{2}$/.test(custom)) { toast('指定日期要先选一个具体日期', true); return }
      fetchBtn.disabled = true
      const status = document.getElementById('f-status')
      if (status) status.textContent = '抓取中（同步接口，约 1-3 秒，消耗 RedFox 积分）…'
      try {
        const r = await apiPost('/api/ranks', {
          category,
          rank_date: rankDate || undefined,
          top_n: Number(document.getElementById('f-topn')?.value) || 50,
        })
        toast(`抓取完成：${r.rank.total} 条（${r.rank.category} · 窗口 ${r.rank.rank_date}）`)
        state.view = 'rank'
        location.hash = `#/r/${encodeURIComponent(r.rank.rank_id)}`
      } catch (e) {
        toast(e.message, true)
        if (status) status.textContent = ''
      }
      fetchBtn.disabled = false
    }
    const presetSel = document.getElementById('f-date-preset')
    if (presetSel) presetSel.onchange = () => {
      const dateInput = document.getElementById('f-date')
      if (dateInput) {
        dateInput.disabled = presetSel.value !== '_custom'
        if (presetSel.value === '_custom' && !dateInput.value) {
          const d = new Date(Date.now() - 86400_000)
          dateInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }
      }
    }
  }

  // ---------- 路由 ----------
  async function render() {
    try { await loadCatalog() } catch {}
    const hash = location.hash || '#/'
    const mr = hash.match(/^#\/r\/(.+)$/)
    const rankId = mr ? decodeURIComponent(mr[1]) : null
    document.querySelectorAll('.nav a').forEach((a) => {
      const cur = rankId ? '' : hash === '#/' ? 'home' : hash.startsWith('#/settings') ? 'settings' : 'home'
      a.classList.toggle('on', a.dataset.view === cur)
    })
    if (rankId && /^[\p{L}\p{N}_-]+$/u.test(rankId)) {
      $app.innerHTML = await viewRank(rankId)
      bindCommon()
      try {
        const data = await api(`/api/ranks/${encodeURIComponent(rankId)}`)
        bindRank(rankId, data)
      } catch { /* 卡片已在 HTML 中提示错误 */ }
      return
    }
    if (hash.startsWith('#/settings')) { $app.innerHTML = viewSettings(); bindCommon(); bindSettings(); return }
    $app.innerHTML = viewHome()
    bindCommon()
  }

  async function boot() {
    try { await loadCatalog() } catch {
      state.catalog = { version: '-', has_key: false, key_source: 'none', categories: [], ranks: [], settings: {} }
      renderNavCounts()
    }
    render().catch(() => {})
  }
  addEventListener('hashchange', () => { state.view = 'rank'; render() })
  boot()
  setTimeout(() => { if (!state.catalog?.version || state.catalog.version === '-') boot() }, 2500)
})()
