import React from "react";
import { useTheme } from "./ui/theme-provider";
import { Button } from "./ui/button";

interface ProductCardProps {
  title: string;
  description: string;
  price: string;
  size: string;
  material: string;
  shipsIn: string;
  imageUrl?: string;
}

export function TaiyakiProductCard({
  title,
  description,
  price,
  size,
  material,
  shipsIn,
  imageUrl,
}: ProductCardProps) {
  const { theme } = useTheme();
  
  return (
    <div className={`p-4 rounded-lg ${theme === 'light' ? 'bg-white' : 'bg-[#1f2937]'} shadow-sm w-full max-w-sm`}>
      {/* Product Image */}
      <div className={`w-full aspect-square flex items-center justify-center rounded-lg mb-4 ${theme === 'light' ? 'bg-[#f0f6f7]' : 'bg-[#2d3748]'}`}>
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="object-contain h-4/5 w-4/5" />
        ) : (
          <div className="relative w-20 h-20">
            <div className={`absolute inset-0 ${theme === 'light' ? 'bg-white' : 'bg-black'} rounded-full`}></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-[#A5DCE4] rounded-bl-full rounded-tr-full rotate-45"></div>
            <div className={`absolute top-[30%] left-[30%] w-2 h-2 ${theme === 'light' ? 'bg-black' : 'bg-white'} rounded-full`}></div>
          </div>
        )}
      </div>
      
      {/* Product Info */}
      <h3 className={`text-xl font-semibold mb-2 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
        {title}
      </h3>
      <p className={`mb-4 text-sm ${theme === 'light' ? 'text-gray-700' : 'text-gray-300'}`}>
        {description}
      </p>
      <p className={`font-bold mb-5 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
        {price}
      </p>
      
      {/* Product Specs */}
      <div className="mb-6 grid grid-cols-2 gap-2 text-sm">
        <div className={`${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>SIZE</div>
        <div className={`${theme === 'light' ? 'text-gray-800' : 'text-gray-100'}`}>{size}</div>
        
        <div className={`${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>MATERIAL</div>
        <div className={`${theme === 'light' ? 'text-gray-800' : 'text-gray-100'}`}>{material}</div>
        
        <div className={`${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>SHIPS IN</div>
        <div className={`${theme === 'light' ? 'text-gray-800' : 'text-gray-100'}`}>{shipsIn}</div>
      </div>
      
      {/* Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant={theme === 'light' ? 'primary' : 'primary'} className="w-full">
          Add to Cart
        </Button>
        <Button variant={theme === 'light' ? 'customize' : 'customize'} className="w-full">
          Customize
        </Button>
      </div>
      
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="ghost" className="w-full text-sm">
          Save for Later
        </Button>
        <Button variant="ghost" className="w-full text-sm">
          View Details
        </Button>
      </div>
    </div>
  );
} 