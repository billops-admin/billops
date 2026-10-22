"use client";

import { useFormStatus } from "react-dom";

type Props = {
  label: string;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
  title?: string;
};

export default function SubmitButton({
  label,
  pendingLabel = "Working…",
  className = "btn btn-primary",
  name,
  value,
  title,
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      name={name}
      value={value}
      title={title}
    >
      {pending ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}
