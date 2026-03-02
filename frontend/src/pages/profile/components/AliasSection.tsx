import React, { useState, useEffect } from 'react';
import { User, Save, Globe, Clock } from 'lucide-react';
import { TextInput } from '../../../components/forms';
import { useAuth } from '../../../contexts/AuthContext';
import { Alert } from '../../../components/ui';
import { useProfileUpdateValidation, type ProfileValidationErrors } from '../../../schemas/profileValidation';
import { useCountries } from '../../../hooks';
import { getTimezoneOptions } from '../../../hooks/useTimezone';
import { FormattedMessage, useIntl } from 'react-intl';

const ProfileSection: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const { countries, loading: countriesLoading, error: countriesError } = useCountries();
  const [alias, setAlias] = useState(user?.alias || '');
  const [countryId, setCountryId] = useState<number | undefined>(user?.countryId || undefined);
  const [timezone, setTimezone] = useState<string>(user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');
  const [formErrors, setFormErrors] = useState<ProfileValidationErrors>({});
  const { formatMessage, formatDisplayName } = useIntl();

  const timezoneOptions = getTimezoneOptions();

  const { validateForm } = useProfileUpdateValidation();

  useEffect(() => {
    setAlias(user?.alias || '');
    setCountryId(user?.countryId || undefined);
    setTimezone(user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [user]);

  const clearFieldError = (field: keyof ProfileValidationErrors) => {
    setFormErrors({ ...formErrors, [field]: '' });
  };

  const handleSaveProfile = async () => {
    setIsUpdating(true);
    setUpdateError('');
    setUpdateSuccess('');
    setFormErrors({});

    try {
      const hasAliasChange = alias.trim() !== user?.alias;
      const hasCountryChange = countryId !== user?.countryId;
      const hasTimezoneChange = timezone !== user?.timezone;

      if (!hasAliasChange && !hasCountryChange && !hasTimezoneChange) {
        setUpdateSuccess('No changes to save');
        return;
      }

      const updateData: { alias?: string; countryId?: number; timezone?: string } = {};

      if (hasAliasChange) {
        updateData.alias = alias.trim();
      }

      if (hasCountryChange) {
        updateData.countryId = countryId;
      }

      if (hasTimezoneChange) {
        updateData.timezone = timezone;
      }

      const validation = validateForm(updateData);
      if (!validation.isValid) {
        setFormErrors(validation.errors);
        return;
      }

      await updateProfile(updateData);
      setUpdateSuccess(
        formatMessage({ defaultMessage: 'Profile updated successfully!', id: 'jFD+sg', description: 'Success message shown when profile is updated' }),
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

      {countriesError && (
        <Alert variant="error" className="mb-4">
          <FormattedMessage
            defaultMessage="Failed to load countries: {error}"
            description="Error message shown when countries fail to load"
            id="hQi+5B"
            values={{ error: countriesError }}
          />
        </Alert>
      )}

      <div className="space-y-6">
        <TextInput
          label={formatMessage({ defaultMessage: 'Alias', id: 'fjW29i', description: 'Label for the alias input field' })}
          value={alias}
          onChange={(value) => {
            setAlias(value);
            clearFieldError('alias');
          }}
          icon={User}
          placeholder={formatMessage({ defaultMessage: 'Enter your alias', id: '6t1Xf+', description: 'Placeholder for the alias input field' })}
          error={formErrors.alias}
        />

        <div className="form-control">
          <label className="label">
            <span className="label-text flex items-center gap-2">
              <Globe className="w-4 h-4" />
              <FormattedMessage defaultMessage="Country" description="Label for the country select field" id="YM+ci9" />
            </span>
          </label>
          <select
            className={`select select-bordered w-full ${formErrors.countryId ? 'select-error' : ''}`}
            value={countryId || ''}
            onChange={(e) => {
              const value = e.target.value;
              setCountryId(value ? parseInt(value, 10) : undefined);
              clearFieldError('countryId');
            }}
            disabled={countriesLoading}
          >
            <option value="">
              <FormattedMessage defaultMessage="Select a country" description="Placeholder option for the country select field" id="x8tDS+" />
            </option>
            {countries.map((country) => (
              <option key={country.id} value={country.id}>
                {formatDisplayName(country.code, { type: 'region' })}
              </option>
            ))}
          </select>
          {formErrors.countryId && (
            <label className="label">
              <span className="label-text-alt text-error">{formErrors.countryId}</span>
            </label>
          )}
          {countriesLoading && (
            <label className="label">
              <span className="label-text-alt">
                <FormattedMessage defaultMessage="Loading countries..." description="Loading message shown while countries are being fetched" id="DVNpb1" />
              </span>
            </label>
          )}
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <FormattedMessage defaultMessage="Timezone" description="Label for the timezone select field" id="zEaIY3" />
            </span>
          </label>
          <select className="select select-bordered w-full" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {timezoneOptions.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
          <label className="label">
            <span className="label-text-alt text-base-content/60">
              <FormattedMessage
                defaultMessage="Used on activity heatmaps and generated share images to represent your local time."
                description="Helper text for timezone selection"
                id="TjZyeR"
              />
            </span>
          </label>
        </div>

        <div className="flex justify-end">
          <button onClick={handleSaveProfile} className="btn btn-primary" disabled={isUpdating || countriesLoading}>
            {isUpdating ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                <FormattedMessage defaultMessage="Saving..." description="Button label shown when profile is being saved" id="v0nWNk" />
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <FormattedMessage defaultMessage="Save Profile" description="Button label for saving the profile" id="qYn7lJ" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileSection;
