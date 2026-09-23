type CronField = (value: number) => boolean

type CronSchedule = {
  matches(date: Date): boolean
}

function parseNumber(value: string, minimum: number, maximum: number, label: string) {
  if (!/^\d+$/.test(value)) throw new Error(`${label}包含无效值`)
  const number = Number(value)
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`${label}应在 ${minimum}-${maximum} 之间`)
  return number
}

function parseField(source: string, minimum: number, maximum: number, label: string, normalize = (value: number) => value): CronField {
  const values = new Set<number>()
  for (const part of source.split(',')) {
    const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part)
    if (!match) throw new Error(`${label}格式无效`)
    const step = match[2] ? parseNumber(match[2], 1, maximum - minimum + 1, label) : 1
    let start = minimum
    let end = maximum
    if (match[1] !== '*') {
      const range = match[1].split('-')
      start = parseNumber(range[0], minimum, maximum, label)
      end = range[1] ? parseNumber(range[1], minimum, maximum, label) : start
      if (start > end) throw new Error(`${label}范围无效`)
    }
    for (let value = start; value <= end; value += step) values.add(normalize(value))
  }
  return value => values.has(normalize(value))
}

export function parseCronSchedule(expression: string): CronSchedule {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) throw new Error('Cron 表达式必须包含分、时、日、月、星期五段')
  const minute = parseField(fields[0], 0, 59, '分钟')
  const hour = parseField(fields[1], 0, 23, '小时')
  const lastDay = fields[2] === 'L'
  const day = lastDay ? (() => true) : parseField(fields[2], 1, 31, '日期')
  const month = parseField(fields[3], 1, 12, '月份')
  const weekday = parseField(fields[4], 0, 7, '星期', value => value === 7 ? 0 : value)
  const dayRestricted = fields[2] !== '*'
  const weekdayRestricted = fields[4] !== '*'
  return {
    matches(date) {
      if (!minute(date.getMinutes()) || !hour(date.getHours()) || !month(date.getMonth() + 1)) return false
      const dateMatches = lastDay ? date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() : day(date.getDate())
      const weekdayMatches = weekday(date.getDay())
      return dayRestricted && weekdayRestricted ? dateMatches || weekdayMatches : dateMatches && weekdayMatches
    },
  }
}

export function nextCronOccurrences(expression: string, count: number, after = Date.now()) {
  const schedule = parseCronSchedule(expression)
  const dates: number[] = []
  const candidate = new Date(after)
  candidate.setSeconds(0, 0)
  candidate.setMinutes(candidate.getMinutes() + 1)
  const limit = 366 * 24 * 60 * 2
  for (let offset = 0; offset < limit && dates.length < count; offset += 1) {
    if (schedule.matches(candidate)) dates.push(candidate.getTime())
    candidate.setMinutes(candidate.getMinutes() + 1)
  }
  if (dates.length < count) throw new Error('Cron 在未来两年内没有有效执行时间')
  return dates
}

export function validateCronExpression(expression: string) {
  const dates = nextCronOccurrences(expression, 2)
  if (dates[1] - dates[0] < 5 * 60 * 1000) throw new Error('Cron 任务的最小间隔为 5 分钟')
  return dates
}
