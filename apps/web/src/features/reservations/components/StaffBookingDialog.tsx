import { createStaffReservationSchema } from "@smartdine/shared";
import { useState } from "react";

import { SelectField, TextAreaField } from "@/components/forms/fields";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/features/auth/components/FormError";
import { useAvailability } from "@/features/public/api/publicQueries";
import { cn } from "@/lib/utils";
import { formatClock } from "@/utils/format";

import { useCreateStaffReservation } from "../api/reservationQueries";

/** Phone / walk-in booking entered by staff. Same availability and conflict rules as online. */
export function StaffBookingDialog({
  branchId,
  defaultDate,
  onClose,
}: {
  branchId: string;
  defaultDate: string;
  onClose: () => void;
}) {
  const create = useCreateStaffReservation();
  const [date, setDate] = useState(defaultDate);
  const [guests, setGuests] = useState(2);
  const [time, setTime] = useState<string | null>(null);
  const [areaId, setAreaId] = useState("");
  const [contact, setContact] = useState({
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    specialRequest: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const availability = useAvailability(branchId, date, guests);
  const slot = availability.data?.slots.find((s) => s.time === time);

  const submit = async () => {
    setError(null);
    const parsed = createStaffReservationSchema.safeParse({
      branchId,
      date,
      time,
      partySize: guests,
      diningAreaId: areaId || undefined,
      ...contact,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    try {
      await create.mutateAsync(parsed.data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="New reservation"
      description="For phone and walk-in bookings."
      size="lg"
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setTime(null);
            }}
          />
          <TextField
            label="Guests"
            type="number"
            min={1}
            max={50}
            value={guests}
            onChange={(e) => {
              setGuests(Math.max(1, Number(e.target.value)));
              setTime(null);
            }}
          />
        </div>

        {availability.isPending && (
          <div
            role="status"
            aria-label="Checking availability"
            className="h-16 animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none"
          />
        )}
        {availability.data?.closed && (
          <p className="text-sm text-muted-foreground">The branch is closed on this date.</p>
        )}
        {availability.data && !availability.data.closed && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Time</legend>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {availability.data.slots.map((s) => (
                <button
                  key={s.time}
                  type="button"
                  disabled={!s.available}
                  aria-pressed={time === s.time}
                  onClick={() => setTime(s.time)}
                  className={cn(
                    "h-9 rounded-md border text-xs font-medium",
                    time === s.time
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface hover:bg-surface-muted",
                    !s.available && "cursor-not-allowed opacity-40 line-through",
                  )}
                >
                  {formatClock(s.time)}
                </button>
              ))}
            </div>
            {errors.time && (
              <p role="alert" className="mt-1 text-xs text-danger">
                Choose a time
              </p>
            )}
          </fieldset>
        )}
        {slot && slot.areas.length > 1 && (
          <SelectField
            label="Area"
            placeholder="No preference"
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            options={slot.areas.map((a) => ({
              value: a.id,
              label: `${a.name} (${a.tables} free)`,
            }))}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Guest name"
            value={contact.guestName}
            error={errors.guestName}
            onChange={(e) => setContact({ ...contact, guestName: e.target.value })}
          />
          <TextField
            label="Phone"
            type="tel"
            value={contact.guestPhone}
            error={errors.guestPhone}
            onChange={(e) => setContact({ ...contact, guestPhone: e.target.value })}
          />
          <TextField
            label="Email"
            type="email"
            className="sm:col-span-2"
            value={contact.guestEmail}
            error={errors.guestEmail}
            onChange={(e) => setContact({ ...contact, guestEmail: e.target.value })}
          />
        </div>
        <TextAreaField
          label="Notes"
          value={contact.specialRequest}
          onChange={(e) => setContact({ ...contact, specialRequest: e.target.value })}
        />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={create.isPending} onClick={() => void submit()}>
            {create.isPending ? "Booking…" : "Create reservation"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
