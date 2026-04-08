import React from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { IntlProvider, NavBar, LoadingSpinner, Footer } from './components';
import ScrollToTop from './components/ScrollToTop';
import AnimatedRoutes from './components/AnimatedRoutes';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { LeaderboardViewProvider } from './contexts/LeaderboardViewContext';
import { useAutoDetectTimezone } from './hooks/useTimezone';
import { StreamerWidgetPage } from './pages/widget';

const AppContent: React.FC = () => {
  const { isInitializing } = useAuth();

  // Auto-detect and set user timezone if not already set
  useAutoDetectTimezone();

  if (isInitializing) {
    return <LoadingSpinner />;
  }

  return (
    <Router>
      <ScrollToTop />
      <Routes>
        {/* Widget routes without navbar/footer */}
        <Route path="/widget/streamer" element={<StreamerWidgetPage />} />

        {/* Regular routes with navbar/footer */}
        <Route
          path="*"
          element={
            <>
              <div className="fixed top-0 left-0 right-0 z-50">
                <NavBar />
              </div>
              <div className="flex flex-col min-h-screen bg-gradient-to-b from-base-200 via-base-100/95 to-primary/5">
                <div className="flex-1">
                  <AnimatedRoutes />
                </div>
                <Footer />
              </div>
            </>
          }
        />
      </Routes>
    </Router>
  );
};

const App: React.FC = () => {
  return (
    <IntlProvider>
      <AuthProvider>
        <NotificationProvider>
          <LeaderboardViewProvider>
            <AppContent />
          </LeaderboardViewProvider>
        </NotificationProvider>
      </AuthProvider>
    </IntlProvider>
  );
};

export default App;
