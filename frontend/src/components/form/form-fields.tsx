import { type Control, type FieldPath, type FieldValues, useController } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { EthDatePicker } from '@/components/common/eth-date-picker'
import { EthTimePicker } from '@/components/common/eth-time-picker'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { translateMessage } from '@/i18n'
import { cn } from '@/lib/utils'

/**
 * react-hook-form bindings for the shadcn Field primitives. Every form in the
 * app uses these so labels, required markers, descriptions and error
 * messages look and behave the same everywhere.
 */
interface BaseFieldProps<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label: string
  description?: string
  required?: boolean
  className?: string
}

/** Validation messages are i18n keys (client) or plain text (server). */
function TranslatedError({ message }: { message?: string }) {
  useTranslation() // re-render on language change
  return <FieldError errors={message ? [{ message: translateMessage(message) }] : []} />
}

function Label({ htmlFor, label, required }: { htmlFor: string; label: string; required?: boolean }) {
  return (
    <FieldLabel htmlFor={htmlFor}>
      {label}
      {required && (
        <span className="text-destructive" aria-hidden>
          *
        </span>
      )}
    </FieldLabel>
  )
}

type TextFieldProps<T extends FieldValues> = BaseFieldProps<T> &
  Omit<React.ComponentProps<typeof Input>, 'name' | 'defaultValue' | 'value' | 'onChange' | 'onBlur'>

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  ...inputProps
}: TextFieldProps<T>) {
  // Destructured so lint's ref analysis doesn't treat the whole `field` object as a ref.
  const {
    field: { ref, name: fieldName, value: fieldValue, onChange, onBlur },
    fieldState,
  } = useController({ control, name })
  const id = `field-${name}`
  return (
    <Field data-invalid={fieldState.invalid || undefined} className={className}>
      <Label htmlFor={id} label={label} required={required} />
      <Input
        {...inputProps}
        id={id}
        name={fieldName}
        ref={ref}
        value={(fieldValue as string | undefined) ?? ''}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={fieldState.invalid || undefined}
        aria-required={required || undefined}
      />
      {description && !fieldState.error && <FieldDescription>{description}</FieldDescription>}
      <TranslatedError message={fieldState.error?.message} />
    </Field>
  )
}

type TextareaFieldProps<T extends FieldValues> = BaseFieldProps<T> &
  Omit<React.ComponentProps<typeof Textarea>, 'name' | 'defaultValue' | 'value' | 'onChange' | 'onBlur'>

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  ...textareaProps
}: TextareaFieldProps<T>) {
  // Destructured so lint's ref analysis doesn't treat the whole `field` object as a ref.
  const {
    field: { ref, name: fieldName, value: fieldValue, onChange, onBlur },
    fieldState,
  } = useController({ control, name })
  const id = `field-${name}`
  return (
    <Field data-invalid={fieldState.invalid || undefined} className={className}>
      <Label htmlFor={id} label={label} required={required} />
      <Textarea
        {...textareaProps}
        id={id}
        name={fieldName}
        ref={ref}
        value={(fieldValue as string | undefined) ?? ''}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={fieldState.invalid || undefined}
      />
      {description && !fieldState.error && <FieldDescription>{description}</FieldDescription>}
      <TranslatedError message={fieldState.error?.message} />
    </Field>
  )
}

export interface Option<V extends string = string> {
  value: V
  label: string
}

// Radix Select forbids empty-string item values, so "no selection" gets a sentinel.
const EMPTY = '__empty__'

type SelectFieldProps<T extends FieldValues> = BaseFieldProps<T> & {
  options: readonly Option[]
  placeholder?: string
  /** Adds a "Not specified" choice that maps back to ''. */
  allowEmpty?: boolean
  /** Label for the empty choice (default: "Not specified"). */
  emptyLabel?: string
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  options,
  placeholder,
  allowEmpty,
  emptyLabel,
}: SelectFieldProps<T>) {
  const { t } = useTranslation()
  // Destructured so lint's ref analysis doesn't treat the whole `field` object as a ref.
  const {
    field: { ref, name: fieldName, value: fieldValue, onChange, onBlur },
    fieldState,
  } = useController({ control, name })
  const id = `field-${name}`
  const value = (fieldValue as string | undefined) || (allowEmpty ? EMPTY : '')
  return (
    <Field data-invalid={fieldState.invalid || undefined} className={className}>
      <Label htmlFor={id} label={label} required={required} />
      <Select
        name={fieldName}
        value={value}
        onValueChange={(v) => onChange(v === EMPTY ? '' : v)}
      >
        <SelectTrigger
          id={id}
          ref={ref}
          onBlur={onBlur}
          aria-invalid={fieldState.invalid || undefined}
          className={cn('w-full', !fieldValue && 'text-muted-foreground')}
        >
          <SelectValue placeholder={placeholder ?? t('common.select')} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && <SelectItem value={EMPTY}>{emptyLabel ?? t('common.notSpecified')}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && !fieldState.error && <FieldDescription>{description}</FieldDescription>}
      <TranslatedError message={fieldState.error?.message} />
    </Field>
  )
}

type DateFieldProps<T extends FieldValues> = BaseFieldProps<T> & {
  disabled?: boolean
  clearable?: boolean
  fromEcYear?: number
  toEcYear?: number
}

/** Ethiopian-calendar date input; the form value stays Gregorian "YYYY-MM-DD". */
export function DateField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  clearable,
  fromEcYear,
  toEcYear,
  disabled,
}: DateFieldProps<T>) {
  const {
    field: { value: fieldValue, onChange, onBlur },
    fieldState,
  } = useController({ control, name })
  const id = `field-${name}`
  return (
    <Field data-invalid={fieldState.invalid || undefined} className={className}>
      <Label htmlFor={id} label={label} required={required} />
      <EthDatePicker
        id={id}
        value={(fieldValue as string | undefined) ?? ''}
        onChange={onChange}
        onBlur={onBlur}
        invalid={fieldState.invalid}
        clearable={clearable ?? !required}
        disabled={disabled}
        fromEcYear={fromEcYear}
        toEcYear={toEcYear}
      />
      {description && !fieldState.error && <FieldDescription>{description}</FieldDescription>}
      <TranslatedError message={fieldState.error?.message} />
    </Field>
  )
}

/** Ethiopian-clock time input; the form value stays 24-hour "HH:mm". */
export function TimeField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  className,
  disabled,
}: BaseFieldProps<T> & { disabled?: boolean }) {
  const {
    field: { value: fieldValue, onChange, onBlur },
    fieldState,
  } = useController({ control, name })
  const id = `field-${name}`
  return (
    <Field data-invalid={fieldState.invalid || undefined} className={className}>
      <Label htmlFor={id} label={label} required={required} />
      <EthTimePicker
        id={id}
        value={(fieldValue as string | undefined) ?? ''}
        onChange={onChange}
        onBlur={onBlur}
        invalid={fieldState.invalid}
        disabled={disabled}
      />
      {description && !fieldState.error && <FieldDescription>{description}</FieldDescription>}
      <TranslatedError message={fieldState.error?.message} />
    </Field>
  )
}

/** On/off setting rendered as a switch row. */
export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
}: BaseFieldProps<T>) {
  const {
    field: { value: fieldValue, onChange, onBlur },
  } = useController({ control, name })
  const id = `field-${name}`
  return (
    <Field orientation="horizontal" className={cn('items-start justify-between gap-4', className)}>
      <div className="space-y-0.5">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </div>
      <Switch id={id} checked={Boolean(fieldValue)} onCheckedChange={onChange} onBlur={onBlur} />
    </Field>
  )
}
