import React from "react";
import { ThemeToggle } from "./ui/theme-toggle";
import { TaiyakiProductCard } from "./TaiyakiProductCard";
import { useTheme } from "./ui/theme-provider";
import { Button } from "./ui/button";

export function TaiyakiDesignSystem() {
  const { theme } = useTheme();
  
  return (
    <div className={`min-h-screen ${theme === 'light' ? 'bg-[#f8fafc]' : 'bg-[#111827]'} transition-colors duration-300`}>
      {/* Header */}
      <header className={`w-full ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-[#1f2937] border-gray-700'} border-b py-4 px-6 flex justify-between items-center`}>
        <h1 className={`text-xl font-semibold ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
          Taiyaki Design System 1.0
        </h1>
        <ThemeToggle />
      </header>
      
      <main className="container mx-auto py-8 px-4">
        {/* Design System Title */}
        <div className="text-center mb-12">
          <div className={`inline-block px-4 py-1 rounded-full ${theme === 'light' ? 'bg-blue-50 text-blue-700' : 'bg-blue-900 text-blue-200'} mb-4`}>
            Version 1.0
          </div>
          <h2 className={`text-3xl font-bold ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
            Taiyaki Design System
          </h2>
          <p className={`mt-2 ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>
            Beautiful, modern UI components inspired by the Taiyaki aesthetic
          </p>
        </div>
        
        {/* Mode Display */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <div>
            <h3 className={`text-xl font-semibold mb-4 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
              Light Mode
            </h3>
            <div className={`bg-white rounded-lg p-6 shadow-sm border ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'}`}>
              <TaiyakiProductCard 
                title="Taiyaki Fish Stand"
                description="A sleek, customizable phone stand designed with the Taiyaki aesthetic."
                price="$24.99"
                size="10 × 8 × 12 cm"
                material="PLA, Soft-touch finish"
                shipsIn="2-3 business days"
              />
            </div>
          </div>
          
          <div>
            <h3 className={`text-xl font-semibold mb-4 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
              Dark Mode
            </h3>
            <div className={`bg-[#1f2937] rounded-lg p-6 shadow-sm border ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'}`}>
              <TaiyakiProductCard 
                title="Taiyaki Fish Stand"
                description="A sleek, customizable phone stand designed with the Taiyaki aesthetic."
                price="$24.99"
                size="10 × 8 × 12 cm"
                material="PLA, Soft-touch finish"
                shipsIn="2-3 business days"
              />
            </div>
          </div>
        </div>
        
        {/* Button Styles */}
        <div className="mb-12">
          <h3 className={`text-xl font-semibold mb-4 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
            Button Styles
          </h3>
          <div className={`rounded-lg p-6 ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-[#1f2937] border-gray-700'} border shadow-sm`}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex flex-col gap-2">
                <p className={`text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}>Primary</p>
                <Button variant="primary">Add to Cart</Button>
              </div>
              
              <div className="flex flex-col gap-2">
                <p className={`text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}>Secondary</p>
                <Button variant="taiyaki_secondary">View Details</Button>
              </div>
              
              <div className="flex flex-col gap-2">
                <p className={`text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}>Customize</p>
                <Button variant="customize">Customize</Button>
              </div>
              
              <div className="flex flex-col gap-2">
                <p className={`text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}>Save</p>
                <Button variant="save">Save for Later</Button>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <footer className={`w-full ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-[#1f2937] border-gray-700'} border-t py-6 px-6`}>
        <div className="container mx-auto">
          <p className={`text-center ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'} text-sm`}>
            © 2023 Taiyaki Design System • Created with 🐟
          </p>
        </div>
      </footer>
    </div>
  );
} 