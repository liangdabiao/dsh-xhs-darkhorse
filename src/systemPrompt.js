// 系统提示注入：小红书黑马爆文榜工作流硬规则（数据口径与输出规则在 xhs-darkhorse 技能里）。
export const SYSTEM_RULES = `## 小红书黑马爆文榜（xhs-darkhorse）

用户要「小红书黑马爆文榜 / 黑马笔记 / 小红书爆文榜 / 某分类的黑马内容」时：

**流程**：darkhorse_rank(action="fetch", category="分类", rankDate="yyyy-MM-dd 或模糊词")（同步秒回，TOP50）→ 用返回的榜单表格 + 爆款规律分析按输出规则呈现 → 需要更多条目用 action="list"；历史用 action="history"。

**硬规则**：
- 每次调用扣积分：只查用户明确要求的分类与日期，绝不主动批量查询多个分类。
- 分类用 25 个标准分类之一（工具会自动把自然语言映射过去）；用户输入无法匹配时按「综合全部」查。
- 查询无结果时如实说明并建议调整方向（换分类/更近窗口），不自动改查其他分类；数据断档时工具会自动回退 7 天前窗口并在回执里注明——如实转述即可。
- 榜单与规律分析原样呈现（表格不改成列表、不省略参考笔记链接）；所有数值来自数据服务，严禁估算编造。
- 引用一律内联 Markdown 链接（笔记 explore/{photoId}，作者 profile/{userId}）；不用破折号（用 " - "）；末尾逐字带上工具返回的页脚。`

export function systemSection() {
  return {
    name: 'xhs-darkhorse:workflow',
    order: 110,
    text: SYSTEM_RULES,
  }
}
