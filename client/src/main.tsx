import { createRoot } from "react-dom/client";
import Home from "./app/page";
import "./index.css";
import { ThemeProvider } from "./components/ui/theme-provider";
import { AuthProvider } from "./lib/auth-context";
import { Protected } from "./components/Protected";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="taiyaki-theme">
    <AuthProvider>
      <Protected>
        <Home />
      </Protected>
    </AuthProvider>
  </ThemeProvider>
);
