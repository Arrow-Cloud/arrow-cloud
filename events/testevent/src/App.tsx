import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { IntlProvider, NavBar, LoadingSpinner } from '@shared/components';
import { AuthProvider, useAuth } from '@shared/contexts/AuthContext';
import { NotificationProvider } from '@shared/contexts/NotificationContext';
import { LoginPage } from '@shared/pages/login/LoginPage';
import ScrollToTop from '@shared/components/ScrollToTop';
import { Sparkles } from 'lucide-react';
import HomePage from './pages/HomePage';
import EventFooter from './components/EventFooter';
import ThemeToggle from './components/ThemeToggle';

const EventLogo = () => (
  <div className="flex items-center gap-2">
    <Sparkles className="w-7 h-7 text-accent" />
    <span className="text-xl font-bold tracking-tight">Test Event</span>
  </div>
);

const AppContent = () => {
  const { isInitializing } = useAuth();

  if (isInitializing) {
    return <LoadingSpinner />;
  }

  return (
    <Router>
      <ScrollToTop />
      <div className="fixed top-0 left-0 right-0 z-50">
        <NavBar eventMode logo={<EventLogo />} extra={<ThemeToggle />} />
      </div>
      <div className="flex flex-col min-h-screen bg-base-100">
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
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
