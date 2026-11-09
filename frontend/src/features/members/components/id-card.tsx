import logoUrl from '@/assets/logo.png'
import { gcToEc } from '@/lib/ethiopian-calendar'
import { memberQrPayload, useQrDataUrl } from '@/lib/qr'
import { useMemberPhoto } from '../api'
import type { Member } from '../types'

/** The church and school name across the card's green band. */
export const ID_CARD_HEADING = 'በደ/ነ/ቅ/ዮሐንስ የፍቁረ እግዚእ ሰንበት ት/ቤት'

export type IdCardMember = Pick<
  Member,
  'id' | 'memberCode' | 'firstName' | 'fatherName' | 'christianName' | 'dateOfBirth' | 'phone' | 'emergencyContactName' | 'hasPhoto' | 'updatedAt'
>

/** Ethiopian-calendar birth date as on the paper cards: day-month-year. */
function ecDayMonthYear(iso: string | null): string {
  const ec = iso ? gcToEc(iso) : null
  return ec ? `${ec.day}-${ec.month}-${ec.year}` : ''
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <p className="flex min-w-0 gap-[1mm] whitespace-nowrap">
      <span className="shrink-0">{label}፡</span>
      <span className="truncate font-medium">{value}</span>
    </p>
  )
}

/** Head-and-shoulders placeholder for members without a photo. */
function Silhouette() {
  return (
    <svg viewBox="0 0 100 120" className="size-full" aria-hidden>
      <rect width="100" height="120" fill="#A8C3E6" />
      <ellipse cx="50" cy="46" rx="21" ry="25" fill="#fff" />
      <path d="M8 120c2-26 18-40 42-40s40 14 42 40z" fill="#fff" />
    </svg>
  )
}

/**
 * One membership ID card at true CR80 size (85.6 × 54 mm), laid out like the
 * school's printed cards: green name band and seal, QR code, details, photo,
 * the year range it is valid for and the office's numbers.
 */
export function IdCard({ member, validity, contact }: { member: IdCardMember; validity: string; contact: string }) {
  const { data: qr } = useQrDataUrl(memberQrPayload(member.memberCode), 360)
  const photo = useMemberPhoto(member)
  const name = `${member.firstName} ${member.fatherName}`

  return (
    <article
      lang="am"
      aria-label={`${name} ${member.memberCode}`}
      className="id-card relative h-[54mm] w-[85.6mm] overflow-hidden rounded-[1.5mm] border border-neutral-400 bg-white font-sans text-neutral-900"
    >
      <svg viewBox="0 0 856 540" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
        <path d="M700 110C655 290 575 440 470 540H856V110Z" fill="#D4E0F1" />
        <path d="M0 540C230 410 610 405 856 478V540Z" fill="#fff" />
        <path d="M0 462C55 492 110 520 165 540H0Z" fill="#D4E0F1" />
      </svg>

      <header className="relative flex h-[11mm] items-center justify-between gap-[2mm] bg-[#1B8A3A] pr-[2.5mm] pl-[3mm] text-white">
        <p className="truncate text-[9pt] leading-none font-bold">{ID_CARD_HEADING}</p>
        <img src={logoUrl} alt="" className="size-[8.5mm] shrink-0 rounded-full bg-white p-[0.3mm]" />
      </header>

      <div className="absolute top-[13mm] left-[3mm] w-[27mm]">
        {qr ? <img src={qr} alt={`QR ${member.memberCode}`} className="size-[27mm]" /> : <div className="size-[27mm] bg-neutral-100" />}
        <p className="mt-[0.6mm] text-center text-[4.6pt] whitespace-nowrap text-neutral-700">የሚያገለግልበት ጊዜ = {validity}</p>
      </div>

      <div className="absolute top-[14mm] left-[32mm] grid w-[30mm] gap-[1.6mm] text-[6.2pt] leading-tight">
        <Row label="ስም" value={name} />
        <Row label="ክርስትና ስም" value={member.christianName} />
        <Row label="የትውልድ ቀን" value={ecDayMonthYear(member.dateOfBirth)} />
        <Row label="የወላጅ ስም" value={member.emergencyContactName} />
        <Row label="ስልክ" value={member.phone} />
      </div>

      <div className="absolute top-[15.5mm] right-[3mm] w-[18mm]">
        <p className="mb-[0.8mm] text-center text-[5pt] whitespace-nowrap text-neutral-700">
          የመ.ቁ፡ <span className="font-mono font-semibold text-neutral-900">{member.memberCode}</span>
        </p>
        <div className="h-[22mm] w-[18mm] overflow-hidden">
          {photo ? <img src={photo} alt={name} className="size-full object-cover" /> : <Silhouette />}
        </div>
      </div>

      <footer className="absolute inset-x-0 bottom-[1.6mm] grid justify-items-center gap-[0.5mm] pl-[18mm] leading-none">
        <p className="text-[6.2pt]">ለበለጠ መረጃ፡ {contact}</p>
        <p className="text-[5pt]">ይህ መታወቂያ የሚያገለግለው አባል ለሆነ ብቻ ነው።</p>
      </footer>
    </article>
  )
}
