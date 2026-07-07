import React from "react";
import ReactDOM from "react-dom/client";

import "./styles/design-tokens.css";
import App from "./App";

if (
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("fixture") === "design-system"
) {
  void import("./components/ui/DesignSystemFixture").then(({ DesignSystemFixture }) => {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <DesignSystemFixture />
      </React.StrictMode>,
    );
  });
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
