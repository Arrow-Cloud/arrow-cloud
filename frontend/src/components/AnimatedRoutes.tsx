import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import PageTransition from './PageTransition';
import { ProtectedRoute } from './';
import { PacksPage } from '../pages/packs/PacksPage';
import { PackPage } from '../pages/packs/PackPage';
import { UsersPage } from '../pages/users';
import { ChartsPage } from '../pages/charts';
import { ChartPage } from '../pages/charts';
import { PlayPage } from '../pages/plays';
import { SessionPage } from '../pages/SessionPage';
import { LoginPage } from '../pages/login/LoginPage';
import { RegisterPage } from '../pages/register/RegisterPage';
import { VerifyEmailPage } from '../pages/verify-email/VerifyEmailPage';
import ForgotPasswordPage from '../pages/forgot-password/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/reset-password/ResetPasswordPage';
import { EditProfilePage } from '../pages/profile/EditProfile';
import { PackUploaderPage } from '../pages/pack-uploader/PackUploaderPage';
import { UserPage } from '../pages/UserPage';
import { HomePage } from '../pages/home';
import { BlueShiftPage, BlueShiftResultsPage } from '../pages/blueshift';
import PrivacyPolicyPage from '../pages/privacy/PrivacyPolicyPage';
import HelpPage from '../pages/help/HelpPage';
import OverallLeaderboardPage from '../pages/leaderboards/OverallLeaderboardPage';
import DeviceLoginPage from '../pages/device-login/DeviceLoginPage';
import { UserPerfectScoresPage } from '../pages/UserPerfectScoresPage';

const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <PageTransition key={location.pathname}>
        <Routes location={location}>
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
          <Route path="/user/:userId/perfect-scores/:scoreType" element={<UserPerfectScoresPage />} />
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
          <Route path="/device-login/:sessionId" element={<DeviceLoginPage />} />
        </Routes>
      </PageTransition>
    </AnimatePresence>
  );
};

export default AnimatedRoutes;
