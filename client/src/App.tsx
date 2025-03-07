import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './app/page';
import ImportPage from './pages/Import';
import PricingPage from './pages/Pricing';
import PricingSuccess from './pages/PricingSuccess';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/pricing-success" element={<PricingSuccess />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
} 