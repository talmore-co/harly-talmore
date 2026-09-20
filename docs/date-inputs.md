# Date inputs

Use `components/ui/date-picker.tsx` for date-only fields. It composes the shared
shadcn Calendar and Popover; do not add native `input type="date"` controls.

Values and change callbacks use `YYYY-MM-DD` strings. Calendar display uses local
dates without converting through UTC. The component supports controlled values,
uncontrolled `defaultValue`, form `name`, required fields, disabled state, labels,
and inclusive `min`/`max` dates. Required fields cannot be cleared in the calendar.
An offscreen text input retains native form validation and FormData integration.
Invalid form submission focuses and opens the picker.

Time-of-day fields remain separate from date selection. Interview timezone and
availability checks still use the selected date and the existing time field.
