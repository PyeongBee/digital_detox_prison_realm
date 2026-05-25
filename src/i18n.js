const path = require('path')
const fs   = require('fs')

const LOCALES_DIR = path.join(__dirname, '..', 'locales')
const SUPPORTED   = ['ko', 'en', 'ja', 'zh']
const cache       = {}

function getLocale (lang) {
  const l = SUPPORTED.includes(lang) ? lang : 'ko'
  if (!cache[l]) cache[l] = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${l}.json`), 'utf8'))
  return cache[l]
}

module.exports = { getLocale, SUPPORTED }
