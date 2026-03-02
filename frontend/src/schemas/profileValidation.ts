import { z } from 'zod';

export const profileUpdateSchema = z
  .object({
    alias: z
      .string()
      .min(3, 'Alias must be at least 3 characters long')
      .max(50, 'Alias must be no more than 50 characters long')
      .refine((val) => !/\s/.test(val), 'Alias must not contain spaces')
      .optional(),
    countryId: z.number().int().positive('Please select a valid country').optional(),
    currentPassword: z.string().min(1, 'Current password is required to change password').optional(),
    newPassword: z.string().min(6, 'New password must be at least 6 characters long').optional(),
    confirmPassword: z.string().optional(),
  })
  .refine(
    (data) => {
      // If newPassword is provided, confirmPassword must match
      if (data.newPassword && data.newPassword !== data.confirmPassword) {
        return false;
      }
      return true;
    },
    {
      message: 'New passwords do not match',
      path: ['confirmPassword'],
    },
  )
  .refine(
    (data) => {
      // If newPassword is provided, currentPassword is required
      if (data.newPassword && !data.currentPassword) {
        return false;
      }
      return true;
    },
    {
      message: 'Current password is required to change password',
      path: ['currentPassword'],
    },
  );

export const aliasUpdateSchema = z.object({
  alias: z
    .string()
    .min(3, 'Alias must be at least 3 characters long')
    .max(50, 'Alias must be no more than 50 characters long')
    .refine((val) => !/\s/.test(val), 'Alias must not contain spaces'),
});

export const passwordUpdateSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters long'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New passwords do not match',
    path: ['confirmPassword'],
  });

export type ProfileUpdateFormData = z.infer<typeof profileUpdateSchema>;
export type AliasUpdateFormData = z.infer<typeof aliasUpdateSchema>;
export type PasswordUpdateFormData = z.infer<typeof passwordUpdateSchema>;

export interface ProfileValidationErrors {
  alias?: string;
  countryId?: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ProfileValidationErrors;
}

export const useProfileUpdateValidation = () => {
  const validateForm = (data: {
    alias?: string;
    countryId?: number;
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }): ValidationResult => {
    const result = profileUpdateSchema.safeParse(data);

    if (result.success) {
      return { isValid: true, errors: {} };
    }

    // Transform Zod errors to our ValidationErrors format
    const errors: ProfileValidationErrors = {};
    result.error.issues.forEach((issue) => {
      const field = issue.path[0] as keyof ProfileValidationErrors;
      if (field && !errors[field]) {
        errors[field] = issue.message;
      }
    });

    return { isValid: false, errors };
  };

  return {
    validateForm,
  };
};
