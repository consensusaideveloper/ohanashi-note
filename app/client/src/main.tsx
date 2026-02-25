import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { DEFAULT_FONT_SIZE_LEVEL } from "./lib/constants";
import "./app.css";

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
