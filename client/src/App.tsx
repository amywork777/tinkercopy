import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './app/page';
import ImportPage from './pages/Import';
import PricingPage from './pages/Pricing';
import PricingSuccessPage from './pages/PricingSuccess';
import ThingiverseCallback from './pages/ThingiverseCallback';
import SuccessPage from './components/SuccessPage';
import CheckoutConfirmation from './pages/CheckoutConfirmation';
import OrderDetails from './components/OrderDetails';
import { TestTrialPage } from './pages/TestTrialPage';

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/pricing-success" element={<PricingSuccessPage />} />
        <Route path="/thingiverse-callback" element={<ThingiverseCallback />} />
        <Route path="/success" element={<SuccessPage />} />
        <Route path="/checkout-confirmation" element={<CheckoutConfirmation />} />
        <Route path="/order/:orderId" element={<OrderDetails />} />
        <Route path="/test-trial" element={<TestTrialPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App; 