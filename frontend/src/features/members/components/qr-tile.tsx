import { AMHARIC_NAME } from '@/components/layout/brand-mark'
import { memberQrPayload, useQrDataUrl } from '@/lib/qr'
import type { Member } from '../types'
import { memberFullName } from '../utils'

/**
 * One cell of the A4 QR sheet (4 × 5 per page): the member's QR code with
 * their name and ID, sized in mm so it prints at true size. The dashed
 * border is the cutting guide.
 */
export function QrTile({ member }: { member: Pick<Member, 'memberCode' | 'firstName' | 'fatherName' | 'grandfatherName'> }) {
  const { data: qr } = useQrDataUrl(memberQrPayload(member.memberCode), 360)
  const name = memberFullName(member)
  return (
    <article
      className="qr-tile flex flex-col items-center justify-center gap-[1mm] border border-dashed border-neutral-300 bg-white px-[2mm] py-[1.5mm] text-center text-neutral-900"
      aria-label={`${name} ${member.memberCode}`}
    >
      <p lang="am" className="w-full truncate text-[6pt] text-neutral-500">
        {AMHARIC_NAME}
      </p>
      {qr ? (
        <img src={qr} alt={`QR ${member.memberCode}`} className="size-[34mm]" />
      ) : (
        <div className="size-[34mm] bg-neutral-100" />
      )}
      <p className="line-clamp-2 w-full text-[7.5pt] leading-tight font-semibold break-words">{name}</p>
      <p className="font-mono text-[9pt] font-bold tracking-wide text-[#076B13]">{member.memberCode}</p>
    </article>
  )
}
