import { randomBytes } from 'node:crypto'

export interface FirstPartyGrantRecord {
  appId: string
  webContentsId: number
  capabilities: ReadonlySet<string>
}

/** 主进程持有的第一方会话授权；renderer 只能拿到不可推导的句柄。 */
export class FirstPartyGrantStore {
  private readonly grants = new Map<string, FirstPartyGrantRecord>()

  issue(appId: string, webContentsId: number, capabilities: readonly string[]) {
    const id = randomBytes(32).toString('hex')
    this.grants.set(id, { appId, webContentsId, capabilities: new Set(capabilities) })
    return id
  }

  resolve(id: string, webContentsId: number) {
    const grant = this.grants.get(id)
    return grant?.webContentsId === webContentsId ? grant : undefined
  }

  revoke(id: string, webContentsId: number) {
    const grant = this.grants.get(id)
    if (grant?.webContentsId !== webContentsId) return false
    return this.grants.delete(id)
  }

  revokeForWebContents(webContentsId: number) {
    for (const [id, grant] of this.grants) {
      if (grant.webContentsId === webContentsId) this.grants.delete(id)
    }
  }
}
