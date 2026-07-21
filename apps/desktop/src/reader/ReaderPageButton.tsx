import { memo } from "react";

export interface ReaderPageButtonProps {
  direction: "previous" | "next";
  disabled?: boolean;
  onClick: () => void;
}

export const ReaderPageButton = memo(function ReaderPageButton({
  direction,
  disabled = false,
  onClick,
}: ReaderPageButtonProps) {
  const isPrevious = direction === "previous";
  const icon = (
    <svg
      aria-hidden="true"
      className="reader-page-button__chevron"
      viewBox="0 0 20 20"
      width="20"
      height="20"
    >
      <path
        d={isPrevious ? "m12.5 4.5-5 5.5 5 5.5" : "m7.5 4.5 5 5.5-5 5.5"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );

  return (
    <button
      type="button"
      className="reader-tool-button reader-page-button"
      disabled={disabled}
      onClick={onClick}
    >
      {isPrevious ? icon : null}
      <span className="reader-page-button__label">
        {isPrevious ? "Previous" : "Next"}
      </span>
      {isPrevious ? null : icon}
    </button>
  );
});
