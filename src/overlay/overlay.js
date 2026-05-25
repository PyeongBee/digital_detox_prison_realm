const { ipcRenderer } = require('electron')
const { getLocale }   = require('../i18n')

const video      = document.getElementById('prisonVideo')
const gif        = document.getElementById('prisonGif')
const timerEl    = document.getElementById('timer')
const timerLabel = document.getElementById('timerLabel')
const readyBtn   = document.getElementById('readyBtn')

function isGif (url) {
  return url && url.split('?')[0].toLowerCase().endsWith('.gif')
}

function showMedia (url) {
  if (isGif(url)) {
    video.pause()
    video.src = ''
    video.style.display = 'none'
    gif.src = url
    gif.style.display = 'block'
  } else {
    gif.src = ''
    gif.style.display = 'none'
    video.style.display = 'block'
    video.src = url
    video.load()
    video.play().catch(() => {})
  }
}

function stopMedia () {
  video.pause()
  video.src = ''
  gif.src = ''
  gif.style.display = 'none'
  video.style.display = 'block'
}

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
  stopMedia()
  updateTimer(secondsTotal)

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

  // Load & play media immediately (plays behind curtains)
  showMedia(videoUrl)

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
  stopMedia()
  ipcRenderer.send('user-ready')
})

// ── end-break (immediate hide from main) ─────────────────────────────────────
ipcRenderer.on('end-break', () => {
  stopMedia()
  readyBtn.classList.remove('show')
  readyBtn.style.display = 'none'
  document.body.classList.remove('visible')
  document.body.classList.add('leaving')
})
