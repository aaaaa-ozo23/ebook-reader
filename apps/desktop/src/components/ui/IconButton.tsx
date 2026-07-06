import type { ButtonHTMLAttributes, ReactNode } from "react";

import "./controls.css";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  icon: ReactNode;
}

export function IconButton({
  className = "",
  icon,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button type={type} className={`ui-icon-button ${className}`.trim()} {...props}>
      {icon}
    </button>
  );
}
