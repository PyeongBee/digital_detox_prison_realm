const { ipcRenderer } = require('electron')
const { getLocale }   = require('../i18n')

ipcRenderer.invoke('get-settings').then(s => {
  const L = getLocale(s.language || 'ko')
  document.querySelector('.main-text').textContent = s.warningText || L.warning.mainText
  document.querySelector('.sub-text').textContent  = L.warning.subText

  // 경고는 휴식 1분 전에 표시되므로 60초 + 여유 10초 후 자동 닫힘
  setTimeout(() => window.close(), 70 * 1000)
})
