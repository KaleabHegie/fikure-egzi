import { Check, Pencil, Plus, Tags, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocalizedName } from '@/features/classes/use-localized'
import { getErrorMessage } from '@/lib/api/errors'
import { assetCategoriesApi, useAssetCategories, useAssetMutation } from '../api'
import type { AssetCategory } from '../types'

/** Office admins add, rename and delete asset categories. */
export function CategoryManageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation()
  const name = useLocalizedName()
  const { data: categories, isPending } = useAssetCategories()
  const [draft, setDraft] = useState({ nameEn: '', nameAm: '' })
  const [editing, setEditing] = useState<{ id: number; nameEn: string; nameAm: string } | null>(null)

  const create = useAssetMutation(assetCategoriesApi.create)
  const update = useAssetMutation((a: { id: number; nameEn: string; nameAm: string }) =>
    assetCategoriesApi.update(a.id, { nameEn: a.nameEn, nameAm: a.nameAm }),
  )
  const remove = useAssetMutation(assetCategoriesApi.remove)
  const notifyError = (e: unknown) => toast.error(getErrorMessage(e))

  const add = () => {
    if (!draft.nameEn.trim() || !draft.nameAm.trim()) return
    create.mutate(
      { nameEn: draft.nameEn.trim(), nameAm: draft.nameAm.trim() },
      {
        onSuccess: () => {
          setDraft({ nameEn: '', nameAm: '' })
          toast.success(t('assets.categoriesManage.added'))
        },
        onError: notifyError,
      },
    )
  }

  const save = () => {
    if (!editing || !editing.nameEn.trim() || !editing.nameAm.trim()) return
    update.mutate(
      { id: editing.id, nameEn: editing.nameEn.trim(), nameAm: editing.nameAm.trim() },
      {
        onSuccess: () => {
          setEditing(null)
          toast.success(t('assets.categoriesManage.saved'))
        },
        onError: notifyError,
      },
    )
  }

  const destroy = (c: AssetCategory) =>
    remove.mutate(c.id, {
      onSuccess: () => toast.success(t('assets.categoriesManage.deleted', { name: name(c) })),
      onError: notifyError,
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="size-4 text-brand" />
            {t('assets.categoriesManage.title')}
          </DialogTitle>
          <DialogDescription>{t('assets.categoriesManage.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/40 p-3">
          <div className="min-w-32 flex-1">
            <Input
              value={draft.nameAm}
              onChange={(e) => setDraft((d) => ({ ...d, nameAm: e.target.value }))}
              placeholder={t('assets.categoriesManage.nameAm')}
              aria-label={t('assets.categoriesManage.nameAm')}
            />
          </div>
          <div className="min-w-32 flex-1">
            <Input
              value={draft.nameEn}
              onChange={(e) => setDraft((d) => ({ ...d, nameEn: e.target.value }))}
              placeholder={t('assets.categoriesManage.nameEn')}
              aria-label={t('assets.categoriesManage.nameEn')}
            />
          </div>
          <Button onClick={add} disabled={create.isPending || !draft.nameEn.trim() || !draft.nameAm.trim()}>
            <Plus />
            {t('assets.categoriesManage.add')}
          </Button>
        </div>

        {isPending ? (
          <Skeleton className="h-48" />
        ) : (
          <ul className="divide-y rounded-lg border">
            {(categories ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                {editing?.id === c.id ? (
                  <>
                    <Input
                      className="h-8 flex-1"
                      value={editing.nameAm}
                      onChange={(e) => setEditing((x) => x && { ...x, nameAm: e.target.value })}
                      aria-label={t('assets.categoriesManage.nameAm')}
                    />
                    <Input
                      className="h-8 flex-1"
                      value={editing.nameEn}
                      onChange={(e) => setEditing((x) => x && { ...x, nameEn: e.target.value })}
                      aria-label={t('assets.categoriesManage.nameEn')}
                    />
                    <Button size="icon-sm" onClick={save} disabled={update.isPending} aria-label={t('common.save')}>
                      <Check />
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditing(null)} aria-label={t('common.cancel')}>
                      <X />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{name(c)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {name(c) === c.nameEn ? c.nameAm : c.nameEn}
                      </span>
                    </span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t('common.edit')}
                      onClick={() => setEditing({ id: c.id, nameEn: c.nameEn, nameAm: c.nameAm })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      aria-label={t('common.delete')}
                      disabled={remove.isPending}
                      onClick={() => destroy(c)}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t('assets.categoriesManage.deleteHint')}</p>
      </DialogContent>
    </Dialog>
  )
}
