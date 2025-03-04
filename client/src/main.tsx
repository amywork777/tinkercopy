import { createRoot } from "react-dom/client";
import Home from "./app/page";
import "./index.css";
import { ThemeProvider } from "./components/ui/theme-provider";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="taiyaki-theme">
    <Home />
  </ThemeProvider>
);
