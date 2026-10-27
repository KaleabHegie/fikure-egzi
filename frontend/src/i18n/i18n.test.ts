import i18n, { msg, translateMessage } from '.'
import { am } from './locales/am'
import { en } from './locales/en'

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : keys(v as object, `${prefix}${k}.`),
  )
}

describe('i18n', () => {
  it('Amharic covers every English key, with no empty strings', () => {
    expect(keys(am).sort()).toEqual(keys(en).sort())
    const flat = (o: object): string[] =>
      Object.values(o).flatMap((v) => (typeof v === 'string' ? [v] : flat(v as object)))
    expect(flat(am).every((s) => s.trim().length > 0)).toBe(true)
  })

  it('translates validation keys with params, in the current language', async () => {
    const message = msg('validation.tooLong', { max: 100 })
    expect(translateMessage(message)).toBe('Must be at most 100 characters')
    await i18n.changeLanguage('am')
    expect(translateMessage(message)).toBe('ከ100 ፊደላት መብለጥ የለበትም')
  })

  it('passes server text through untouched', () => {
    expect(translateMessage('A record with this email already exists')).toBe(
      'A record with this email already exists',
    )
  })
})
