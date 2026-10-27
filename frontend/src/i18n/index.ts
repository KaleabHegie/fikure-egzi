import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { am } from './locales/am'
import { en } from './locales/en'

export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'am', label: 'አማርኛ', short: 'አማ' },
] as const
export type Language = (typeof LANGUAGES)[number]['code']

const STORAGE_KEY = 'fe.lang'
const DEFAULT_LANGUAGE: Language = 'am'

function storedLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'am') return saved
  } catch {
    // storage unavailable
  }
  return DEFAULT_LANGUAGE
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, am: { translation: am } },
  lng: storedLanguage(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'am'],
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
})

function syncDocument(lng: string) {
  document.documentElement.lang = lng
}
syncDocument(i18n.language)
i18n.on('languageChanged', (lng) => {
  syncDocument(lng)
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    // ignore
  }
})

export function currentLanguage(): Language {
  return i18n.language === 'en' ? 'en' : 'am'
}

/**
 * Translates a message that may be either an i18n key (optionally with
 * params, see `msg()`) or plain text from the server, which passes through.
 */
export function translateMessage(message: string | undefined): string | undefined {
  if (!message) return message
  const [key, raw] = message.split('|', 2) as [string, string | undefined]
  if (!i18n.exists(key)) return message
  // Keys here are dynamic (validated by i18n.exists above), so bypass the typed-key signature.
  const t = i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string
  return t(key, raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined)
}

/** Encodes a translation key + params into a validation message string. */
export function msg(key: string, params?: Record<string, string | number>): string {
  return params ? `${key}|${JSON.stringify(params)}` : key
}

export default i18n
