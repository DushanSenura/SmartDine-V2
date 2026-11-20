import { useState } from "react";

import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/features/auth/components/FormError";

import { useMyProfile, useUpdateMyProfile } from "../api/customerQueries";

const list = (text: string) =>
  text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

function Form({ initial }: { initial: NonNullable<ReturnType<typeof useMyProfile>["data"]> }) {
  const update = useUpdateMyProfile();
  const [birthday, setBirthday] = useState(initial.birthday ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [preferences, setPreferences] = useState(initial.preferences ?? "");
  const [dietary, setDietary] = useState(initial.dietaryPreferences.join(", "));
  const [allergies, setAllergies] = useState(initial.allergies.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <form
      aria-label="Dining preferences"
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        try {
          await update.mutateAsync({
            birthday: birthday || null,
            address,
            preferences,
            dietaryPreferences: list(dietary),
            allergies: list(allergies),
          });
          setSaved(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't save.");
        }
      }}
    >
      <div>
        <h2 className="font-display text-xl font-semibold">Dining preferences</h2>
        <p className="text-sm text-muted-foreground">
          Helps our team look after you. Always tell your server about allergies when you order.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Birthday"
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
        />
        <TextField label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <TextField
          label="Dietary preferences"
          hint="Comma-separated, e.g. vegetarian"
          value={dietary}
          onChange={(e) => setDietary(e.target.value)}
        />
        <TextField
          label="Allergies"
          hint="Comma-separated, e.g. peanuts, shellfish"
          value={allergies}
          onChange={(e) => setAllergies(e.target.value)}
        />
      </div>
      <TextField
        label="Anything else we should know"
        value={preferences}
        onChange={(e) => setPreferences(e.target.value)}
      />
      <FormError message={error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save preferences"}
        </Button>
        {saved && (
          <span role="status" className="text-sm text-success">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}

export function PreferencesForm() {
  const { data } = useMyProfile();
  // Mount the form only once the profile is known, so its fields start from the saved values.
  return data ? <Form initial={data} /> : null;
}
