// File-name matching adapted from ZCode lib/fileDisplayHelpers.ts (Apache-2.0).
// Copyright 2026 Z.AI Co., Ltd.; see third-party-licenses/zcode.
// Material Icon Theme SVGs use MIT; see third-party-licenses/material-icon-theme.
import iconAstro from '../assets/file-types/mira-astro.svg'
import iconAudio from '../assets/file-types/mira-audio.svg'
import iconBabel from '../assets/file-types/mira-babel.svg'
import iconC from '../assets/file-types/mira-c.svg'
import iconCertificate from '../assets/file-types/mira-certificate.svg'
import iconShell from '../assets/file-types/mira-shell.svg'
import iconCpp from '../assets/file-types/mira-cpp.svg'
import iconCsharp from '../assets/file-types/mira-csharp.svg'
import iconCss from '../assets/file-types/mira-css.svg'
import iconDart from '../assets/file-types/mira-dart.svg'
import iconDatabase from '../assets/file-types/mira-database.svg'
import iconDocker from '../assets/file-types/mira-docker.svg'
import iconDocument from '../assets/file-types/mira-document.svg'
import iconEditorconfig from '../assets/file-types/mira-editorconfig.svg'
import iconEslint from '../assets/file-types/mira-eslint.svg'
import iconFont from '../assets/file-types/mira-font.svg'
import iconGemfile from '../assets/file-types/mira-gemfile.svg'
import iconGit from '../assets/file-types/mira-git.svg'
import iconGo from '../assets/file-types/mira-go.svg'
import iconGraphql from '../assets/file-types/mira-graphql.svg'
import iconH from '../assets/file-types/mira-h.svg'
import iconHpp from '../assets/file-types/mira-hpp.svg'
import iconHtml from '../assets/file-types/mira-html.svg'
import iconImage from '../assets/file-types/mira-image.svg'
import iconJava from '../assets/file-types/mira-java.svg'
import iconJavascript from '../assets/file-types/mira-javascript.svg'
import iconJest from '../assets/file-types/mira-jest.svg'
import iconJson from '../assets/file-types/mira-json.svg'
import iconKotlin from '../assets/file-types/mira-kotlin.svg'
import iconLess from '../assets/file-types/mira-less.svg'
import iconLock from '../assets/file-types/mira-lock.svg'
import iconLua from '../assets/file-types/mira-lua.svg'
import iconMakefile from '../assets/file-types/mira-makefile.svg'
import iconMarkdown from '../assets/file-types/mira-markdown.svg'
import iconNodejs_alt from '../assets/file-types/mira-nodejs_alt.svg'
import iconNpm from '../assets/file-types/mira-npm.svg'
import iconPdf from '../assets/file-types/mira-pdf.svg'
import iconPhp from '../assets/file-types/mira-php.svg'
import iconPowerpoint from '../assets/file-types/mira-powerpoint.svg'
import iconPrettier from '../assets/file-types/mira-prettier.svg'
import iconPython from '../assets/file-types/mira-python.svg'
import iconR from '../assets/file-types/mira-r.svg'
import iconReactJavascript from '../assets/file-types/mira-react-javascript.svg'
import iconReactTypescript from '../assets/file-types/mira-react-typescript.svg'
import iconReadme from '../assets/file-types/mira-readme.svg'
import iconRuby from '../assets/file-types/mira-ruby.svg'
import iconRust from '../assets/file-types/mira-rust.svg'
import iconSass from '../assets/file-types/mira-sass.svg'
import iconConfig from '../assets/file-types/mira-config.svg'
import iconSnapcraft from '../assets/file-types/mira-snapcraft.svg'
import iconStorybook from '../assets/file-types/mira-storybook.svg'
import iconSvelte from '../assets/file-types/mira-svelte.svg'
import iconSvg from '../assets/file-types/mira-svg.svg'
import iconSwift from '../assets/file-types/mira-swift.svg'
import iconTable from '../assets/file-types/mira-table.svg'
import iconToml from '../assets/file-types/mira-toml.svg'
import iconTsconfig from '../assets/file-types/mira-tsconfig.svg'
import iconTypescript from '../assets/file-types/mira-typescript.svg'
import iconVideo from '../assets/file-types/mira-video.svg'
import iconVitest from '../assets/file-types/mira-vitest.svg'
import iconVue from '../assets/file-types/mira-vue.svg'
import iconWord from '../assets/file-types/mira-word.svg'
import iconXml from '../assets/file-types/mira-xml.svg'
import iconYaml from '../assets/file-types/mira-yaml.svg'
import iconYarn from '../assets/file-types/mira-yarn.svg'
import iconZip from '../assets/file-types/mira-zip.svg'

const icons: Record<string, string> = {
  "astro": iconAstro,
  "audio": iconAudio,
  "babel": iconBabel,
  "c": iconC,
  "certificate": iconCertificate,
  "console": iconShell,
  "cpp": iconCpp,
  "csharp": iconCsharp,
  "css": iconCss,
  "dart": iconDart,
  "database": iconDatabase,
  "docker": iconDocker,
  "document": iconDocument,
  "editorconfig": iconEditorconfig,
  "eslint": iconEslint,
  "font": iconFont,
  "gemfile": iconGemfile,
  "git": iconGit,
  "go": iconGo,
  "graphql": iconGraphql,
  "h": iconH,
  "hpp": iconHpp,
  "html": iconHtml,
  "image": iconImage,
  "java": iconJava,
  "javascript": iconJavascript,
  "jest": iconJest,
  "json": iconJson,
  "kotlin": iconKotlin,
  "less": iconLess,
  "lock": iconLock,
  "lua": iconLua,
  "makefile": iconMakefile,
  "markdown": iconMarkdown,
  "nodejs_alt": iconNodejs_alt,
  "npm": iconNpm,
  "pdf": iconPdf,
  "php": iconPhp,
  "powerpoint": iconPowerpoint,
  "prettier": iconPrettier,
  "python": iconPython,
  "r": iconR,
  "react": iconReactJavascript,
  "react_ts": iconReactTypescript,
  "readme": iconReadme,
  "ruby": iconRuby,
  "rust": iconRust,
  "sass": iconSass,
  "settings": iconConfig,
  "snapcraft": iconSnapcraft,
  "storybook": iconStorybook,
  "svelte": iconSvelte,
  "svg": iconSvg,
  "swift": iconSwift,
  "table": iconTable,
  "toml": iconToml,
  "tsconfig": iconTsconfig,
  "typescript": iconTypescript,
  "video": iconVideo,
  "vitest": iconVitest,
  "vue": iconVue,
  "word": iconWord,
  "xml": iconXml,
  "yaml": iconYaml,
  "yarn": iconYarn,
  "zip": iconZip,
}

const DEFAULT_FILE_ICON_NAME = "document";

const FILE_NAME_ICON_ALIASES: Record<string, string> = {
  ".editorconfig": "editorconfig",
  ".env": "settings",
  ".gitattributes": "git",
  ".gitignore": "git",
  ".npmrc": "npm",
  ".nvmrc": "nodejs_alt",
  ".prettierrc": "prettier",
  ".yarnrc": "yarn",
  "babel.config": "babel",
  bun: "lock",
  "bun.lock": "lock",
  cargo: "rust",
  "cargo.lock": "lock",
  dockerfile: "docker",
  eslint: "eslint",
  "eslint.config": "eslint",
  gemfile: "gemfile",
  jest: "jest",
  "jest.config": "jest",
  makefile: "makefile",
  "package-lock": "lock",
  "pnpm-lock": "lock",
  readme: "readme",
  tsconfig: "tsconfig",
  vitest: "vitest",
  "vitest.config": "vitest",
  yarn: "yarn",
};

const EXTENSION_ICON_ALIASES: Record<string, string> = {
  backup: "document",
  bash: "console",
  cjs: "javascript",
  cts: "typescript",
  css: "css",
  // Office 扩展名与 Material Icons 素材名不一致，直接用扩展名拼路径会选错图标；
  // 这里显式收敛到同一套产品语义，旧版与新版 Word 文件也共用 word 图标。
  csv: "table",
  tsv: "table",
  xls: "table",
  ppt: "powerpoint",
  doc: "word",
  docx: "word",
  go: "go",
  html: "html",
  java: "java",
  jpeg: "image",
  jpg: "image",
  js: "javascript",
  jsx: "react",
  json: "json",
  jsonl: "json",
  mjs: "javascript",
  md: "markdown",
  m4a: "audio",
  m4v: "video",
  flac: "audio",
  mov: "video",
  mp3: "audio",
  mp4: "video",
  ogg: "audio",
  opus: "audio",
  mts: "typescript",
  pdf: "pdf",
  php: "php",
  png: "image",
  pptx: "powerpoint",
  py: "python",
  responses: "json",
  rs: "rust",
  sb: "storybook",
  sql: "database",
  sh: "console",
  snap: "snapcraft",
  svg: "svg",
  toml: "toml",
  ts: "typescript",
  tsx: "react_ts",
  txt: "document",
  wav: "audio",
  weba: "audio",
  webm: "video",
  xlsx: "table",
  yaml: "yaml",
  yml: "yaml",
  zsh: "console",
};

export function miraFileTreeIconName(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const lastSlash = normalizedPath.lastIndexOf("/");
  const leaf = lastSlash === -1 ? normalizedPath : normalizedPath.slice(lastSlash + 1);
  const normalizedLeaf = leaf.toLowerCase();
  const lastDot = leaf.lastIndexOf(".");
  const fileNameWithoutExtension =
    lastDot === -1 ? normalizedLeaf : normalizedLeaf.slice(0, lastDot);

  const fileNameAliasCandidates = new Set<string>([normalizedLeaf, fileNameWithoutExtension]);

  // 之前只会匹配完整文件名和"去掉最后一个扩展名"的结果，
  // 像 vitest.config.ts / tsconfig.base.json / .env.local 这类多段文件名会提前退回扩展名图标，
  // 导致配置文件语义丢失。这里逐段回退 stem，让常见配置文件能稳定命中更准确的图标。
  let stemCandidate = fileNameWithoutExtension;
  while (stemCandidate.includes(".")) {
    stemCandidate = stemCandidate.slice(0, stemCandidate.lastIndexOf("."));
    if (stemCandidate) {
      fileNameAliasCandidates.add(stemCandidate);
    }
  }

  for (const candidate of fileNameAliasCandidates) {
    const aliasedFileName = FILE_NAME_ICON_ALIASES[candidate];
    if (typeof aliasedFileName === "string") {
      return aliasedFileName;
    }
  }

  if (lastDot === -1) {
    return DEFAULT_FILE_ICON_NAME;
  }

  const extension = leaf.slice(lastDot + 1).toLowerCase();
  const alias = EXTENSION_ICON_ALIASES[extension];
  return typeof alias === "string" ? alias : extension || DEFAULT_FILE_ICON_NAME;
}

export function miraFileTreeIcon(path: string): string {
  const source = icons[miraFileTreeIconName(path)]
  return typeof source === 'string' ? source : icons.document
}
