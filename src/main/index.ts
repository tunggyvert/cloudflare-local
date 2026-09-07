import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog } from 'electron'
import { join } from 'node:path'
import { autoUpdater } from 'electron-updater'
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
    {
      label: 'Check for Updates…',
      click: () => {
        if (app.isPackaged) {
          autoUpdater.checkForUpdatesAndNotify().catch((err) => {
            dialog.showMessageBox({
              type: 'warning',
              title: 'Update Check',
              message: `Could not check for updates: ${err instanceof Error ? err.message : String(err)}`,
            })
          })
        } else {
          dialog.showMessageBox({
            type: 'info',
            title: 'Development Mode',
            message: 'Auto-update is disabled while running in development mode.',
          })
        }
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]))
  tray.on('click', showWindow)
}

function setupAutoUpdater(): void {
  // If an override update URL is specified via env, use it; otherwise electron-updater automatically
  // uses the GitHub Releases provider configured in electron-builder.yml
  if (process.env.CLOUDFLARE_LOCAL_UPDATE_URL) {
    try {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: process.env.CLOUDFLARE_LOCAL_UPDATE_URL,
      })
    } catch (err) {
      console.warn('[updater] Failed to set feed URL override:', err)
    }
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    win?.webContents.send(IPC_EVENT, {
      kind: 'event',
      event: 'log',
      payload: {
        source: 'updater',
        stream: 'stdout',
        line: `New version v${info.version} available. Downloading update in background…`,
        at: new Date().toISOString(),
      },
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    win?.webContents.send(IPC_EVENT, {
      kind: 'event',
      event: 'log',
      payload: {
        source: 'updater',
        stream: 'stdout',
        line: `Update v${info.version} downloaded and ready to install.`,
        at: new Date().toISOString(),
      },
    })

    if (win) {
      dialog
        .showMessageBox(win, {
          type: 'info',
          title: 'Update Available',
          message: `Version ${info.version} is ready to install.`,
          detail: 'Would you like to restart the application now to apply the update?',
          buttons: ['Restart and Install', 'Install on Exit'],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0) {
            autoUpdater.quitAndInstall()
          }
        })
        .catch(() => {})
    }
  })

  autoUpdater.on('error', (err) => {
    console.warn('[updater] Update check error:', err?.message)
  })

  // Automatically check for updates 3 seconds after launch
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 3000)

  // Periodically check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 4 * 60 * 60 * 1000)
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

  if (app.isPackaged) {
    setupAutoUpdater()
  }

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

