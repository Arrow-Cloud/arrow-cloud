import React from 'react';
import { User } from 'lucide-react';
import { useIntl } from 'react-intl';

interface ProfileAvatarProps {
  profileImageUrl?: string | null;
  alias: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({ profileImageUrl, alias, size = 'md', className = '' }) => {
  const { formatMessage } = useIntl();

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  };

  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24,
    xl: 32,
  };

  return (
    <div className={`${sizeClasses[size]} bg-base-300/60 rounded-full overflow-hidden flex items-center justify-center shadow-lg flex-shrink-0 ${className}`}>
      {profileImageUrl ? (
        <img
          src={profileImageUrl}
          alt={formatMessage({ defaultMessage: "{alias}'s profile", id: 'tmuyhy', description: 'Alt text for profile avatar image' }, { alias })}
          className="w-full h-full object-cover"
        />
      ) : (
        <User size={iconSizes[size]} className="text-base-content/60" />
      )}
    </div>
  );
};

export default ProfileAvatar;
