import { forwardRef, useId, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error || hint ? messageId : undefined}
        className={cn(
          "h-10 w-full rounded-md border bg-surface px-3 text-sm transition-colors placeholder:text-muted-foreground",
          error ? "border-danger" : "border-border hover:border-muted-foreground",
          className,
        )}
        {...props}
      />
      {(error || hint) && (
        <p
          id={messageId}
          role={error ? "alert" : undefined}
          className={cn("text-xs", error ? "text-danger" : "text-muted-foreground")}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
