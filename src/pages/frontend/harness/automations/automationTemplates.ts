import type { AutomationTrigger } from '@/config/harness'

export type AutomationTemplate = {
  id: string
  name: string
  description: string
  icon: string
  prompt: string
  trigger: AutomationTrigger
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  { id: 'daily-ai-news', name: '每日 AI 新闻推送', description: '筛选当天值得关注的 AI coding 与具身智能动态。', icon: 'Collection', prompt: '请整理 {{日期}} 当天 AI 领域的重要动态，优先关注 AI coding 与具身智能。筛选 3-5 条真正有价值的信息；每条依次写明：标题、来源与发布时间（可提供链接时附链接）、事件摘要、值得关注的原因。优先采用一手发布或可靠媒体，去除营销稿和重复报道；无法核实的信息不要写入。若当前无法获得当天可靠信息，请明确说明，不要编造新闻。', trigger: { type: 'cron', expression: '0 8 * * *', humanLabel: '每天 08:00' } },
  { id: 'daily-english-words', name: '每日 5 个英语单词', description: '每天学习 5 个生活和职场高频英语单词。', icon: 'Reading', prompt: '请推荐 5 个适合日常生活和职场使用的实用英语单词，优先选择高频、可立即使用且难度适中的词汇。每个单词按“单词 / 音标 / 简明中文释义 / 一句自然例句及中文翻译 / 一条记忆提示”输出。避免生僻词、同一词根的重复堆砌和过于基础的词；如能获得近期学习记录，优先避开已学词。', trigger: { type: 'cron', expression: '10 8 * * *', humanLabel: '每天 08:10' } },
  { id: 'daily-bedtime-story', name: '每日儿童睡前故事', description: '生成语言温和、适合睡前阅读的儿童故事。', icon: 'MagicStick', prompt: '请写一个适合儿童睡前阅读的原创故事，语言温和、易懂，避免惊悚、暴力和过度说教。正文约 600-900 个汉字，阅读时长约 3-5 分钟；需有标题、完整情节和温暖收束的结尾。结尾另用一句话写出简短寓意，但不要破坏故事本身的余韵。', trigger: { type: 'cron', expression: '0 20 * * *', humanLabel: '每天 20:00' } },
  { id: 'weekly-work-report', name: '每周工作周报', description: '汇总本周仓库 PR、Issue 与需要持续关注的事项。', icon: 'Document', prompt: '请梳理「{{项目}}」本周的仓库活动，重点查看 PR 与 Issue 的新增、关闭和讨论情况。按“本周概览、主要进展、关键变更、待关注事项”输出周报；列出重要 PR 或 Issue 的编号、标题、状态和一句话说明，并标明需要跟进的讨论或阻塞点。只基于可访问的仓库与 GitHub 数据总结；若无法读取远程数据，请说明缺少的数据，不要臆测。', trigger: { type: 'cron', expression: '0 9 * * 1', humanLabel: '每周 周一 09:00' } },
  { id: 'classic-film-recommendation', name: '经典电影推荐', description: '每周推荐一部口碑出众且不剧透的经典电影。', icon: 'VideoPlay', prompt: '请推荐一部公认的经典电影，优先选择口碑长期稳定、评分较高且具有代表性的作品。用不剧透的方式介绍：片名、年份与导演、剧情梗概、影片亮点、值得观看的原因，并给出适合的观看心情或人群。若提及评分或奖项，请只使用可确认的信息；不要泄露关键转折、结局或反转。全文控制在 300-450 个汉字。', trigger: { type: 'cron', expression: '0 20 * * 5', humanLabel: '每周 周五 20:00' } },
  { id: 'today-in-history', name: '历史上的今天', description: '从科技、电影或音乐中讲述一件有趣的历史事件。', icon: 'Calendar', prompt: '请围绕 {{日期}} 的“历史上的今天”，从科技、电影或音乐中选择一件有趣且可核实的事件讲述。先用一句标题点出事件，再以 200-300 个汉字交代它发生的背景、经过和后续影响，语气轻松易懂。只选择一个事件，避免罗列；日期或事实无法确认时请如实说明，不要编造。', trigger: { type: 'cron', expression: '0 9 * * *', humanLabel: '每天 09:00' } },
  { id: 'health-check-reminder', name: '体检预约提醒', description: '一次性提醒确认体检时间并做好检查前准备。', icon: 'AlarmClock', prompt: '请发送一条简洁、清晰的体检预约提醒：确认体检时间和地点，准备身份证件或预约凭证，按医院要求提前空腹，并核对其他检查注意事项。用待办清单形式输出；如没有具体医院要求，提醒以医院通知为准，不提供医疗诊断或替代专业建议。', trigger: { type: 'once', scheduledAt: 1807182000000 } },
  { id: 'daily-why', name: '每日一个为什么', description: '用轻松的方式解答一个有趣的冷知识或生活问题。', icon: 'QuestionFilled', prompt: '请从科学、生活、历史、自然、食物、文化、动物或人体中随机选择一个有趣的问题，先抛出问题，再揭晓答案。解答要准确、通俗、有趣，避免故作神秘或过度简化；正文控制在 200-300 个汉字。尽量避开近期相似主题；如可获得历史记录，优先选择尚未讨论过的领域或问题。', trigger: { type: 'cron', expression: '0 10 * * *', humanLabel: '每天 10:00' } },
]
