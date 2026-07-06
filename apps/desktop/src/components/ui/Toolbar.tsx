import type { HTMLAttributes, ReactNode } from "react";

import "./controls.css";

interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  "aria-label": string;
  children: ReactNode;
}

export function Toolbar({ children, className = "", ...props }: ToolbarProps) {
  return (
    <div role="toolbar" className={`ui-toolbar ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
