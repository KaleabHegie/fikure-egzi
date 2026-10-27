import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import i18n from '@/i18n'

// jsdom lacks pointer-capture and scrollIntoView, which Radix Select uses when opened.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => undefined
Element.prototype.releasePointerCapture ??= () => undefined
Element.prototype.scrollIntoView ??= () => undefined

// Tests assert English copy; the app's default language is Amharic.
beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => cleanup())
