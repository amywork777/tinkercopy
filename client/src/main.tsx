import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "./components/ui/theme-provider";
import { AuthProvider } from "./context/AuthContext";
import { AuthWrapper } from "./components/AuthWrapper";
import { Toaster } from "sonner";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="taiyaki-theme">
    <AuthProvider>
      <AuthWrapper>
        <App />
        <Toaster position="top-right" />
      </AuthWrapper>
    </AuthProvider>
  </ThemeProvider>
);
