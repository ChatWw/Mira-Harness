// Use the package's full symbol catalog; new brands arrive through dependency updates.
const assets = import.meta.glob<string>([
  '/node_modules/@lobehub/icons-static-svg/icons/*.svg',
  '!/node_modules/@lobehub/icons-static-svg/icons/*-text*.svg',
  '!/node_modules/@lobehub/icons-static-svg/icons/*-brand*.svg',
], { eager: true, query: '?url&no-inline', import: 'default' })

const icons = new Map(Object.entries(assets).map(([path, url]) => [path.split('/').pop()!.replace(/\.svg$/, ''), url]))
const normalize = (name: string) => name.toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
const aliases: Record<string, string> = {
  glm: 'zhipu', 智谱: 'zhipu', 智谱开放平台: 'zhipu', zai: 'zai',
  深度求索: 'deepseek', 月之暗面: 'moonshot', 阿里千问: 'qwen', 通义千问: 'qwen', 千问: 'qwen',
  anthropic: 'claude', chatgpt: 'openai', gpt: 'openai', 'o1': 'openai', 'o3': 'openai', 'o4': 'openai',
  google: 'gemini', llama: 'meta', mistral: 'mistral', 硅基流动: 'siliconcloud', siliconflow: 'siliconcloud',
  字节跳动: 'doubao', 豆包: 'doubao', 腾讯混元: 'hunyuan', 混元: 'hunyuan', 百川智能: 'baichuan',
  百度云: 'baiducloud', 文心: 'wenxin', 阿里云百炼: 'alibabacloud', dashscope: 'alibabacloud',
  bailian: 'alibabacloud', 百川: 'baichuan', 火山引擎豆包: 'volcengine',
  modelscope魔搭: 'modelscope', tokenhub: 'tencentcloud', 腾讯云tokenhub: 'tencentcloud',
  qianfan: 'baiducloud', 百度云千帆: 'baiducloud',
}
const symbols = [...new Set([...icons.keys()].map(name => name.replace(/-color$/, '')))].sort((a, b) => b.length - a.length)
const candidates = [...Object.keys(aliases), ...symbols].sort((a, b) => b.length - a.length)

export const AI_BRAND_OPTIONS = [...symbols].sort((a, b) => a.localeCompare(b))

export function providerLetterAvatar(name: string) {
  const letter = [...name.trim()][0]?.toLocaleUpperCase() || '服'
  const colors = ['#446b9e', '#487d76', '#83609b', '#a05c50', '#887136', '#486d86']
  return { letter, background: colors[letter.codePointAt(0)! % colors.length] }
}

function findBrand(value: string) {
  const normalized = normalize(value)
  const exact = aliases[normalized] || normalized
  if (icons.has(exact) || icons.has(`${exact}-color`)) return exact
  // Model IDs may include a provider namespace and a version, e.g. anthropic/claude-sonnet-4.
  for (const part of value.toLocaleLowerCase().split(/[/:]/).reverse()) {
    const key = normalize(part)
    const matched = candidates.find(name => part === name || part.startsWith(`${name}-`) || part.startsWith(`${name}_`) || (part.startsWith(name) && /^\d/.test(part.slice(name.length))) || key === name)
    if (matched) {
      const brand = aliases[matched] || matched
      if (icons.has(brand) || icons.has(`${brand}-color`)) return brand
    }
  }
}

export function aiBrandIcon(brand: string) {
  if (!icons.has(brand) && !icons.has(`${brand}-color`)) return undefined
  // Kimi's colored SVG has a black body; use its monochrome symbol in both themes.
  const color = brand === 'kimi' ? undefined : icons.get(`${brand}-color`)
  return { brand, url: color || icons.get(brand)!, monochrome: !color }
}

export function resolveAiBrandIcon({ model = '', provider = '', name = '' }: { model?: string; provider?: string; name?: string }) {
  const brand = findBrand(model) || findBrand(name) || findBrand(provider)
  return brand ? aiBrandIcon(brand) : undefined
}
