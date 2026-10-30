export type WorkspaceEditorInfo = { id: string; name: string; icon?: string; fileOnly?: boolean }

export function selectWorkspaceEditor(editors: WorkspaceEditorInfo[], preferredId?: string) {
  return editors.find(editor => editor.id === preferredId) || editors[0]
}

export function workspaceEditorIcon(icon?: string) {
  return typeof icon === 'string' && icon.length <= 128_000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(icon) ? icon : undefined
}
