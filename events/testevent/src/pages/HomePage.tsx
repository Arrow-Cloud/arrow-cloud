import { useAuth } from '@shared/contexts/AuthContext';
import { Link } from 'react-router-dom';

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="pt-28 pb-16 px-4">
      <div className="container mx-auto text-center">
        <h1 className="text-5xl font-bold mb-4">Test Event</h1>
        <p className="text-xl text-base-content/70 mb-8">Welcome to the test event site</p>

        {user ? (
          <div className="card bg-base-200 max-w-md mx-auto p-6">
            <p className="text-lg">
              Signed in as <span className="font-bold text-primary">{user.alias}</span>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-base-content/60">Sign in to participate</p>
            <Link to="/login" className="btn btn-primary btn-lg">
              Sign In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
