import React from "react";
import ReactDOM from "react-dom/client";

import "./styles/design-tokens.css";
import App from "./App";

async function renderApplication() {
  const shouldRenderFixture =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("fixture") === "design-system";
  const RootComponent = shouldRenderFixture
    ? (await import("./components/ui/DesignSystemFixture")).DesignSystemFixture
    : App;

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <RootComponent />
    </React.StrictMode>,
  );
}

void renderApplication();
