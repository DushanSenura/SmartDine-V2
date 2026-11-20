import { createStaffRoomBookingSchema } from "@smartdine/shared";
import { useState } from "react";

import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormError } from "@/features/auth/components/FormError";
import { cn } from "@/lib/utils";
import { addDays, formatMoney } from "@/utils/format";

import {
  useCreateStaffRoomBooking,
  useRoomAvailability,
  type StaySearch,
} from "../api/roomQueries";

/** Phone / walk-in booking. Same availability, pricing and conflict rules as online. */
export function StaffRoomBookingDialog({
  branchId,
  today,
  onClose,
}: {
  branchId: string;
  today: string;
  onClose: () => void;
}) {
  const create = useCreateStaffRoomBooking();
  const [stay, setStay] = useState<StaySearch>({
    checkIn: today,
    checkOut: addDays(today, 1),
    adults: 2,
    children: 0,
  });
  const [roomTypeId, setRoomTypeId] = useState<string | null>(null);
  const [contact, setContact] = useState({
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    specialRequests: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const valid = stay.checkOut > stay.checkIn;
  const availability = useRoomAvailability(branchId, stay, valid);

  const submit = async () => {
    setError(null);
    const parsed = createStaffRoomBookingSchema.safeParse({
      branchId,
      roomTypeId,
      ...stay,
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
      title="New room booking"
      description="For phone and walk-in guests."
      size="lg"
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-4">
          <TextField
            label="Check-in"
            type="date"
            min={today}
            value={stay.checkIn}
            onChange={(e) =>
              e.target.value &&
              (setStay({
                ...stay,
                checkIn: e.target.value,
                checkOut:
                  stay.checkOut > e.target.value ? stay.checkOut : addDays(e.target.value, 1),
              }),
              setRoomTypeId(null))
            }
          />
          <TextField
            label="Check-out"
            type="date"
            min={addDays(stay.checkIn, 1)}
            value={stay.checkOut}
            onChange={(e) =>
              e.target.value &&
              (setStay({ ...stay, checkOut: e.target.value }), setRoomTypeId(null))
            }
          />
          <TextField
            label="Adults"
            type="number"
            min={1}
            value={stay.adults}
            onChange={(e) => (
              setStay({ ...stay, adults: Math.max(1, Number(e.target.value)) }),
              setRoomTypeId(null)
            )}
          />
          <TextField
            label="Children"
            type="number"
            min={0}
            value={stay.children}
            onChange={(e) => (
              setStay({ ...stay, children: Math.max(0, Number(e.target.value)) }),
              setRoomTypeId(null)
            )}
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Room type</legend>
          {availability.isPending && valid && (
            <div
              role="status"
              aria-label="Checking availability"
              className="h-16 animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none"
            />
          )}
          {availability.isError && (
            <p role="alert" className="text-sm text-danger">
              {availability.error.message}
            </p>
          )}
          {availability.data?.results.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No rooms are free for these dates and party size.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {availability.data?.results.map(({ roomType, available, quote }) => (
              <button
                key={roomType.id}
                type="button"
                aria-pressed={roomTypeId === roomType.id}
                onClick={() => setRoomTypeId(roomType.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  roomTypeId === roomType.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-surface-muted",
                )}
              >
                <span className="block font-medium">{roomType.name}</span>
                <span className="text-sm text-muted-foreground">
                  {available} free · {formatMoney(quote.total, quote.currency)} for {quote.nights}n
                </span>
              </button>
            ))}
          </div>
          {errors.roomTypeId && (
            <p role="alert" className="mt-1 text-xs text-danger">
              Choose a room type
            </p>
          )}
        </fieldset>

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
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={create.isPending} onClick={() => void submit()}>
            {create.isPending ? "Booking…" : "Create booking"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
