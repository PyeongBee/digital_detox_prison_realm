const { ipcRenderer } = require('electron')
const { getLocale }   = require('../i18n')

const video      = document.getElementById('prisonVideo')
const timerEl    = document.getElementById('timer')
const timerLabel = document.getElementById('timerLabel')
const readyBtn   = document.getElementById('readyBtn')

let totalSeconds       = 0
let overlayLocale      = getLocale('ko')
let currentReleaseReady = ''

function formatTime (secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function updateTimer (secs) {
  timerEl.textContent = formatTime(secs)
  timerEl.classList.toggle('urgent', secs / totalSeconds < 0.2)
}

// ── start-break ───────────────────────────────────────────────────────────────
ipcRenderer.invoke('get-settings').then(s => {
  overlayLocale = getLocale(s.language || 'ko')
})

ipcRenderer.on('start-break', (event, { secondsTotal, primary, videoUrl, releaseText, releaseReady, timerLabel: labelText }) => {
  totalSeconds = secondsTotal

  // Reset all animation state from previous break
  document.body.classList.remove('leaving', 'secondary', 'sealing', 'sealed', 'visible')
  readyBtn.textContent    = releaseText || overlayLocale.overlay.releaseBtn
  timerLabel.textContent  = labelText   || overlayLocale.overlay.timerLabel
  currentReleaseReady     = releaseReady || overlayLocale.overlay.releaseReady
  readyBtn.classList.remove('show')
  readyBtn.style.display = 'none'
  video.pause()
  video.src = ''

  if (!primary) {
    document.body.classList.add('secondary')
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.body.classList.add('sealing')
      setTimeout(() => {
        document.body.classList.add('sealed')
        document.body.classList.add('visible')
      }, 560)
    }))
    return
  }

  // Load & play video immediately (plays behind curtains)
  video.src = videoUrl
  video.load()
  video.play().catch(() => {})
  updateTimer(secondsTotal)

  // Trigger 4-curtain barrier seal, then reveal video
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.body.classList.add('sealing')
    setTimeout(() => {
      document.body.classList.add('sealed')   // pin curtains in closed position
      document.body.classList.add('visible')  // fade in video
    }, 560)
  }))
})

// ── tick ──────────────────────────────────────────────────────────────────────
ipcRenderer.on('tick', (event, { secondsLeft }) => {
  updateTimer(secondsLeft)
})

// ── break-done ────────────────────────────────────────────────────────────────
ipcRenderer.on('break-done', () => {
  timerEl.textContent = currentReleaseReady
  timerEl.classList.remove('urgent')
  readyBtn.style.display = 'inline-block'
  requestAnimationFrame(() => readyBtn.classList.add('show'))
})

// ── user clicks ready ─────────────────────────────────────────────────────────
readyBtn.addEventListener('click', () => {
  video.pause()
  video.src = ''
  ipcRenderer.send('user-ready')
})

// ── end-break (immediate hide from main) ─────────────────────────────────────
ipcRenderer.on('end-break', () => {
  video.pause()
  video.src = ''
  readyBtn.classList.remove('show')
  readyBtn.style.display = 'none'
  document.body.classList.remove('visible')
  document.body.classList.add('leaving')
})
