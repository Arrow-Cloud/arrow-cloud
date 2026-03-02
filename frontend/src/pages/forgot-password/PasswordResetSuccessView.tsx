import React from 'react';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import { useIntl } from 'react-intl';

interface PasswordResetSuccessViewProps {
  timeLeft: number;
  formatTime: () => string;
  onBackToLogin: () => void;
}

interface HeaderSectionProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  iconBgColor?: string;
  iconSize?: string;
}

const HeaderSection: React.FC<HeaderSectionProps> = ({ icon: Icon, title, iconBgColor = 'bg-primary/10', iconSize = 'w-8 h-8' }) => (
  <div className="text-center">
    <div className="flex justify-center mb-6">
      <div className={`p-4 ${iconBgColor} rounded-2xl`}>
        <Icon className={`${iconSize} ${iconBgColor.includes('success') ? 'text-success' : 'text-primary'}`} />
      </div>
    </div>
    <h1 className="text-3xl font-bold text-base-content mb-4">{title}</h1>
  </div>
);

const PasswordResetSuccessView: React.FC<PasswordResetSuccessViewProps> = ({ timeLeft, formatTime, onBackToLogin }) => {
  const { formatMessage } = useIntl();
  return (
    <>
      <HeaderSection
        icon={CheckCircle}
        title={formatMessage({
          defaultMessage: 'Check Your Email',
          id: 'w2zB1o',
          description: 'header displayed on the forgot password page after a successful submission',
        })}
        iconBgColor="bg-success/10"
        iconSize="w-12 h-12"
      />

      <div className="space-y-4 text-base-content/70 text-center mb-8">
        <p>
          {timeLeft > 0
            ? formatMessage(
                {
                  defaultMessage: 'Check your inbox to continue. The link will expire in {mmssTime}',
                  id: 'ZCWT6R',
                  description:
                    'message displayed after requesting a password reset. the mmssTime will be a number of minutes and seconds formatted like "2:30" which continually counts down every second',
                },
                { mmssTime: <span className="font-mono font-semibold text-primary">{formatTime()}</span> },
              )
            : formatMessage({
                defaultMessage: 'The reset link has expired. Please request a new one.',
                id: 'WFfotC',
                description: 'displayed after a password reset link has been requested, but the page has been left open long enough that the link expired',
              })}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button onClick={onBackToLogin} className="btn btn-primary gap-2 w-full">
          <ArrowLeft className="w-4 h-4" />
          {formatMessage({
            defaultMessage: 'Back to Sign In',
            id: 'wgc2MU',
            description: 'label for a button on the password reset page, after a successful submission',
          })}
        </button>
      </div>
    </>
  );
};

export default PasswordResetSuccessView;
