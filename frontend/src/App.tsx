import React from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { IntlProvider, NavBar, LoadingSpinner, ProtectedRoute, Footer } from './components';
import ScrollToTop from './components/ScrollToTop';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { LeaderboardViewProvider } from './contexts/LeaderboardViewContext';
import { useAutoDetectTimezone } from './hooks/useTimezone';
import { PacksPage } from './pages/packs/PacksPage';
import { PackPage } from './pages/packs/PackPage';
import { UsersPage } from './pages/users';
import { ChartsPage } from './pages/charts';
import { ChartPage } from './pages/charts';
import { PlayPage } from './pages/plays';
import { SessionPage } from './pages/SessionPage';
import { LoginPage } from './pages/login/LoginPage';
import { RegisterPage } from './pages/register/RegisterPage';
import { VerifyEmailPage } from './pages/verify-email/VerifyEmailPage';
import ForgotPasswordPage from './pages/forgot-password/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/reset-password/ResetPasswordPage';
import { EditProfilePage } from './pages/profile/EditProfile';
import { PackUploaderPage } from './pages/pack-uploader/PackUploaderPage';
import { UserPage } from './pages/UserPage';
import { HomePage } from './pages/home';
import { BlueShiftPage, BlueShiftResultsPage } from './pages/blueshift';
import { StreamerWidgetPage } from './pages/widget';
import PrivacyPolicyPage from './pages/privacy/PrivacyPolicyPage';
import HelpPage from './pages/help/HelpPage';
import OverallLeaderboardPage from './pages/leaderboards/OverallLeaderboardPage';

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
              <div className="flex flex-col min-h-screen">
                <div className="flex-1">
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/blueshift" element={<BlueShiftPage />} />
                    <Route path="/blueshift-results" element={<BlueShiftResultsPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/verify-email" element={<VerifyEmailPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route
                      path="/profile"
                      element={
                        <ProtectedRoute>
                          <EditProfilePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/user"
                      element={
                        <ProtectedRoute>
                          <UserPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/user/:userId" element={<UserPage />} />
                    <Route path="/packs" element={<PacksPage />} />
                    <Route path="/pack/:id" element={<PackPage />} />
                    <Route path="/users" element={<UsersPage />} />
                    <Route path="/charts" element={<ChartsPage />} />
                    <Route path="/chart/:chartHash" element={<ChartPage />} />
                    <Route path="/play/:playId" element={<PlayPage />} />
                    <Route path="/session/:sessionId" element={<SessionPage />} />
                    <Route
                      path="/pack-uploader"
                      element={
                        <ProtectedRoute>
                          <PackUploaderPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/privacy" element={<PrivacyPolicyPage />} />
                    <Route path="/help" element={<HelpPage />} />
                    <Route path="/leaderboards/overall" element={<OverallLeaderboardPage />} />
                  </Routes>
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
