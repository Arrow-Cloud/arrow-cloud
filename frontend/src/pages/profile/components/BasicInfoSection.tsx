import React, { useState, useEffect } from 'react';
import { User, Save } from 'lucide-react';
import { TextInput, PasswordInput } from '../../../components/forms';
import { useAuth } from '../../../contexts/AuthContext';
import { Alert } from '../../../components/ui';
import { useProfileUpdateValidation, type ProfileValidationErrors } from '../../../schemas/profileValidation';
import { FormattedMessage, useIntl } from 'react-intl';

const BasicInfoSection: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const [alias, setAlias] = useState(user?.alias || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');
  const [formErrors, setFormErrors] = useState<ProfileValidationErrors>({});
  const { formatMessage } = useIntl();

  const { validateForm } = useProfileUpdateValidation();

  useEffect(() => {
    setAlias(user?.alias || '');
  }, [user]);

  const clearFieldError = (field: keyof ProfileValidationErrors) => {
    setFormErrors({ ...formErrors, [field]: '' });
  };

  const handleSaveBasicInfo = async () => {
    setIsUpdating(true);
    setUpdateError('');
    setUpdateSuccess('');
    setFormErrors({});

    try {
      const updateData: any = {};
      const hasAliasChange = alias.trim() !== user?.alias;
      const hasPasswordChange = newPassword.length > 0;

      if (hasAliasChange) {
        updateData.alias = alias.trim();
      }

      if (hasPasswordChange) {
        updateData.currentPassword = currentPassword;
        updateData.newPassword = newPassword;
        updateData.confirmPassword = confirmPassword;
      }

      if (!hasAliasChange && !hasPasswordChange) {
        setUpdateSuccess(
          formatMessage({
            defaultMessage: 'No changes to save',
            id: '/GvRCG',
            description: 'Message shown when there are no changes to save in profile update',
          }),
        );
        return;
      }

      const validation = validateForm(updateData);
      if (!validation.isValid) {
        setFormErrors(validation.errors);
        return;
      }

      // Remove confirmPassword from update data (not needed for API)
      delete updateData.confirmPassword;

      await updateProfile(updateData);

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setUpdateSuccess(
        formatMessage({ defaultMessage: 'Profile updated successfully!', id: 'f0wAIn', description: 'Message shown when profile update is successful' }),
      );
    } catch (error) {
      setUpdateError(
        error instanceof Error
          ? error.message
          : formatMessage({ defaultMessage: 'Failed to update profile', id: 'P+Gj+q', description: 'Error message shown when profile update fails' }),
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextInput
          label={formatMessage({ defaultMessage: 'Alias', id: '13SZgT', description: 'Label for alias input field' })}
          value={alias}
          onChange={(value) => {
            setAlias(value);
            clearFieldError('alias');
          }}
          icon={User}
          placeholder={formatMessage({ defaultMessage: 'Enter your alias', id: 've/RaJ', description: 'Placeholder for alias input field' })}
          error={formErrors.alias}
        />

        <div className="md:col-span-2">
          <h3 className="text-lg font-semibold mb-3">
            <FormattedMessage defaultMessage="Change Password" description="Section header for changing password" id="LPsP/k" />
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PasswordInput
              label={formatMessage({ defaultMessage: 'Current Password', id: 'ioJOJl', description: 'Label for current password input field' })}
              value={currentPassword}
              onChange={(value) => {
                setCurrentPassword(value);
                clearFieldError('currentPassword');
              }}
              placeholder={formatMessage({
                defaultMessage: 'Enter current password',
                id: '9PwMKb',
                description: 'Placeholder for current password input field',
              })}
              error={formErrors.currentPassword}
            />
            <PasswordInput
              label={formatMessage({ defaultMessage: 'New Password', id: 'qORdj/', description: 'Label for new password input field' })}
              value={newPassword}
              onChange={(value) => {
                setNewPassword(value);
                clearFieldError('newPassword');
              }}
              placeholder={formatMessage({ defaultMessage: 'Enter new password', id: 'uLqMrt', description: 'Placeholder for new password input field' })}
              error={formErrors.newPassword}
            />
            <PasswordInput
              label={formatMessage({ defaultMessage: 'Confirm Password', id: '3rGlbG', description: 'Label for confirm password input field' })}
              value={confirmPassword}
              onChange={(value) => {
                setConfirmPassword(value);
                clearFieldError('confirmPassword');
              }}
              placeholder={formatMessage({
                defaultMessage: 'Confirm new password',
                id: 'WJFQ54',
                description: 'Placeholder for confirm new password input field',
              })}
              error={formErrors.confirmPassword}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-6">
        <button onClick={handleSaveBasicInfo} className="btn btn-primary" disabled={isUpdating}>
          {isUpdating ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              <FormattedMessage defaultMessage="Saving..." description="Button label shown when saving profile changes" id="lmpJF6" />
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <FormattedMessage defaultMessage="Save Changes" description="Button label for saving profile changes" id="/Cz20N" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default BasicInfoSection;
