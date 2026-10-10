// File-chip interaction adapted from ZCode ToolCallBlocks/renderers/read.tsx (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd. Mira owns path authorization and preview callbacks.
// Local Material Icon Theme SVGs use MIT; see third-party-licenses/material-icon-theme.
import miraTypeScript from '../../assets/file-types/mira-typescript.svg'
import miraJavaScript from '../../assets/file-types/mira-javascript.svg'
import miraReactTypeScript from '../../assets/file-types/mira-react-typescript.svg'
import miraReactJavaScript from '../../assets/file-types/mira-react-javascript.svg'
import miraJson from '../../assets/file-types/mira-json.svg'
import miraMarkdown from '../../assets/file-types/mira-markdown.svg'
import miraVue from '../../assets/file-types/mira-vue.svg'
import miraPython from '../../assets/file-types/mira-python.svg'
import miraDocument from '../../assets/file-types/mira-document.svg'
import miraConfig from '../../assets/file-types/mira-config.svg'
import miraImage from '../../assets/file-types/mira-image.svg'
import miraHtml from '../../assets/file-types/mira-html.svg'
import miraCss from '../../assets/file-types/mira-css.svg'
import miraShell from '../../assets/file-types/mira-shell.svg'
import miraYaml from '../../assets/file-types/mira-yaml.svg'
import miraToml from '../../assets/file-types/mira-toml.svg'
import '../../styles/mira-tool-files.css'

const miraFileIcons = {
  typescript: miraTypeScript, javascript: miraJavaScript,
  reactTypescript: miraReactTypeScript, reactJavascript: miraReactJavaScript,
  json: miraJson, markdown: miraMarkdown, vue: miraVue, python: miraPython,
  document: miraDocument, config: miraConfig, image: miraImage,
  html: miraHtml, css: miraCss, shell: miraShell, yaml: miraYaml, toml: miraToml,
}

const miraFileKinds: Record<string, keyof typeof miraFileIcons> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  tsx: 'reactTypescript', jsx: 'reactJavascript',
  json: 'json', jsonc: 'json', jsonl: 'json',
  md: 'markdown', mdx: 'markdown', markdown: 'markdown',
  vue: 'vue', py: 'python', pyi: 'python', pyw: 'python',
  cfg: 'config', conf: 'config', config: 'config', ini: 'config',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  webp: 'image', avif: 'image', bmp: 'image', ico: 'image', svg: 'image',
  html: 'html', htm: 'html', css: 'css',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  yaml: 'yaml', yml: 'yaml', toml: 'toml',
}

function miraFileIcon(fileName: string) {
  const name = fileName.toLowerCase()
  if (name === '.env' || name.startsWith('.env.') || ['.gitignore', '.editorconfig', '.npmrc', '.babelrc', '.eslintrc'].includes(name)) return miraFileIcons.config
  return miraFileIcons[miraFileKinds[name.split('.').pop() ?? ''] ?? 'document']
}

export function MiraToolFileChip({ path, onOpen }: { path: string; onOpen?: () => void }) {
  const normalized = path.replace(/\\/g, '/')
  const separator = normalized.lastIndexOf('/')
  const fileName = normalized.slice(separator + 1) || normalized
  const directory = separator >= 0 ? normalized.slice(0, separator + 1) : ''
  const content = <><img src={miraFileIcon(fileName)} alt="" aria-hidden="true" width={16} height={16} draggable={false} /><span className="mira-tool-file-chip__basename">{fileName}</span></>
  return <span className="mira-tool-file-chip" title={path}>
    {onOpen ? <button type="button" className="mira-tool-file mira-tool-file-chip__name" title={path} aria-label={`打开文件 ${path}`} onMouseDown={event => { event.preventDefault(); event.stopPropagation() }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() }} onClick={event => { event.preventDefault(); event.stopPropagation(); onOpen() }}>{content}</button> : <span className="mira-tool-file mira-tool-file-chip__name" title={path}>{content}</span>}
    {directory && <span className="mira-tool-file-chip__directory" title={directory}>{directory}</span>}
  </span>
}
