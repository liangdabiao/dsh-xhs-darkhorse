# dsh-xhs-darkhorse · 小红书黑马爆文榜

> 发现小红书上正在悄悄起量的黑马爆文，看清哪些账号和内容最近突然跑出来了。

dsh 插件（完整形态：原生工具 + 数据持久化 + 侧栏看板）。基于红狐数据（redfox.hk）挖掘小红书各内容分类下互动表现突出的黑马笔记——**最新起量的单日榜单，不限粉丝量级**（不是七日爆款笔记周榜）。移植自 [redfox-community](https://github.com/redfox-data/redfox-community) 的 skills/xiaohongshu-darkhorse，Python 引擎全量重写为 Node。
<img width="1698" height="1398" alt="image" src="https://github.com/user-attachments/assets/a4fcaf40-260c-469a-abc9-3a2af5f4dcb7" />


## 功能

- **darkhorse_rank 工具**（agent 对话内使用）
  - `fetch`：抓取 TOP50 黑马榜（同步秒回），自动输出榜单表格 + 爆款规律分析（标题特征 / 内容主题 / 可参考亮点，参考笔记带链接）
  - `list`：补读 TOP21-50 条目
  - `history`：抓取历史
  - 25 个内容分类自然语言自动映射；支持模糊日期词（昨天 / 前天 / 一周前 / 半个月前 / 一个月前）
  - 日期断档自动回退 7 天前窗口（主流程最多 2 次 API 请求，积分消耗最小化）
- **侧栏看板**：直查榜单（分类下拉 + 日期预设）、榜单卡片（封面缩略图 / 互动数据 / 笔记与作者链接）、爆款规律分析视图、抓取历史、小红书风格 HTML 导出（页面内一键转 PDF）
- **面板内密钥配置**：「设置」页直接保存 RedFox API Key（掩码回显，只存本机），优先级：插件配置 > 面板设置 > 环境变量 `REDFOX_API_KEY`
- **xhs-darkhorse 技能**：数据口径、积分保护与输出规则；系统提示注入硬规则（不批量查询、无结果不换分类、原样呈现榜单）

## 数据口径

- 数据每天 **17:30** 起更新昨日榜单（17:30 前查昨日窗口会是空榜）
- `rankDate` 为统计窗口**开始日期**，可查近 30 天内任意一天；按单日出榜
- 每次抓榜消耗 RedFox 积分（含空结果）；查看历史与 HTML 导出从本地数据渲染，**0 次请求不扣积分**
- 25 个分类：综合全部（默认）、出行代步、医疗保健、休闲爱好、综合杂项、婚庆婚礼、居家装修、影视娱乐、星座情感、拍摄记录、学习教育、旅行度假、亲子育儿、日常生活、科学探索、数码科技、时尚穿搭、化妆美容、个人护理、美味佳肴、职业发展、宠物天地、新闻资讯、体育锻炼、潮流鞋包

## 安装

```bash
dsh plugin --profile web add file:D:/dsh-research/dsh-xhs-darkhorse
```

前置：dsh >= 0.2.1-rc.2；RedFox API Key（[红狐 hub 获取](https://redfox.hk/settings/api-keys?source=github)，`ak_` 开头）。

## 开发

```bash
npm install        # 安装依赖并构建 dist/client.js
npm test           # 单测（node --test）
npm run smoke      # 离线冒烟：假服务器 + 工具直调 + 面板 API 全路由
npm run dev        # 开发预览：DSH_HOME=<数据目录> node scripts/devserver.mjs 5185
npm run live       # 真实抓榜：node scripts/live.mjs <分类> ak_xxx
```

数据目录：`$DSH_HOME/xhs-darkhorse/`（settings.json + ranks/<id>/meta.json、raw.json、report.html）。

## License

MIT
