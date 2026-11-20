import { forwardRef, useId, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const controlClass = (error?: string) =>
  cn(
    "w-full rounded-md border bg-surface px-3 text-sm transition-colors",
    error ? "border-danger" : "border-border hover:border-muted-foreground",
  );

function FieldShell({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {(error || hint) && (
        <p
          id={`${id}-message`}
          role={error ? "alert" : undefined}
          className={cn("text-xs", error ? "text-danger" : "text-muted-foreground")}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, error, hint, options, placeholder, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint}>
      <select
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${fieldId}-message` : undefined}
        className={cn(controlClass(error), "h-10", className)}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
});

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField({ label, error, hint, className, id, ...props }, ref) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <FieldShell id={fieldId} label={label} error={error} hint={hint}>
        <textarea
          ref={ref}
          id={fieldId}
          rows={3}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${fieldId}-message` : undefined}
          className={cn(controlClass(error), "py-2", className)}
          {...props}
        />
      </FieldShell>
    );
  },
);
