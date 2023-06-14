import React, { lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { hydrate, render } from 'react-dom';

import './reset.css';
import './index.module.css';

import App from './App';

import Auth from './scenes/Auth';
import NotFound from './scenes/NotFound';

const Jackpot = lazy(() => import('./scenes/Jackpot'));
const Coinflip = lazy(() => import('./scenes/Coinflip'));
const CoinflipGame = lazy(() => import('./scenes/CoinflipGame'));
const Mines = lazy(() => import('./scenes/Mines'));
const MinesGame = lazy(() => import('./scenes/MinesGame'));
const Tos = lazy(() => import('./scenes/Tos'));
const Faq = lazy(() => import('./scenes/Faq'));
const Support = lazy(() => import('./scenes/Support'));
const ProvablyFair = lazy(() => import('./scenes/ProvablyFair'));
const Leaderboard = lazy(() => import('./scenes/Leaderboard'));
const Admin = lazy(() => import('./scenes/AdminNew'));
const AdminUsers = lazy(() => import('./scenes/AdminUsers'));
const AdminSettings = lazy(() => import('./scenes/AdminSettings'));
const AdminSettingsPrices = lazy(() => import('./scenes/AdminSettingsPrices'));
const AdminSettingsPricesReview = lazy(() => import('./scenes/AdminSettingsPricesReview'));

const Index = () => (
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<App />}>
          <Route path="/auth" element={<Auth />} />

          <Route path="/" element={<Navigate to="/jackpot" />} />
          <Route path="/jackpot" element={<Jackpot />} />
          <Route path="/coinflip" element={<Coinflip />} />
          <Route path="/coinflip/:id" element={<CoinflipGame />} />
          <Route path="/mines" element={<Mines />} />
          <Route path="/mines/:id" element={<MinesGame />} />
          <Route path="/tos" element={<Tos />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/support" element={<Support />} />
          <Route path="/provably-fair" element={<ProvablyFair />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/settings/prices/:page" element={<AdminSettingsPrices />} />
          <Route path="/admin/settings/review_prices/:page" element={<AdminSettingsPricesReview />} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Router>
  </React.StrictMode>
);

if(process.env.NODE_ENV !== 'production') document.title = `[DEV] ${document.title}`;

const rootElement = document.getElementById('root');

if (rootElement.hasChildNodes()) {
  hydrate(<Index />, rootElement);
} else {
  render(<Index />, rootElement);
}