import { Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAssetPhoto } from '../api'
import type { Asset } from '../types'

/** An asset's photo, or a placeholder box. */
export function AssetPhoto({
  asset,
  className,
}: {
  asset: Pick<Asset, 'id' | 'hasPhoto' | 'updatedAt' | 'name'>
  className?: string
}) {
  const url = useAssetPhoto(asset)
  return (
    <div className={cn('grid shrink-0 place-items-center overflow-hidden rounded-md bg-muted', className)}>
      {url ? (
        <img src={url} alt={asset.name} className="size-full object-cover" />
      ) : (
        <Package className="size-1/2 max-h-8 max-w-8 text-muted-foreground" aria-hidden />
      )}
    </div>
  )
}
