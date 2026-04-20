import './App.css';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { IntlProvider, NavBar, LoadingSpinner } from '@shared/components';
import { AuthProvider, useAuth } from '@shared/contexts/AuthContext';
import { NotificationProvider } from '@shared/contexts/NotificationContext';
import { LoginPage } from '@shared/pages/login/LoginPage';
import ScrollToTop from '@shared/components/ScrollToTop';
import { Sparkles, Music } from 'lucide-react';
import { FormattedMessage } from 'react-intl';
import HomePage from './pages/HomePage';
import ChartsPage from './pages/ChartsPage';
import EventFooter from './components/EventFooter';
import ThemeToggle from './components/ThemeToggle';

const EventLogo = () => (
  <div className="flex items-center gap-2">
    <Sparkles className="w-7 h-7 text-accent" />
    <span className="text-xl font-bold tracking-tight">
      <FormattedMessage defaultMessage="Test Event" id="HT1BxT" description="Event name in navbar logo" />
    </span>
  </div>
);

const EventNavExtras = () => {
  const { pathname } = useLocation();
  return (
    <div className="flex items-center gap-1">
      <Link to="/charts" className={`btn btn-ghost btn-sm gap-1.5 ${pathname === '/charts' ? 'text-accent' : ''}`}>
        <Music className="w-4 h-4" />
        <span className="hidden sm:inline">
          <FormattedMessage defaultMessage="Charts" id="Ai8+h1" description="Charts nav link in event site" />
        </span>
      </Link>
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
        <NavBar eventMode logo={<EventLogo />} extra={<EventNavExtras />} />
      </div>
      <div className="flex flex-col min-h-screen bg-base-100">
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/charts" element={<ChartsPage />} />
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
