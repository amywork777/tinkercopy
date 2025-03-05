import { createRoot } from "react-dom/client";
import Home from "./app/page";
import "./index.css";
import { ThemeProvider } from "./components/ui/theme-provider";
import { AuthProvider } from "./context/AuthContext";
import { AuthWrapper } from "./components/AuthWrapper";
import { Toaster } from "sonner";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="taiyaki-theme">
    <AuthProvider>
      <AuthWrapper>
        <Home />
        <Toaster position="top-right" />
      </AuthWrapper>
    </AuthProvider>
  </ThemeProvider>
);
