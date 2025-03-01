import { Viewport } from "@/components/Viewport";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Header />
      <div className="flex flex-1 w-full overflow-hidden">
        <div className="flex-1 p-4">
          <Viewport />
        </div>
        <div className="w-80 border-l h-full overflow-y-auto">
          <Sidebar />
        </div>
      </div>
    </div>
  );
} 