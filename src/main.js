const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const Store = require('electron-store')
const { getLocale } = require('./i18n')

const store = new Store({
  defaults: {
    workMinutes: 50,
    breakMinutes: 10,
    presets: [
      { name: 'default',  work: 50, break: 10 },
      { name: 'Pomodoro', work: 25, break: 5 }
    ],
    language:    'ko',
    warningText:  null,
    releaseText:  null,
    releaseReady: null,
    timerLabel:   null,
    videoPath:         null,
    videoOriginalName: null
  }
})

let tray = null
let overlayWindows = []
let warningWindow  = null
let settingsWindow = null

let timerState = 'IDLE' // IDLE | WORKING | BREAK
let timerInterval = null
let secondsLeft = 0

function locale () {
  return getLocale(store.get('language') || 'ko')
}

function getSettings () {
  const L = locale()
  return {
    workMinutes:  store.get('workMinutes'),
    breakMinutes: store.get('breakMinutes'),
    presets:      store.get('presets'),
    language:     store.get('language') || 'ko',
    warningText:  store.get('warningText')  || L.warning.mainText,
    releaseText:  store.get('releaseText')  || L.overlay.releaseBtn,
    releaseReady: store.get('releaseReady') || L.overlay.releaseReady,
    timerLabel:   store.get('timerLabel')   || L.overlay.timerLabel,
    videoPath:         store.get('videoPath'),
    videoOriginalName: store.get('videoOriginalName')
  }
}

// ── Overlay Window ───────────────────────────────────────────────────────────

function createOverlayForDisplay (display) {
  const { x, y, width, height } = display.bounds

  const win = new BrowserWindow({
    x, y, width, height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    closable: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.loadFile(path.join(__dirname, 'overlay', 'index.html'))
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true)

  win.webContents.on('before-input-event', (event, input) => {
    const blocked = [
      input.key === 'F4' && input.alt,
      input.key === 'Escape',
      input.key === 'Tab' && input.alt,
    ]
    if (blocked.some(Boolean)) event.preventDefault()
  })

  win.on('closed', () => {
    overlayWindows = overlayWindows.filter(w => w !== win)
  })

  return win
}

function createOverlayWindows () {
  if (overlayWindows.length > 0) return
  const displays = screen.getAllDisplays()
  overlayWindows = displays.map(createOverlayForDisplay)
}

function showOverlay (secondsTotal) {
  createOverlayWindows()
  const customVideo = store.get('videoPath')
  const baseUrl = customVideo
    ? pathToFileURL(customVideo).href
    : pathToFileURL(path.join(__dirname, '..', 'assets', 'prison_realm_inf.mp4')).href
  const videoUrl = `${baseUrl}?t=${Date.now()}`
  const { releaseText, releaseReady, timerLabel } = getSettings()
  overlayWindows.forEach((win, i) => {
    win.show()
    win.webContents.send('start-break', { secondsTotal, primary: i === 0, videoUrl, releaseText, releaseReady, timerLabel })
  })
  if (overlayWindows[0]) overlayWindows[0].focus()
}

function hideOverlay () {
  overlayWindows.forEach(win => win.webContents.send('end-break'))
  setTimeout(() => {
    overlayWindows.forEach(win => win.hide())
  }, 1200)
}

// ── Warning Window ───────────────────────────────────────────────────────────

function showWarning () {
  if (warningWindow) return
  const { bounds } = screen.getPrimaryDisplay()
  const w = 720, h = 150
  warningWindow = new BrowserWindow({
    x: Math.round(bounds.x + (bounds.width - w) / 2),
    y: bounds.y + 20,
    width: w, height: h,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  warningWindow.loadFile(path.join(__dirname, 'warning', 'index.html'))
  warningWindow.setAlwaysOnTop(true, 'screen-saver')
  warningWindow.setIgnoreMouseEvents(true)
  warningWindow.on('closed', () => { warningWindow = null })
}

function hideWarning () {
  if (warningWindow) { warningWindow.close(); warningWindow = null }
}

// ── Settings Window ──────────────────────────────────────────────────────────

function createSettingsWindow () {
  if (settingsWindow) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 500,
    height: 600,
    resizable: false,
    frame: true,
    title: locale().settings.header.replace('⛩ ', ''),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  settingsWindow.loadFile(path.join(__dirname, 'settings', 'index.html'))
  settingsWindow.setMenuBarVisibility(false)
  settingsWindow.on('closed', () => { settingsWindow = null })
}

// ── Timer Logic ──────────────────────────────────────────────────────────────

function startWorkTimer () {
  const { workMinutes } = getSettings()
  timerState = 'WORKING'
  secondsLeft = workMinutes * 60
  updateTray()

  timerInterval = setInterval(() => {
    secondsLeft--
    updateTray()

    if (secondsLeft === 60) showWarning()

    if (secondsLeft <= 0) {
      clearInterval(timerInterval)
      hideWarning()
      startBreak()
    }
  }, 1000)
}

function startBreak () {
  const { breakMinutes } = getSettings()
  timerState = 'BREAK'
  secondsLeft = breakMinutes * 60
  updateTray()

  showOverlay(secondsLeft)

  timerInterval = setInterval(() => {
    secondsLeft--
    updateTray()
    overlayWindows.forEach(win => win.webContents.send('tick', { secondsLeft }))

    if (secondsLeft <= 0) {
      clearInterval(timerInterval)
      timerState = 'IDLE'
      updateTray()
      overlayWindows.forEach(win => win.webContents.send('break-done'))
    }
  }, 1000)
}

function pauseTimer () {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
    timerState = 'IDLE'
    updateTray()
  }
}

function resetTimer () {
  pauseTimer()
  hideWarning()
  overlayWindows.forEach(win => win.hide())
  updateTray()
}

// ── System Tray ──────────────────────────────────────────────────────────────

function formatTime (secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function updateTray () {
  if (!tray) return
  const L = locale()
  const { workMinutes, breakMinutes } = getSettings()

  let tooltip = L.appName
  if (timerState === 'WORKING')
    tooltip = L.tray.working.replace('{time}', formatTime(secondsLeft))
  else if (timerState === 'BREAK')
    tooltip = L.tray.breaking.replace('{time}', formatTime(secondsLeft))

  tray.setToolTip(tooltip)
  tray.setContextMenu(buildTrayMenu(L, workMinutes, breakMinutes))
}

function buildTrayMenu (L, workMinutes, breakMinutes) {
  if (!L) {
    L = locale()
    const s = getSettings()
    workMinutes  = s.workMinutes
    breakMinutes = s.breakMinutes
  }
  const isRunning = timerState !== 'IDLE'

  const statusLabel = timerState === 'WORKING'
    ? L.tray.working.replace('{time}', formatTime(secondsLeft))
    : timerState === 'BREAK'
      ? L.tray.breaking.replace('{time}', formatTime(secondsLeft))
      : L.tray.idle.replace('{work}', workMinutes).replace('{break}', breakMinutes)

  return Menu.buildFromTemplate([
    { label: L.appName, enabled: false },
    { type: 'separator' },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    {
      label: isRunning ? L.tray.pauseReset : L.tray.start,
      click: () => isRunning ? resetTimer() : startWorkTimer()
    },
    { label: L.tray.settings, click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: L.tray.quit, click: () => app.quit() }
  ])
}

function createTray () {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray_icon.png')
  let icon
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) throw new Error('empty')
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip(locale().appName)
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', () => tray.popUpContextMenu())
}

// ── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.on('save-settings', (event, settings) => {
  store.set(settings)
  updateTray()
})

ipcMain.handle('get-settings', () => getSettings())

ipcMain.handle('preview-overlay', async () => {
  createOverlayWindows()
  const customVideo = store.get('videoPath')
  const baseUrl = customVideo
    ? pathToFileURL(customVideo).href
    : pathToFileURL(path.join(__dirname, '..', 'assets', 'prison_realm_inf.mp4')).href
  const videoUrl = `${baseUrl}?t=${Date.now()}`
  const { releaseText, releaseReady, timerLabel } = getSettings()
  overlayWindows.forEach((win, i) => {
    win.show()
    win.webContents.send('start-break', { secondsTotal: 0, primary: i === 0, videoUrl, releaseText, releaseReady, timerLabel })
  })
  if (overlayWindows[0]) overlayWindows[0].focus()
  setTimeout(() => {
    overlayWindows.slice(1).forEach(win => win.hide())
    if (overlayWindows[0]) overlayWindows[0].webContents.send('end-break')
    setTimeout(() => { if (overlayWindows[0]) overlayWindows[0].hide() }, 1200)
  }, 3500)
})

ipcMain.handle('select-video', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(settingsWindow, {
    title: locale().settings.videoLabel,
    properties: ['openFile'],
    filters: [{ name: '영상 / GIF', extensions: ['mp4', 'webm', 'gif', 'mov'] }]
  })
  if (canceled || !filePaths[0]) return null
  const ext = path.extname(filePaths[0])
  const dest = path.join(app.getPath('userData'), `prison_custom${ext}`)

  const prevPath = store.get('videoPath')
  if (prevPath && prevPath !== dest) {
    try { fs.unlinkSync(prevPath) } catch { /* 이미 없으면 무시 */ }
  }

  fs.copyFileSync(filePaths[0], dest)
  return { dest, originalName: path.basename(filePaths[0]) }
})

ipcMain.on('user-ready', () => {
  overlayWindows.forEach(win => win.hide())
  startWorkTimer()
})

ipcMain.handle('get-timer-state', () => ({
  state: timerState,
  secondsLeft
}))

// ── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  app.setName('옥문강')
  app.setAppUserModelId('com.prison-realm')

  app.on('window-all-closed', (e) => e.preventDefault())

  createTray()
  updateTray()
})

app.on('before-quit', () => {
  if (timerInterval) clearInterval(timerInterval)
  if (tray) { tray.destroy(); tray = null }
})
