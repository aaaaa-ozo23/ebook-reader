import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("renders the engineering shell", () => {
    render(<App />);

    expect(screen.getByRole("main", { name: "Ebook Reader" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ebook Reader" })).toBeInTheDocument();
    expect(screen.getByText("Desktop shell initialized.")).toBeInTheDocument();
  });
});
