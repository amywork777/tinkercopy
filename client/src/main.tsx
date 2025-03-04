import { createRoot } from "react-dom/client";
import Home from "./app/page";
import "./index.css";
import { ThemeProvider } from "./components/ui/theme-provider";
import { DeviceProvider } from "./lib/hooks/use-device";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="taiyaki-theme">
    <DeviceProvider>
      <Home />
    </DeviceProvider>
  </ThemeProvider>
);
