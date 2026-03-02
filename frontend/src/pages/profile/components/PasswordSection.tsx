import React, { useState } from 'react';
import { Lock, Save } from 'lucide-react';
import { PasswordInput } from '../../../components/forms';
import { useAuth } from '../../../contexts/AuthContext';
import { Alert } from '../../../components/ui';
import { useProfileUpdateValidation, type ProfileValidationErrors } from '../../../schemas/profileValidation';
import { FormattedMessage, useIntl } from 'react-intl';

const PasswordSection: React.FC = () => {
  const { updateProfile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');
  const [formErrors, setFormErrors] = useState<ProfileValidationErrors>({});
  const { formatMessage } = useIntl();

  const { validateForm } = useProfileUpdateValidation();

  const clearFieldError = (field: keyof ProfileValidationErrors) => {
    setFormErrors({ ...formErrors, [field]: '' });
  };

  const handleSavePassword = async () => {
    setIsUpdating(true);
    setUpdateError('');
    setUpdateSuccess('');
    setFormErrors({});

    try {
      const hasPasswordChange = newPassword.length > 0;

      if (!hasPasswordChange) {
        setUpdateSuccess('No changes to save');
        return;
      }

      const updateData = {
        currentPassword,
        newPassword,
        confirmPassword,
      };

      const validation = validateForm(updateData);
      if (!validation.isValid) {
        setFormErrors(validation.errors);
        return;
      }

      // Remove confirmPassword from update data (not needed for API)
      /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
      const { confirmPassword: _, ...apiData } = updateData;

      await updateProfile(apiData);

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setUpdateSuccess(
        formatMessage({ defaultMessage: 'Password updated successfully!', description: 'Success message when password is updated', id: 'A8mipM' }),
      );
    } catch (error) {
      setUpdateError(
        error instanceof Error
          ? error.message
          : formatMessage({ defaultMessage: 'Failed to update password', description: 'Error message when password update fails', id: 'DdfLk1' }),
      );
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div>
      {updateError && (
        <Alert variant="error" className="mb-4">
          {updateError}
        </Alert>
      )}

      {updateSuccess && (
        <Alert variant="success" className="mb-4">
          {updateSuccess}
        </Alert>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PasswordInput
            label={formatMessage({ defaultMessage: 'Current Password', description: 'Label for current password input', id: 'E2Q8Ev' })}
            value={currentPassword}
            onChange={(value) => {
              setCurrentPassword(value);
              clearFieldError('currentPassword');
            }}
            icon={Lock}
            placeholder={formatMessage({ defaultMessage: 'Enter current password', description: 'Placeholder for current password input', id: '6ey983' })}
            error={formErrors.currentPassword}
          />
          <PasswordInput
            label={formatMessage({ defaultMessage: 'New Password', description: 'Label for new password input', id: 'BgdjiI' })}
            value={newPassword}
            onChange={(value) => {
              setNewPassword(value);
              clearFieldError('newPassword');
            }}
            placeholder={formatMessage({ defaultMessage: 'Enter new password', description: 'Placeholder for new password input', id: '0CcN1Y' })}
            error={formErrors.newPassword}
          />
          <PasswordInput
            label={formatMessage({ defaultMessage: 'Confirm Password', description: 'Label for confirm password input', id: '4cud4C' })}
            value={confirmPassword}
            onChange={(value) => {
              setConfirmPassword(value);
              clearFieldError('confirmPassword');
            }}
            placeholder={formatMessage({ defaultMessage: 'Confirm new password', description: 'Placeholder for confirm new password input', id: 'SsHyj8' })}
            error={formErrors.confirmPassword}
          />
        </div>

        <div className="flex justify-end">
          <button onClick={handleSavePassword} className="btn btn-primary" disabled={isUpdating}>
            {isUpdating ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                <FormattedMessage defaultMessage="Saving..." description="Loading message when saving password" id="Nx1LTA" />
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <FormattedMessage defaultMessage="Change Password" description="Button label for changing password" id="JKKkzS" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PasswordSection;
