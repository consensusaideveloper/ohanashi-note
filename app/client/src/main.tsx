import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { DEFAULT_FONT_SIZE_LEVEL } from "./lib/constants";
import "./app.css";

// Catch unhandled promise rejections for developer observability.
// Not shown to users — purely for console debugging.
window.addEventListener(
  "unhandledrejection",
  (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    console.error("Unhandled promise rejection:", {
      reason,
    });
  },
);

// Set default font-size attribute before first render to prevent FOUC.
// FontSizeProvider will overwrite this with the saved value from the server.
document.documentElement.dataset["fontSize"] = DEFAULT_FONT_SIZE_LEVEL;

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
