const { ipcRenderer } = require('electron')
const { getLocale }   = require('../i18n')

// ── State ────────────────────────────────────────────────────────────────────
let presets      = []
let videoPath    = null
let currentLang  = 'ko'
let currentLocale = getLocale('ko')

// ── DOM refs ─────────────────────────────────────────────────────────────────
const workSlider    = document.getElementById('workSlider')
const breakSlider   = document.getElementById('breakSlider')
const workVal       = document.getElementById('workVal')
const breakVal      = document.getElementById('breakVal')
const presetsRow    = document.getElementById('presetsRow')
const addPresetForm = document.getElementById('addPresetForm')
const gifName       = document.getElementById('gifName')
const msgWarning      = document.getElementById('msgWarning')
const msgRelease      = document.getElementById('msgRelease')
const msgReleaseReady = document.getElementById('msgReleaseReady')
const msgTimerLabel   = document.getElementById('msgTimerLabel')
const savedMsg      = document.getElementById('savedMsg')
const langSelect    = document.getElementById('langSelect')

// ── i18n helpers ─────────────────────────────────────────────────────────────
function nestedGet (obj, key) {
  return key.split('.').reduce((o, k) => o?.[k], obj)
}

function applyLocale (L) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const val = nestedGet(L, el.dataset.i18n)
    if (val != null) el.textContent = val
  })
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const val = nestedGet(L, el.dataset.i18nPlaceholder)
    if (val != null) el.placeholder = val
  })
  document.documentElement.lang = currentLang
  document.title = L.settings.header.replace(/^⛩\s*/, '')

  // Update minute badges with locale unit
  workVal.textContent  = `${workSlider.value}${L.settings.minuteUnit}`
  breakVal.textContent = `${breakSlider.value}${L.settings.minuteUnit}`

  // Keep gifName in sync when showing the default label
  if (!videoPath) gifName.textContent = L.settings.videoDefault
}

// ── Load ─────────────────────────────────────────────────────────────────────
ipcRenderer.invoke('get-settings').then(s => {
  currentLang   = s.language || 'ko'
  currentLocale = getLocale(currentLang)

  langSelect.value  = currentLang
  workSlider.value  = s.workMinutes
  breakSlider.value = s.breakMinutes

  presets   = s.presets   || []
  videoPath = s.videoPath || null

  msgWarning.value      = s.warningText
  msgRelease.value      = s.releaseText
  msgReleaseReady.value = s.releaseReady
  msgTimerLabel.value   = s.timerLabel

  gifName.textContent = videoPath
    ? (s.videoOriginalName || videoPath.split(/[/\\]/).pop())
    : currentLocale.settings.videoDefault

  applyLocale(currentLocale)
  renderPresets()
  highlightMatchingPreset()
})

// ── Language selector ─────────────────────────────────────────────────────────
langSelect.addEventListener('change', () => {
  currentLang   = langSelect.value
  currentLocale = getLocale(currentLang)

  applyLocale(currentLocale)

  // Reset incantation texts to new language defaults
  msgWarning.value      = currentLocale.warning.mainText
  msgRelease.value      = currentLocale.overlay.releaseBtn
  msgReleaseReady.value = currentLocale.overlay.releaseReady
  msgTimerLabel.value   = currentLocale.overlay.timerLabel
})

// ── Tabs ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'))
    tab.classList.add('active')
    document.getElementById(`pane-${tab.dataset.tab}`).classList.add('active')
  })
})

// ── Sliders ──────────────────────────────────────────────────────────────────
workSlider.addEventListener('input', () => {
  workVal.textContent = `${workSlider.value}${currentLocale.settings.minuteUnit}`
  highlightMatchingPreset()
})
breakSlider.addEventListener('input', () => {
  breakVal.textContent = `${breakSlider.value}${currentLocale.settings.minuteUnit}`
  highlightMatchingPreset()
})

// ── Presets ──────────────────────────────────────────────────────────────────
function renderPresets () {
  presetsRow.innerHTML = ''

  presets.forEach((p, i) => {
    const item = document.createElement('div')
    item.className = 'preset-item'

    const btn = document.createElement('button')
    btn.className = 'preset-btn'
    btn.innerHTML = `${p.name}<br><span style="opacity:0.6;font-size:11px">${p.work}/${p.break}${currentLocale.settings.minuteUnit}</span>`
    btn.addEventListener('click', () => {
      workSlider.value  = p.work
      breakSlider.value = p.break
      workVal.textContent  = `${p.work}${currentLocale.settings.minuteUnit}`
      breakVal.textContent = `${p.break}${currentLocale.settings.minuteUnit}`
      highlightMatchingPreset()
    })

    const del = document.createElement('button')
    del.className = 'preset-del'
    del.textContent = '×'
    del.title = '삭제'
    del.addEventListener('click', (e) => {
      e.stopPropagation()
      presets.splice(i, 1)
      renderPresets()
      highlightMatchingPreset()
    })

    item.appendChild(btn)
    item.appendChild(del)
    presetsRow.appendChild(item)
  })

  const addBtn = document.createElement('button')
  addBtn.className = 'preset-add-btn'
  addBtn.textContent = '+'
  addBtn.title = currentLocale.settings.presetLabel
  addBtn.addEventListener('click', () => {
    addPresetForm.classList.add('open')
    document.getElementById('presetName').focus()
  })
  presetsRow.appendChild(addBtn)
}

function highlightMatchingPreset () {
  presetsRow.querySelectorAll('.preset-btn').forEach((btn, i) => {
    const p = presets[i]
    const match = p && p.work == workSlider.value && p.break == breakSlider.value
    btn.classList.toggle('active', match)
  })
}

document.getElementById('btnConfirmPreset').addEventListener('click', () => {
  const name = document.getElementById('presetName').value.trim()
  const work = parseInt(document.getElementById('presetWork').value)
  const brk  = parseInt(document.getElementById('presetBreak').value)
  if (!name || isNaN(work) || isNaN(brk)) return
  presets.push({ name, work, break: brk })
  addPresetForm.classList.remove('open')
  document.getElementById('presetName').value = ''
  renderPresets()
  highlightMatchingPreset()
})

document.getElementById('btnCancelPreset').addEventListener('click', () => {
  addPresetForm.classList.remove('open')
})

document.getElementById('presetName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btnConfirmPreset').click()
})

// ── Appearance / Video ────────────────────────────────────────────────────────
document.getElementById('btnPreview').addEventListener('click', async (e) => {
  const L = currentLocale
  e.target.disabled = true
  e.target.textContent = L.settings.previewRunning
  await ipcRenderer.invoke('preview-overlay')
  setTimeout(() => {
    e.target.disabled = false
    e.target.textContent = L.settings.preview
  }, 2500)
})

document.getElementById('btnSelectGif').addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('select-video')
  if (result) {
    videoPath = result.dest
    gifName.textContent = result.originalName
    ipcRenderer.send('save-settings', { videoPath, videoOriginalName: result.originalName })
  }
})

document.getElementById('btnResetGif').addEventListener('click', () => {
  videoPath = null
  gifName.textContent = currentLocale.settings.videoDefault
  ipcRenderer.send('save-settings', { videoPath: null, videoOriginalName: null })
})

// ── Save / Cancel ─────────────────────────────────────────────────────────────
document.getElementById('btnSave').addEventListener('click', () => {
  ipcRenderer.send('save-settings', {
    workMinutes:  parseInt(workSlider.value),
    breakMinutes: parseInt(breakSlider.value),
    presets,
    language:     currentLang,
    warningText:  msgWarning.value.trim()      || currentLocale.warning.mainText,
    releaseText:  msgRelease.value.trim()      || currentLocale.overlay.releaseBtn,
    releaseReady: msgReleaseReady.value.trim() || currentLocale.overlay.releaseReady,
    timerLabel:   msgTimerLabel.value.trim()   || currentLocale.overlay.timerLabel,
    videoPath
  })
  savedMsg.classList.add('show')
  setTimeout(() => savedMsg.classList.remove('show'), 2000)
})

document.getElementById('btnCancel').addEventListener('click', () => window.close())
