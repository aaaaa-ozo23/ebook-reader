import { useCallback, type KeyboardEvent } from "react";

import "./controls.css";

interface SegmentedControlOption<TValue extends string> {
  disabled?: boolean;
  label: string;
  value: TValue;
}

interface SegmentedControlProps<TValue extends string> {
  className?: string;
  label: string;
  onChange: (value: TValue) => void;
  optionClassName?: string;
  options: readonly SegmentedControlOption<TValue>[];
  value: TValue;
}

export function SegmentedControl<TValue extends string>({
  className = "",
  label,
  onChange,
  optionClassName = "",
  options,
  value,
}: SegmentedControlProps<TValue>) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      const enabledOptions = options.filter((option) => !option.disabled);
      const currentIndex = enabledOptions.findIndex((option) => option.value === value);
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex =
        (Math.max(currentIndex, 0) + delta + enabledOptions.length) %
        enabledOptions.length;
      const nextOption = enabledOptions[nextIndex];

      if (nextOption !== undefined) {
        event.preventDefault();
        onChange(nextOption.value);
      }
    },
    [onChange, options, value],
  );

  return (
    <div
      className={`ui-segmented-control ${className}`.trim()}
      role="group"
      aria-label={label}
      onKeyDown={handleKeyDown}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`ui-segmented-control__option ${optionClassName}`.trim()}
          aria-pressed={option.value === value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
