import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn 惯用的类名合并工具（与 ZCode packages/ui 相同的模式）。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
