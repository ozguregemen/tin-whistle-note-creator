import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import "./prototype.css";
import { MobilePrototype } from "./prototype";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root was not found.");
}

createRoot(root).render(
  <StrictMode>
    <MobilePrototype />
  </StrictMode>,
);
