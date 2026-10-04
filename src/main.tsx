import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { i18nReady } from "./lib/i18n";
import "./index.css";

void i18nReady.then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
