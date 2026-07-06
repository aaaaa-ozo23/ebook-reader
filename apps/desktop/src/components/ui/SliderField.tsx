import type { ChangeEventHandler } from "react";

import "./controls.css";

interface SliderFieldProps {
  label: string;
  max: number;
  min: number;
  onChange: ChangeEventHandler<HTMLInputElement>;
  step: number;
  value: number;
  valueLabel?: string;
}

export function SliderField({
  label,
  max,
  min,
  onChange,
  step,
  value,
  valueLabel = String(value),
}: SliderFieldProps) {
  return (
    <label className="ui-slider-field">
      <span className="ui-slider-field__label">
        {label}
        <strong>{valueLabel}</strong>
      </span>
      <input
        aria-label={label}
        max={max}
        min={min}
        onChange={onChange}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}
