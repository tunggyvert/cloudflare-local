import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } from 'electron'
import { join } from 'node:path'
import { CoreClient } from './core-client'
import { IPC_INVOKE, IPC_EVENT, type CoreMethod } from '../shared/protocol'

const core = new CoreClient()
let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

function createWindow(): void {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('ready-to-show', () => win?.show())

  /**
   * Closing the window hides it instead of quitting. This is the whole of
   * "background work" for v0.1: the core service, its Docker watchers, and any
   * supervised cloudflared keep running with no window on screen. A real
   * OS-level daemon is a later, separate decision.
   */
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win?.hide()
    if (process.platform === 'darwin') app.dock?.hide()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

function showWindow(): void {
  if (!win) { createWindow(); return }
  win.show()
  win.focus()
  if (process.platform === 'darwin') app.dock?.show()
}

function createTray(): void {
  // Empty image keeps the scaffold dependency-free; replace with a template
  // icon in resources/ before shipping.
  tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip('cloudflare-local')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open cloudflare-local', click: showWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]))
  tray.on('click', showWindow)
}

app.whenReady().then(() => {
  core.start()

  // One typed bridge for every core method — no per-method IPC channels.
  ipcMain.handle(IPC_INVOKE, async (_e, method: CoreMethod, params: unknown) => {
    try {
      const result = await core.invoke(method, params as never)
      return { ok: true, result }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  core.on('event', (ev) => win?.webContents.send(IPC_EVENT, ev))

  createWindow()
  createTray()

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

// Tray-resident: closing every window must not quit the app, on any platform.
app.on('window-all-closed', () => { /* intentionally empty */ })

app.on('before-quit', async (e) => {
  if (quitting) return
  e.preventDefault()
  quitting = true
  // Shut the core down cleanly so no cloudflared is left behind.
  await core.stop()
  app.quit()
})
