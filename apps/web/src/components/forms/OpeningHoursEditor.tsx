import { WEEK_DAYS, type OpeningHours, type WeekDay } from "@smartdine/shared";

const DAY_LABELS: Record<WeekDay, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const DEFAULT_HOURS = { open: "09:00", close: "22:00" };

/** Seven-day opening-hours editor. A day set to "Closed" is stored as null. */
export function OpeningHoursEditor({
  value,
  onChange,
  legend = "Opening hours",
}: {
  value: OpeningHours | null | undefined;
  onChange: (next: OpeningHours) => void;
  legend?: string;
}) {
  const hours = value ?? {};

  const setDay = (day: WeekDay, next: OpeningHours[WeekDay]) => onChange({ ...hours, [day]: next });

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {WEEK_DAYS.map((day) => {
        const current = hours[day];
        const closed = current === null || current === undefined;
        return (
          <div
            key={day}
            className="grid grid-cols-[6.5rem_1fr] items-center gap-3 sm:grid-cols-[7rem_6rem_1fr]"
          >
            <span className="text-sm">{DAY_LABELS[day]}</span>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!closed}
                onChange={(e) => setDay(day, e.target.checked ? DEFAULT_HOURS : null)}
                className="size-4 accent-[var(--primary)]"
              />
              Open
            </label>
            {closed ? (
              <span className="text-sm text-muted-foreground">Closed</span>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  aria-label={`${DAY_LABELS[day]} opening time`}
                  value={current.open}
                  onChange={(e) => setDay(day, { ...current, open: e.target.value })}
                  className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                />
                <span aria-hidden>–</span>
                <input
                  type="time"
                  aria-label={`${DAY_LABELS[day]} closing time`}
                  value={current.close}
                  onChange={(e) => setDay(day, { ...current, close: e.target.value })}
                  className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                />
              </div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
