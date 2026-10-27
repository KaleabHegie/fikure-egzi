#!/usr/bin/env sh
# All dates shown to users are Ethiopian calendar (E.C.). Years never convert
# by a constant ±7/±8 — the offset flips at Ethiopian new year — and dates are
# never formatted with Intl/toLocaleDateString. Only lib/ethiopian-calendar.ts
# may translate between calendars. (Same guard as DPMES.)
status=0
matches=$(grep -rnE "(year|Year)[A-Za-z0-9_)\\. ]*[+-] *[78]([^0-9]|$)" src \
  --include='*.ts' --include='*.tsx' | grep -v "lib/ethiopian-calendar")
if [ -n "$matches" ]; then
  echo "$matches"
  echo "✗ Calendar year arithmetic outside lib/ethiopian-calendar — use the conversion module."
  status=1
fi
matches=$(grep -rnE "toLocaleDateString|toLocaleTimeString|Intl\.DateTimeFormat|type=\"(date|time)\"" src \
  --include='*.ts' --include='*.tsx' | grep -v "lib/ethiopian-calendar")
if [ -n "$matches" ]; then
  echo "$matches"
  echo "✗ Gregorian date/time display or input — use formatDate/formatDateTime/formatTime and <DateField>/<TimeField> (Ethiopian calendar and clock)."
  status=1
fi
[ $status -eq 0 ] && echo "✓ dates and times go through the Ethiopian calendar module"
exit $status
