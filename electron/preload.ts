import { contextBridge } from 'electron'
import { platformApi } from './preload/platformApi'
import { novelApi } from './preload/novelApi'
import { windowApi } from './preload/windowApi'
import { modelApi } from './preload/modelApi'
import { harnessApi } from './preload/harnessApi'
import { automationApi } from './preload/automationApi'
import { mcpApi } from './preload/mcpApi'

contextBridge.exposeInMainWorld('platform', {
  ...platformApi,
  ...novelApi,
  ...windowApi,
  ...modelApi,
  ...harnessApi,
  ...automationApi,
  ...mcpApi,
})
