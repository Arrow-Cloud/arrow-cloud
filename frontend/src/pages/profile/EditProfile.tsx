import React, { useState, useEffect } from 'react';
import { User as UserIcon, Lock, Fingerprint, Key, Users, Camera, SlidersHorizontal, XCircle, Trophy } from 'lucide-react';
import { updatePreferredLeaderboards, getUser } from '../../services/api';
import { AppPageLayout } from '../../components';
import {
  EmailVerificationAlert,
  ProfileSection as ProfileSectionComponent,
  PasswordSection,
  ApiKeysSection,
  RivalsSection,
  PasskeySection,
  ProfileImageSection,
  WidgetSection,
  TrophiesSection,
} from './components';
import { FormattedMessage, useIntl } from 'react-intl';

type ProfileSection = 'profile-image' | 'alias' | 'password' | 'passkeys' | 'api-keys' | 'rivals' | 'leaderboards' | 'widget' | 'trophies';

interface NavigationItem {
  id: ProfileSection;
  label: string | React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  description: string | React.ReactNode;
}

const navigationItems: NavigationItem[] = [
  {
    id: 'profile-image',
    label: <FormattedMessage defaultMessage="Picture" description="Navigation item label for profile picture settings" id="yMETLb" />,
    icon: Camera,
    description: (
      <FormattedMessage
        defaultMessage="Upload and manage your profile picture"
        description="Navigation item description for profile picture settings"
        id="X/dxmZ"
      />
    ),
  },
  {
    id: 'alias',
    label: <FormattedMessage defaultMessage="Profile" description="Navigation item label for profile settings" id="AgADp0" />,
    icon: UserIcon,
    description: (
      <FormattedMessage defaultMessage="Manage your display name and country" description="Navigation item description for profile settings" id="D43bLy" />
    ),
  },
  {
    id: 'rivals',
    label: <FormattedMessage defaultMessage="Rivals" description="Navigation item label for rivals management" id="MAcEmn" />,
    icon: Users,
    description: <FormattedMessage defaultMessage="Manage your rivals" description="Navigation item description for rivals management" id="eksVJn" />,
  },
  {
    id: 'trophies',
    label: <FormattedMessage defaultMessage="Trophies" description="Navigation item label for trophy management" id="5i8EfE" />,
    icon: Trophy,
    description: (
      <FormattedMessage defaultMessage="Arrange and display your earned trophies" description="Navigation item description for trophy management" id="pLlCUm" />
    ),
  },
  {
    id: 'leaderboards',
    label: <FormattedMessage defaultMessage="Leaderboards" description="Navigation item label for leaderboard preferences" id="iaPSEH" />,
    icon: SlidersHorizontal,
    description: (
      <FormattedMessage
        defaultMessage="Select which leaderboards you want to see by default"
        description="Navigation item description for leaderboard preferences"
        id="MoIA9d"
      />
    ),
  },
  // HIDDEN: Streamer Widget section temporarily disabled
  // {
  //   id: 'widget',
  //   label: (
  //     <span className="flex items-center gap-2">
  //       <FormattedMessage defaultMessage="Streamer Widget" description="Navigation item label for streamer widget settings" id="34xrFN" />
  //       <span className="badge badge-primary badge-xs">
  //         <FormattedMessage defaultMessage="Beta" description="Badge label indicating a feature is in beta" id="NvFvI1" />
  //       </span>
  //     </span>
  //   ),
  //   icon: MonitorPlay,
  //   description: (
  //     <FormattedMessage
  //       defaultMessage="Configure and preview your streaming widget"
  //       description="Navigation item description for streamer widget settings"
  //       id="ejPmny"
  //     />
  //   ),
  // },
  {
    id: 'password',
    label: <FormattedMessage defaultMessage="Password" description="Navigation item label for password settings" id="EgWcdC" />,
    icon: Lock,
    description: <FormattedMessage defaultMessage="Change your account password" description="Navigation item description for password settings" id="bmQJci" />,
  },
  {
    id: 'passkeys',
    label: <FormattedMessage defaultMessage="Passkey Management" description="Navigation item label for passkey settings" id="M7sGOe" />,
    icon: Fingerprint,
    description: (
      <FormattedMessage defaultMessage="Set up and manage your passkeys" description="Navigation item description for passkey settings" id="UcNrFr" />
    ),
  },
  {
    id: 'api-keys',
    label: <FormattedMessage defaultMessage="API Keys" description="Navigation item label for API key management" id="2IPNlq" />,
    icon: Key,
    description: (
      <FormattedMessage defaultMessage="Manage your API access tokens" description="Navigation item description for API key management" id="4cGAA6" />
    ),
  },
];

const NavigationItem: React.FC<{
  item: NavigationItem;
  isActive: boolean;
  onClick: () => void;
}> = ({ item, isActive, onClick }) => {
  const IconComponent = item.icon;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-left group cursor-pointer ${
        isActive ? 'bg-primary text-primary-content' : 'text-base-content hover:bg-base-200'
      }`}
    >
      <IconComponent className="w-5 h-5" />
      <span className="font-medium">{item.label}</span>
    </button>
  );
};

const AVAILABLE_LEADERBOARDS: { id: number; label: string }[] = [
  { id: 4, label: 'HardEX' },
  { id: 2, label: 'EX' },
  { id: 3, label: 'Money' },
];

const LeaderboardsSection: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const { formatMessage } = useIntl();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const userResp = await getUser();
        if (mounted) {
          const prefs = (userResp.user as any).preferredLeaderboards || [];
          setSelected(prefs);
        }
      } catch (e: any) {
        if (mounted)
          setError(
            e.message ||
              formatMessage({
                defaultMessage: 'Failed to load preferences',
                id: 'yMAjYZ',
                description: 'Error message shown when loading preferred leaderboards fails',
              }),
          );
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const user = await updatePreferredLeaderboards(selected); // returns full user
      setSelected((user as any).preferredLeaderboards || []);
    } catch (e: any) {
      setError(
        e.message ||
          formatMessage({
            defaultMessage: 'Failed to save preferences',
            id: 'BvJ1Nn',
            description: 'Error message shown when saving preferred leaderboards fails',
          }),
      );
    } finally {
      setSaving(false);
    }
  };

  const clearAll = async () => {
    setSaving(true);
    setError(null);
    try {
      const user = await updatePreferredLeaderboards([]);
      setSelected((user as any).preferredLeaderboards || []);
    } catch (e: any) {
      setError(
        e.message ||
          formatMessage({
            defaultMessage: 'Failed to clear preferences',
            id: 'Eb0JQV',
            description: 'Error message shown when clearing preferred leaderboards fails',
          }),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="animate-pulse text-sm">
        <FormattedMessage defaultMessage="Loading leaderboards..." description="Loading message shown while leaderboards are being fetched" id="628Yaq" />
      </div>
    );
  if (error) return <div className="text-error text-sm">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="text-sm text-base-content/70">
        <FormattedMessage
          defaultMessage="Choose which leaderboard styles you would prefer to see in game. Event leaderboards will always be shown."
          description="Instructional text for selecting preferred leaderboard styles"
          id="wMsd+n"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {AVAILABLE_LEADERBOARDS.map((lb) => {
          const checked = selected.includes(lb.id);
          return (
            <label
              key={lb.id}
              className={`border rounded-lg p-3 cursor-pointer flex items-center gap-2 transition ${checked ? 'bg-primary text-primary-content border-primary' : 'bg-base-200/50 hover:bg-base-200 border-base-300/40'}`}
            >
              <input type="checkbox" className="checkbox checkbox-sm" checked={checked} onChange={() => toggle(lb.id)} />
              <span className="text-sm font-medium">{lb.label}</span>
            </label>
          );
        })}
      </div>
      <div className="flex gap-3">
        <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}>
          {saving ? (
            <FormattedMessage defaultMessage="Saving..." description="Button label shown when preferred leaderboards are being saved" id="TZbl8m" />
          ) : (
            <FormattedMessage defaultMessage="Save Preferences" description="Button label for saving preferred leaderboards" id="f70c15" />
          )}
        </button>
        <button className="btn btn-sm btn-outline" onClick={clearAll} disabled={saving || selected.length === 0}>
          <XCircle className="w-4 h-4 mr-1" />
          <FormattedMessage defaultMessage="Remove Preferences" description="Button label for removing all preferred leaderboards" id="Bs3fyg" />
        </button>
      </div>
    </div>
  );
};

const renderSectionContent = (activeSection: ProfileSection) => {
  switch (activeSection) {
    case 'profile-image':
      return <ProfileImageSection />;
    case 'alias':
      return <ProfileSectionComponent />;
    case 'password':
      return <PasswordSection />;
    case 'passkeys':
      return <PasskeySection />;
    case 'api-keys':
      return <ApiKeysSection />;
    case 'rivals':
      return <RivalsSection />;
    case 'trophies':
      return <TrophiesSection />;
    case 'leaderboards':
      return <LeaderboardsSection />;
    case 'widget':
      return <WidgetSection />;
    default:
      return <ProfileImageSection />;
  }
};

export const EditProfilePage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<ProfileSection>('profile-image');

  // Handle URL hash for deep linking to sections
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove the '#'
      const validSection = navigationItems.find((item) => item.id === hash);
      if (validSection) {
        setActiveSection(validSection.id);
      }
    };

    // Check on mount
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update URL hash when section changes
  const handleSectionChange = (sectionId: ProfileSection) => {
    setActiveSection(sectionId);
    window.history.replaceState(null, '', `#${sectionId}`);
  };

  const activeItem = navigationItems.find((item) => item.id === activeSection);

  return (
    <AppPageLayout accent="secondary">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            <FormattedMessage defaultMessage="Edit Profile" description="Page title for editing the user profile" id="PttiTj" />
          </h1>
          <p className="text-white/80">
            <FormattedMessage defaultMessage="Manage your account settings and preferences" description="Subtitle for the edit profile page" id="Jf70Ja" />
          </p>
        </div>

        <EmailVerificationAlert />

        <div className="card bg-base-100/95 backdrop-blur-lg shadow-xl border border-base-300/30 mt-6">
          <div className="card-body p-0">
            <div className="grid grid-cols-1 lg:grid-cols-4">
              {/* Navigation Sidebar */}
              <div className="lg:col-span-1 border-r border-base-300/30">
                <div className="p-6">
                  <h2 className="text-lg font-bold mb-4 text-base-content">
                    <FormattedMessage defaultMessage="Settings" description="Heading for the settings navigation sidebar" id="X1K1PE" />
                  </h2>
                  <div className="space-y-1">
                    {navigationItems.map((item) => (
                      <NavigationItem key={item.id} item={item} isActive={activeSection === item.id} onClick={() => handleSectionChange(item.id)} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Content Area */}
              <div className="lg:col-span-3">
                <div className="p-6 space-y-6">
                  {/* Section Header */}
                  <div className="flex items-center gap-3 pb-4 border-b border-base-300/30">
                    {activeItem && (
                      <>
                        <div className="p-3 rounded-xl bg-primary/10">
                          <activeItem.icon className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold text-base-content">{activeItem.label}</h2>
                          <p className="text-base-content/70">{activeItem.description}</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Section Content */}
                  <div>{renderSectionContent(activeSection)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppPageLayout>
  );
};
