import { contextBridge, ipcRenderer } from 'electron'
import { IPC_INVOKE, IPC_EVENT, type CoreMethod, type CoreRequests, type RpcEvent } from '../shared/protocol'

/**
 * The renderer gets exactly two capabilities: call a named core method, and
 * subscribe to core events. No filesystem, no Docker socket, no tokens — those
 * stay in the core service, which the renderer cannot reach directly.
 */
const api = {
  invoke<M extends CoreMethod>(method: M, params: CoreRequests[M]['req']): Promise<CoreRequests[M]['res']> {
    return ipcRenderer
      .invoke(IPC_INVOKE, method, params)
      .then((r: { ok: boolean; result?: unknown; error?: string }) => {
        if (!r.ok) throw new Error(r.error ?? 'core error')
        return r.result as CoreRequests[M]['res']
      })
  },

  onEvent(handler: (ev: RpcEvent) => void): () => void {
    const listener = (_e: unknown, ev: RpcEvent) => handler(ev)
    ipcRenderer.on(IPC_EVENT, listener)
    return () => { ipcRenderer.removeListener(IPC_EVENT, listener) }
  },
}

contextBridge.exposeInMainWorld('core', api)

export type CoreApi = typeof api
