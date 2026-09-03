import './App.css';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { IntlProvider, NavBar } from '@shared/components';
import { AuthProvider, useAuth } from '@shared/contexts/AuthContext';
import { NotificationProvider } from '@shared/contexts/NotificationContext';
import { LoginPage } from '@shared/pages/login/LoginPage';
import { LoadingSpinner } from '@shared/components';
import ScrollToTop from '@shared/components/ScrollToTop';
import { useIntl, FormattedMessage } from 'react-intl';
import { Flag } from 'lucide-react';
import HomePage from './pages/HomePage';
import SubmitChartPage from './pages/SubmitChartPage';
import EventFooter from './components/EventFooter';
import ThemeToggle from './components/ThemeToggle';

const EventLogo = () => {
  const { formatMessage } = useIntl();
  return (
    <div className="flex items-center gap-3">
      <img
        src="https://assets.arrowcloud.dance/logos/20250725/ac%20logo.png"
        alt={formatMessage({ defaultMessage: 'Arrow Cloud', id: 'P9WhvC', description: 'Alt text for Arrow Cloud logo' })}
        className="h-8 w-auto"
      />
    </div>
  );
}

const EventNavExtras = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  return (
    <div className="flex flex-col gap-1 lg:flex-row lg:items-center">
      {user && (
        <Link to="/submit" className={`btn btn-ghost btn-sm gap-1.5 justify-start ${pathname === '/submit' ? 'text-accent' : ''}`}>
          <Flag className="w-4 h-4" />
          <FormattedMessage defaultMessage="Submit Chart" id="aWVPGE" description="Submit chart nav link" />
        </Link>
      )}
      <ThemeToggle />
    </div>
  );
};

const AppContent = () => {
  const { isInitializing } = useAuth();

  if (isInitializing) {
    return <LoadingSpinner />;
  }

  return (
    <Router>
      <ScrollToTop />
      <div className="fixed top-0 left-0 right-0 z-50">
        <NavBar eventMode profileUrl="https://arrowcloud.dance/profile" logo={<EventLogo />} extra={<EventNavExtras />} />
      </div>
      <div className="flex flex-col min-h-screen bg-base-100">
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/submit" element={<SubmitChartPage />} />
            <Route path="/login" element={<LoginPage eventMode />} />
          </Routes>
        </div>
        <EventFooter />
      </div>
    </Router>
  );
};

export default function App() {
  return (
    <IntlProvider>
      <AuthProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </AuthProvider>
    </IntlProvider>
  );
}
