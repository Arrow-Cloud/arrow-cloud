import React from 'react';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import { FormattedMessage } from 'react-intl';
import { ProfileAvatar } from '../../../components';

interface WelcomeBackCardProps {
  user: {
    alias: string;
    profileImageUrl?: string | null;
  };
}

export const WelcomeBackCard: React.FC<WelcomeBackCardProps> = ({ user }) => {
  return (
    <div className="card bg-gradient-to-br from-base-100 via-base-100/90 to-primary/10 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:shadow-primary/20 mb-8 border border-primary/20 hover:border-primary/40 transition-all duration-500">
      <div className="card-body">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <ProfileAvatar profileImageUrl={user.profileImageUrl} alias={user.alias} size="lg" />
            <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              <FormattedMessage
                defaultMessage="Welcome back, {name}!"
                id="ms2BeF"
                description="welcome message for logged in users"
                values={{ name: user.alias }}
              />
            </h2>
          </div>
          <Link
            to="/user"
            className="btn btn-md gap-2 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white border-0 hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl"
          >
            <User className="w-5 h-5" />
            <span>
              <FormattedMessage defaultMessage="View Profile" id="BTbrvn" description="button to go to user profile" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
};
