import { useAuth } from '@shared/contexts/AuthContext';
import GuestHome from './GuestHome';
import PlayerHome from './PlayerHome';

// New home page (in progress, at /beta): a dashboard when logged in, an event pitch when logged out.
const BetaHomePage = () => {
  const { user } = useAuth();
  return user ? <PlayerHome /> : <GuestHome />;
};

export default BetaHomePage;
