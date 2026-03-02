import React, { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { getProfileImageUploadUrl, uploadProfileImageToS3, updateProfileImage, deleteProfileImage } from '../../../services/api';
import { Alert } from '../../../components/ui';
import { FormattedMessage, useIntl } from 'react-intl';

const ProfileImageSection: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { formatMessage } = useIntl();

  // Helper function to crop and resize image to 400x400
  const processImage = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      img.onload = () => {
        const { width, height } = img;

        // Calculate the largest square that fits in the center
        const size = Math.min(width, height);
        const offsetX = (width - size) / 2;
        const offsetY = (height - size) / 2;

        // Set canvas size to 400x400
        canvas.width = 400;
        canvas.height = 400;

        // Draw the cropped and resized image
        ctx.drawImage(
          img,
          offsetX,
          offsetY,
          size,
          size, // Source crop area
          0,
          0,
          400,
          400, // Destination area
        );

        // Convert canvas to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(
                new Error(formatMessage({ defaultMessage: 'Failed to process image', description: 'Error message when image processing fails', id: 'ID1Yfr' })),
              );
              return;
            }

            // Create a new file with the processed image
            const processedFile = new File([blob], file.name, {
              type: 'image/jpeg', // Always use JPEG for consistency
              lastModified: Date.now(),
            });

            resolve(processedFile);
          },
          'image/jpeg',
          0.9, // High quality JPEG
        );
      };

      img.onerror = () => {
        reject(new Error(formatMessage({ defaultMessage: 'Failed to load image', description: 'Error message when image loading fails', id: 'm4U7BZ' })));
      };

      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError(
        formatMessage({
          defaultMessage: 'Please select a valid image file (JPEG, PNG, GIF, or WebP)',
          description: 'Error message when an invalid image file type is selected',
          id: 'UoUeqp',
        }),
      );
      return;
    }

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setError(
        formatMessage({ defaultMessage: 'Image file must be smaller than 5MB', description: 'Error message when an image file is too large', id: 'CnmIBg' }),
      );
      return;
    }

    setError('');
    setSuccess('');
    setProcessing(true);

    try {
      // Process the image (crop to square and resize to 400x400)
      const processedFile = await processImage(file);
      setSelectedFile(processedFile);

      // Create preview URL from processed image
      const objectUrl = URL.createObjectURL(processedFile);
      setPreviewUrl(objectUrl);
    } catch (err) {
      console.error('Error processing image:', err);
      setError(
        err instanceof Error
          ? err.message
          : formatMessage({ defaultMessage: 'Failed to process image', description: 'Error message when image processing fails', id: 'ID1Yfr' }),
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(0);
    setError('');
    setSuccess('');

    try {
      // Step 1: Get presigned URL
      const { uploadUrl, profileImageUrl } = await getProfileImageUploadUrl({
        filename: selectedFile.name,
        contentType: selectedFile.type,
      });

      // Step 2: Upload to S3
      await uploadProfileImageToS3(uploadUrl, selectedFile, (progress: number) => {
        setUploadProgress(progress);
      });

      // Step 3: Update user profile with new image URL
      const response = await updateProfileImage({ profileImageUrl });

      // Update auth context with new user data
      updateUser(response.user);

      setSuccess(
        formatMessage({ defaultMessage: 'Profile image updated successfully!', description: 'Success message when profile image is updated', id: '4lKz1r' }),
      );
      setSelectedFile(null);
      setPreviewUrl(null);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Error uploading profile image:', err);
      setError(
        err instanceof Error
          ? err.message
          : formatMessage({ defaultMessage: 'Failed to upload profile image', description: 'Error message when profile image upload fails', id: 'VWSTaJ' }),
      );
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        formatMessage({
          defaultMessage: 'Are you sure you want to remove your profile image?',
          description: 'Confirmation message when deleting profile image',
          id: 'HmniJw',
        }),
      )
    )
      return;

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const response = await deleteProfileImage();
      updateUser(response.user);
      setSuccess(
        formatMessage({ defaultMessage: 'Profile image removed successfully!', description: 'Success message when profile image is removed', id: 'DdEvZe' }),
      );
    } catch (err) {
      console.error('Error deleting profile image:', err);
      setError(
        err instanceof Error
          ? err.message
          : formatMessage({ defaultMessage: 'Failed to remove profile image', description: 'Error message when profile image removal fails', id: 'fDZSZm' }),
      );
    } finally {
      setUploading(false);
    }
  };

  const cancelSelection = () => {
    if (processing) return; // Don't allow canceling during processing

    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setError('');
  };

  const currentImageUrl = user?.profileImageUrl;
  const displayImageUrl = previewUrl || currentImageUrl;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-base-content/70 mb-4">
          <FormattedMessage
            defaultMessage="Upload a profile image that will be displayed on your public profile and in leaderboards."
            description="Description for the profile image upload section on the profile page"
            id="TzNn9X"
          />
        </p>
      </div>

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mb-4">
          {success}
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row gap-6 items-start">
        {/* Image Preview */}
        <div className="flex-shrink-0">
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-base-200 overflow-hidden flex items-center justify-center">
              {displayImageUrl ? (
                <img
                  src={displayImageUrl}
                  alt={formatMessage({ defaultMessage: 'Profile image', id: 'MO8tb+', description: 'Alt text for profile image' })}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Camera className="w-12 h-12 text-base-content/40" />
              )}
            </div>
            {previewUrl && (
              <button
                onClick={cancelSelection}
                className="absolute -top-2 -right-2 w-6 h-6 bg-error text-error-content rounded-full flex items-center justify-center hover:bg-error/80 transition-colors"
                disabled={uploading}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex-1 space-y-4">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />

          {!selectedFile ? (
            <div className="space-y-3">
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading || processing} className="btn btn-primary mb-0">
                {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {processing ? (
                  <FormattedMessage defaultMessage="Processing..." description="Processing indicator when choosing an image file" id="G8u4NE" />
                ) : (
                  <FormattedMessage defaultMessage="Choose Image" description="Button label to choose an image file" id="NcqsCp" />
                )}
              </button>

              {currentImageUrl && (
                <button onClick={handleDelete} disabled={uploading || processing} className="btn btn-outline btn-error mb-0 ml-4">
                  {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <X className="w-4 h-4 mr-2" />}
                  <FormattedMessage defaultMessage="Remove Image" description="Button label to remove the profile image" id="LO3Rbr" />
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-base-content/70">
                <FormattedMessage
                  defaultMessage="Selected: {fileName} ({fileSize,number,::unit/kilobyte}) - 400x400 ready for upload"
                  description="Information about the selected image file ready for upload"
                  id="O6jEye"
                  values={{ fileName: selectedFile.name, fileSize: Math.round(selectedFile.size / 1024) }}
                />
              </div>

              {uploading && (
                <div className="space-y-2">
                  <div className="text-sm text-base-content/70">
                    <FormattedMessage
                      defaultMessage="Uploading... {progress,number,::percent}"
                      description="Uploading progress indicator"
                      id="GNP6fs"
                      values={{ progress: uploadProgress / 100 }}
                    />
                  </div>
                  <progress className="progress progress-primary w-full" value={uploadProgress} max="100" />
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={handleUpload} disabled={uploading || processing} className="btn btn-primary">
                  {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  <FormattedMessage defaultMessage="Upload Image" description="Button label to upload the selected image file" id="1t8tZ+" />
                </button>

                <button onClick={cancelSelection} disabled={uploading || processing} className="btn btn-outline">
                  <FormattedMessage defaultMessage="Cancel" description="Button label to cancel the image selection" id="6A/18S" />
                </button>
              </div>
            </div>
          )}

          <ul className="text-xs text-base-content/50">
            <li>
              <FormattedMessage defaultMessage="Supported formats: JPEG, PNG, GIF, WebP" description="Information about supported image formats" id="mmiM0/" />
            </li>
            <li>
              <FormattedMessage defaultMessage="Maximum file size: 5MB" description="Information about maximum file size for image upload" id="05hmF9" />
            </li>
            <li>
              <FormattedMessage
                defaultMessage="Images will be automatically cropped to square and resized to 400x400"
                description="Information about image cropping and resizing"
                id="C5CpiW"
              />
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ProfileImageSection;
