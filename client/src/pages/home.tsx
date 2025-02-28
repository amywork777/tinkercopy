import { Viewport } from "@/components/Viewport";
import { Sidebar } from "@/components/Sidebar";

export default function Home() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1">
        <Viewport />
      </main>
    </div>
  );
}
