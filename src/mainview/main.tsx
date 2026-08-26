import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./globals.css";

createRoot(document.getElementById("root")!).render(<App />);
