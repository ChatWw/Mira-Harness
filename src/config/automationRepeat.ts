/* Copyright 2026 Z.AI Co., Ltd. SPDX-License-Identifier: Apache-2.0
 * Ported from ZCode services/session/automationCron.ts. License: third-party-licenses/zcode/. */
export interface AutomationScheduleRule {
  unit: "minute" | "hourly" | "daily" | "weekly" | "monthly" | "yearly"
  interval: number
  hour: number
  minute: number
  anchorAt: number
  weekdays?: number[]
  monthDays?: number[]
  months?: number[]
  monthlyMode?: "date" | "weekday"
}

function atTime(date: Date, hour: number, minute: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}

function firstWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const first = new Date(year, month, 1);
  return new Date(year, month, 1 + ((weekday - first.getDay() + 7) % 7));
}

/** 自定义重复规则的下一次运行；所有计算都使用本地日历时间。 */
export function computeScheduleRuleNextRunAt(
  rule: AutomationScheduleRule,
  from = Date.now(),
): number | null {
  const interval = Math.max(1, Math.floor(rule.interval));
  const anchor = new Date(rule.anchorAt);

  if (rule.unit === "minute") {
    const step = interval * 60 * 1_000;
    // 分钟间隔从创建/修改时刻开始，不能像 `*/N` cron 一样提前命中下一个墙钟刻度。
    // 始终从固定 anchor 推导还能避免 scheduler 晚派发后逐轮累积漂移。
    const steps = Math.max(1, Math.floor((from - rule.anchorAt) / step) + 1);
    return rule.anchorAt + steps * step;
  }

  if (rule.unit === "hourly") {
    const base = new Date(anchor);
    base.setMinutes(rule.minute, 0, 0);
    const step = interval * 60 * 60 * 1_000;
    const steps = Math.max(0, Math.floor((from - base.getTime()) / step) + 1);
    return base.getTime() + steps * step;
  }

  if (rule.unit === "daily") {
    for (let index = 0; index < 36_600; index += 1) {
      const date = new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate() + index * interval,
      );
      const candidate = atTime(date, rule.hour, rule.minute).getTime();
      if (candidate > from) return candidate;
    }
    return null;
  }

  if (rule.unit === "weekly") {
    const anchorWeek = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    anchorWeek.setDate(anchorWeek.getDate() - ((anchorWeek.getDay() + 6) % 7));
    const weekdays = [...(rule.weekdays?.length ? rule.weekdays : [1])].sort((left, right) => ((left + 6) % 7) - ((right + 6) % 7));
    for (let week = 0; week < 5_220; week += interval) {
      for (const weekday of weekdays) {
        const dayOffset = (weekday + 6) % 7;
        const date = new Date(
          anchorWeek.getFullYear(),
          anchorWeek.getMonth(),
          anchorWeek.getDate() + week * 7 + dayOffset,
        );
        const candidate = atTime(date, rule.hour, rule.minute).getTime();
        if (candidate > from) return candidate;
      }
    }
    return null;
  }

  if (rule.unit === "monthly") {
    // 1200 同时是合法月度间隔与搜索边界；旧的严格小于只检查 offset=0，
    // 当前月候选已过后会错误返回 null。包含边界才能计算 100 年后的下一轮。
    for (let offset = 0; offset <= 1_200; offset += interval) {
      const month = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1);
      const candidates =
        rule.monthlyMode === "weekday"
          ? [firstWeekdayOfMonth(month.getFullYear(), month.getMonth(), rule.weekdays?.[0] ?? 1)]
          : [...(rule.monthDays?.length ? rule.monthDays : [1])]
              .sort((left, right) => left - right)
              .map((day) => new Date(month.getFullYear(), month.getMonth(), day))
              .filter((date) => date.getMonth() === month.getMonth());
      for (const date of candidates) {
        const candidate = atTime(date, rule.hour, rule.minute).getTime();
        if (candidate > from) return candidate;
      }
    }
    return null;
  }

  // yearly：月份优先取 rule.months（1-12 → 0-indexed），缺省回退锚点月份（兼容旧记录）；
  // 日期取 monthDays[0] 或锚点日。溢出守卫：如 2/30、非闰年 2/29 会滚到下个月，跳过该年避免误触发。
  const targetMonth =
    rule.months?.[0] != null ? (((rule.months[0] - 1) % 12) + 12) % 12 : anchor.getMonth();
  const targetDay = rule.monthDays?.[0] ?? anchor.getDate();
  for (let offset = 0; offset < 400; offset += interval) {
    const date = new Date(anchor.getFullYear() + offset, targetMonth, targetDay);
    if (date.getMonth() !== targetMonth) continue;
    const candidate = atTime(date, rule.hour, rule.minute).getTime();
    if (candidate > from) return candidate;
  }
  return null;
}


export function validateAutomationScheduleRule(value: unknown): AutomationScheduleRule {
  if (!value || typeof value !== 'object') throw new Error('重复规则无效')
  const rule = value as AutomationScheduleRule
  if (!['minute', 'hourly', 'daily', 'weekly', 'monthly', 'yearly'].includes(rule.unit) || !Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 200 || !Number.isInteger(rule.hour) || rule.hour < 0 || rule.hour > 23 || !Number.isInteger(rule.minute) || rule.minute < 0 || rule.minute > 59 || !Number.isFinite(rule.anchorAt) || !Number.isFinite(new Date(rule.anchorAt).getTime())) throw new Error('重复规则无效，重复间隔必须为 1 至 200 的整数')
  for (const [key, min, max] of [['weekdays', 0, 6], ['monthDays', 1, 31], ['months', 1, 12]] as const) {
    const values = rule[key]
    if (values !== undefined && (!Array.isArray(values) || !values.length || values.length > max + 1 || values.some(value => !Number.isInteger(value) || value < min || value > max))) throw new Error('重复日期无效')
  }
  if (rule.monthlyMode !== undefined && !['date', 'weekday'].includes(rule.monthlyMode)) throw new Error('每月重复方式无效')
  return { ...rule }
}
export function repeatNextRuns(rule: AutomationScheduleRule, count = 2, from = Date.now()): number[] {
  validateAutomationScheduleRule(rule)
  const times: number[] = []
  for (let index = 0; index < count; index++) {
    const next = computeScheduleRuleNextRunAt(rule, from)
    if (next === null) throw new Error('重复规则没有未来执行时间')
    times.push(next); from = next
  }
  return times
}

export function automationScheduleDefinition(rule: AutomationScheduleRule) {
  return JSON.stringify([rule.unit, rule.interval, rule.hour, rule.minute, [...(rule.weekdays || [])].sort(), [...(rule.monthDays || [])].sort(), [...(rule.months || [])].sort(), rule.monthlyMode || 'date'])
}
