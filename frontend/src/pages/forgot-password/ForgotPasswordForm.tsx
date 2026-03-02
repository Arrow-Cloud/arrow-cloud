import React from 'react';
import { Mail } from 'lucide-react';
import { TextInput } from '../../components/forms';
import { useIntl } from 'react-intl';

interface ForgotPasswordFormProps {
  email: string;
  setEmail: (email: string) => void;
  isLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({ email, setEmail, isLoading, onSubmit }) => {
  const { formatMessage } = useIntl();
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <TextInput
        label=""
        type="email"
        placeholder={formatMessage({
          defaultMessage: 'Email address',
          id: 'rYdDW0',
          description: 'placeholder value for the text input on the forgot password form',
        })}
        value={email}
        onChange={setEmail}
        icon={Mail}
        required
      />

      <button
        type="submit"
        disabled={isLoading}
        className="btn btn-primary w-full text-lg font-semibold shadow-lg hover:shadow-primary/50 transition-all duration-300 transform hover:scale-[1.02]"
      >
        {isLoading
          ? formatMessage(
              {
                defaultMessage: '{loadingSpinner} Sending Reset Link...',
                id: '/UnDQ8',
                description: 'message displayed on the submit button of the forgot password form while submission is in progress',
              },
              { loadingSpinner: <span className="loading loading-spinner loading-sm" /> },
            )
          : formatMessage(
              { defaultMessage: 'Send Reset Link {mailIcon}', id: 'by4q9+', description: 'label for the submit button on the forgot password form' },
              { mailIcon: <Mail className="w-5 h-5 ml-2" /> },
            )}
      </button>
    </form>
  );
};

export default ForgotPasswordForm;
