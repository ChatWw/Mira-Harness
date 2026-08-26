export type SemanticSchedule =
  | { type: 'hourly', interval: number }
  | { type: 'daily', kind: 'every' | 'workday' | 'weekend', time: string }
  | { type: 'weekly', weekdays: number[], time: string }
  | { type: 'monthly', day: number | 'last', time: string }

function splitTime(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) throw new Error('时间格式应为 HH:mm')
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) throw new Error('时间无效')
  return { hour, minute, value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` }
}

export function buildCronExpression(schedule: SemanticSchedule) {
  if (schedule.type === 'hourly') {
    if (!Number.isInteger(schedule.interval) || schedule.interval < 1 || schedule.interval > 24) throw new Error('每隔小时数应在 1-24 之间')
    return `0 */${schedule.interval} * * *`
  }
  const { hour, minute } = splitTime(schedule.time)
  if (schedule.type === 'daily') {
    const weekday = schedule.kind === 'workday' ? '1-5' : schedule.kind === 'weekend' ? '0,6' : '*'
    return `${minute} ${hour} * * ${weekday}`
  }
  if (schedule.type === 'weekly') {
    const weekdays = [...new Set(schedule.weekdays)].filter(day => Number.isInteger(day) && day >= 0 && day <= 7).sort((left, right) => left - right)
    if (!weekdays.length) throw new Error('请至少选择一个星期')
    return `${minute} ${hour} * * ${weekdays.map(day => day === 0 ? 7 : day).join(',')}`
  }
  if (!Number.isInteger(schedule.day) && schedule.day !== 'last') throw new Error('每月日期无效')
  if (typeof schedule.day === 'number' && (schedule.day < 1 || schedule.day > 31)) throw new Error('每月日期应在 1-31 之间')
  return `${minute} ${hour} ${schedule.day === 'last' ? 'L' : schedule.day} * *`
}

export function describeSemanticSchedule(schedule: SemanticSchedule) {
  if (schedule.type === 'hourly') return `每 ${schedule.interval} 小时`
  if (schedule.type === 'daily') return `${schedule.kind === 'workday' ? '每个工作日' : schedule.kind === 'weekend' ? '每个周末' : '每天'} ${splitTime(schedule.time).value}`
  if (schedule.type === 'weekly') {
    const names = ['日', '一', '二', '三', '四', '五', '六']
    return `每周 ${schedule.weekdays.map(day => `周${names[day]}`).join('、')} ${splitTime(schedule.time).value}`
  }
  return `每月${schedule.day === 'last' ? '最后一天' : `${schedule.day} 日`} ${splitTime(schedule.time).value}`
}

export function describeCronExpression(expression: string, fallback = '定时运行') {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return fallback
  const [minute, hour, day, month, weekday] = parts
  if (month !== '*') return fallback
  const time = /^\d+$/.test(minute) && /^\d+$/.test(hour) ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}` : ''
  if (day === '*' && weekday === '*') return time ? `每天 ${time}` : fallback
  if (day === '*' && weekday === '1-5') return time ? `每个工作日 ${time}` : fallback
  if (day === '*' && (weekday === '0,6' || weekday === '6,0')) return time ? `每个周末 ${time}` : fallback
  if (day === '*' && weekday !== '*') return time ? `每周 ${weekday.split(',').map(value => `周${value === '7' ? '日' : ['日', '一', '二', '三', '四', '五', '六'][Number(value)] || value}`).join('、')} ${time}` : fallback
  if (weekday === '*' && (day === 'L' || /^\d+$/.test(day))) return time ? `每月${day === 'L' ? '最后一天' : `${day} 日`} ${time}` : fallback
  return fallback
}
