/* eslint-disable formatjs/no-literal-string-in-jsx */

import React, { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { FILE_CONFIG, getFileExtension, processFiles } from './utils/fileProcessing';
import { createZipFile, downloadZip } from './utils/zipUtils';
import { getPackUploadUrl, uploadPackToS3, PackDuplicateSummary, PackDuplicateDecision } from '../../services/api';
import Alert from '../../components/ui/Alert';
import ProgressBar from '../../components/ui/ProgressBar';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';

// Extend the input element to include webkitdirectory
declare module 'react' {
  interface InputHTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    webkitdirectory?: string;
  }
}

// CSS Classes, looked like a mess down there and copilot does really good with tailwind,
// need to figure out how to create better reusable things with tailwind later
const CLASSES = {
  background: 'min-h-screen bg-gradient-to-br from-primary/80 via-secondary/60 to-accent/70',
  backgroundPattern: 'absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.1)_1px,transparent_0)] [background-size:20px_20px] opacity-20',
  backgroundOverlay: 'absolute inset-0 bg-gradient-to-t from-base-200/30 via-transparent to-primary/20',
  card: 'card bg-base-100/95 backdrop-blur-lg shadow-2xl border border-base-300/30 ring-1 ring-white/10 mt-16',
  label: 'block text-sm font-medium text-base-content mb-2',
  input: 'input input-bordered w-full',
  inputError: 'input input-bordered w-full input-error',
  errorText: 'text-error text-sm mt-1',
  helpText: 'text-xs text-base-content/50 mt-1',
};

const UploadIcon: React.FC = () => <Upload className="mx-auto h-12 w-12 text-base-content/60" />;

interface FolderSelectorProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  selectedFolder: string | null;
  processing: boolean;
  validationError?: string;
  onFolderSelect: () => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const FolderSelector: React.FC<FolderSelectorProps> = ({ fileInputRef, selectedFolder, processing, validationError, onFolderSelect, onFileChange }) => {
  return (
    <div>
      <label htmlFor="pack-folder" className={CLASSES.label}>
        Select Pack Folder
      </label>

      <input ref={fileInputRef} type="file" className="hidden" webkitdirectory="" multiple onChange={onFileChange} disabled={processing} />

      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors ${
          processing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        } ${validationError ? 'border-error bg-error/5' : 'border-base-300'}`}
        onClick={processing ? undefined : onFolderSelect}
      >
        <div className="space-y-2">
          <UploadIcon />
          <div className="text-sm text-base-content/70">
            {processing ? (
              <>
                <p className="font-medium text-warning">Processing files...</p>
                <p className={CLASSES.helpText}>Please wait while we process your pack</p>
              </>
            ) : selectedFolder ? (
              <>
                <p className="font-medium text-success">Folder selected: {selectedFolder}</p>
                <p className={CLASSES.helpText}>Click to select a different folder</p>
              </>
            ) : (
              <>
                <p>Click to select a pack folder from your computer</p>
                <p className={CLASSES.helpText}>Folder should contain chart subfolders with .sm/.ssc files</p>
              </>
            )}
          </div>
        </div>
      </div>
      {validationError && <p className={CLASSES.errorText}>{validationError}</p>}
    </div>
  );
};

interface PackNameInputProps {
  packName: string;
  processing: boolean;
  validationError?: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const PackNameInput: React.FC<PackNameInputProps> = ({ packName, processing, validationError, onChange }) => {
  return (
    <div>
      <label htmlFor="pack-name" className={CLASSES.label}>
        Pack Name
      </label>
      <input
        id="pack-name"
        type="text"
        value={packName}
        onChange={onChange}
        disabled={processing}
        className={validationError ? CLASSES.inputError : CLASSES.input}
        placeholder="Enter pack name..."
      />
      {validationError ? <p className={CLASSES.errorText}>{validationError}</p> : <p className={CLASSES.helpText}>You can edit the pack name if needed</p>}
    </div>
  );
};

interface ProcessingSummaryProps {
  packName: string;
  validCharts: number;
}

const ProcessingSummary: React.FC<ProcessingSummaryProps> = ({ packName, validCharts }) => {
  return (
    <Alert variant="success">
      <div>
        <h3 className="font-bold">Pack "{packName}" ready for upload!</h3>
        <div className="text-xs">{validCharts} files processed • Click "Upload Pack" to send to server</div>
      </div>
    </Alert>
  );
};

export const PackUploaderPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canUpload = hasPermission('packs.upload');

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [packName, setPackName] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processedData, setProcessedData] = useState<any>(null);
  const [summary, setSummary] = useState<{
    totalCharts: number;
    validCharts: number;
  } | null>(null);
  const [error, setError] = useState<string>('');
  const [finalStatus, setFinalStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [validationErrors, setValidationErrors] = useState<{
    packName?: string;
    folder?: string;
  }>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [duplicateSummary, setDuplicateSummary] = useState<PackDuplicateSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const performUpload = async (duplicateDecision?: PackDuplicateDecision) => {
    if (!processedData) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const preflight = await getPackUploadUrl(`${processedData.packName}.zip`, {
        packName: processedData.packName,
        duplicateDecision,
      });

      if (preflight.cancelled) {
        setFinalStatus({ type: 'error', message: 'Upload cancelled.' });
        return;
      }

      if (!preflight.uploadUrl || !preflight.uploadKey) {
        throw new Error('Upload URL generation failed.');
      }

      setDuplicateSummary(null);

      await uploadPackToS3(preflight.uploadUrl, processedData.zipBlob, (progress) => {
        setUploadProgress(progress);
      });

      setFinalStatus({
        type: 'success',
        message: `Pack "${processedData.packName}" uploaded successfully! Pack will be processed in the background and data will be available shortly.`,
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409 && error.response.data?.requiresConfirmation) {
        setDuplicateSummary(error.response.data.duplicateSummary || null);
        setFinalStatus({
          type: 'error',
          message: 'Duplicate pack detected. Confirm upload to continue, or deny to cancel.',
        });
        return;
      }

      console.error('Error uploading pack:', error);
      setFinalStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to upload pack. Please try again.',
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFolderSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    // Clear any previous messages and state when selecting a new pack
    setError('');
    setFinalStatus(null);
    setValidationErrors({});
    setProcessedData(null);
    setSummary(null);

    if (files && files.length > 0) {
      console.log(files);
      // Get the folder name from the first file's path
      const firstFile = files[0];
      const pathParts = firstFile.webkitRelativePath.split('/');
      const folderName = pathParts[0];
      setSelectedFolder(folderName);
      setPackName(folderName); // Set initial pack name to folder name
      setSelectedFiles(files);
    }
  };

  const handlePackNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setPackName(value);

    // Clear pack name validation error when user starts typing
    if (validationErrors.packName && value.trim()) {
      clearValidationError('packName');
    }
  };

  const clearValidationError = (field: keyof typeof validationErrors) => {
    setValidationErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const resetForm = () => {
    setProcessedData(null);
    setSelectedFolder(null);
    setPackName('');
    setSummary(null);
    setSelectedFiles(null);
    setError('');
    setFinalStatus(null);
    setValidationErrors({});
    setUploading(false);
    setUploadProgress(0);
    setDuplicateSummary(null);
  };

  const handleDownload = () => {
    if (processedData) {
      downloadZip(processedData.zipBlob, `${processedData.packName}.zip`);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Clear previous messages
    setError('');
    setValidationErrors({});
    setFinalStatus(null);

    // If we already have processed data, this is an upload action
    if (processedData) {
      await performUpload();
      return;
    }

    // Validation
    const validatePackForm = (selectedFiles: FileList | null, packName: string) => {
      const errors: { packName?: string; folder?: string } = {};

      if (!selectedFiles) {
        errors.folder = 'Please select a pack folder first';
      }

      if (!packName.trim()) {
        errors.packName = 'Pack name is required';
      }

      return errors;
    };

    const errors = validatePackForm(selectedFiles, packName);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setProcessing(true);

    try {
      // Process files to remove audio/video
      const filteredFiles = processFiles(selectedFiles!);

      if (filteredFiles.length === 0) {
        setError('No valid chart files found in the selected folder. Make sure your pack contains .sm or .ssc files.');
        return;
      }

      // Create zip file from filtered files
      console.log('Creating zip file...');
      const zipBlob = await createZipFile(filteredFiles);

      // Store processed data
      setProcessedData({
        zipBlob,
        files: filteredFiles,
        packName: packName.trim(),
      });

      // Update summary
      setSummary({
        totalCharts: filteredFiles.filter((f) => FILE_CONFIG.CHART_EXTENSIONS.includes(getFileExtension(f.name))).length,
        validCharts: filteredFiles.length,
      });

      // Processing complete - ready for upload
    } catch (error) {
      console.error('Error processing files:', error);
      setError('Error processing files. Please try again or check that your files are valid.');
    } finally {
      setProcessing(false);
    }
  };

  if (!canUpload) {
    return (
      <div className={CLASSES.background}>
        <div className={CLASSES.backgroundPattern}></div>
        <div className={CLASSES.backgroundOverlay}></div>

        <div className="relative min-h-screen p-4 pt-24">
          <div className="max-w-2xl mx-auto">
            <div className={CLASSES.card}>
              <div className="card-body p-8">
                <Alert variant="error">
                  <div>
                    <h3 className="font-bold">You don't have access to the Pack Uploader</h3>
                    <div className="text-xs">If you think this is a mistake, contact an administrator.</div>
                  </div>
                </Alert>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={CLASSES.background}>
      <div className={CLASSES.backgroundPattern}></div>
      <div className={CLASSES.backgroundOverlay}></div>

      <div className="relative min-h-screen p-4 pt-24">
        <div className="max-w-2xl mx-auto">
          <div className={CLASSES.card}>
            <div className="card-body p-8">
              {/* Error Alert */}
              {error && (
                <Alert variant="error" className="mb-6">
                  {error}
                </Alert>
              )}

              {/* Final Status Alert - Reserved for upload results */}
              {finalStatus && (
                <Alert variant={finalStatus.type} className="mb-6">
                  {finalStatus.message}
                </Alert>
              )}

              {duplicateSummary && (
                <Alert variant="warning" className="mb-6">
                  <div className="space-y-3">
                    <div className="font-semibold">Potential duplicate pack detected</div>
                    <div className="text-sm">
                      {duplicateSummary.existingPack ? `Existing pack match: ${duplicateSummary.existingPack.name}.` : 'A duplicate pack may already exist.'}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-sm btn-primary" disabled={uploading} onClick={() => void performUpload('confirm')}>
                        Confirm Upload
                      </button>
                      <button type="button" className="btn btn-sm btn-outline" disabled={uploading} onClick={() => void performUpload('deny')}>
                        Deny
                      </button>
                    </div>
                  </div>
                </Alert>
              )}

              <form className="space-y-6" onSubmit={handleSubmit}>
                <FolderSelector
                  fileInputRef={fileInputRef}
                  selectedFolder={selectedFolder}
                  processing={processing}
                  validationError={validationErrors.folder}
                  onFolderSelect={handleFolderSelect}
                  onFileChange={handleFileChange}
                />

                {/* Pack Name Input - Only show when folder is selected */}
                {selectedFolder && (
                  <PackNameInput packName={packName} processing={processing} validationError={validationErrors.packName} onChange={handlePackNameChange} />
                )}

                {/* Processing Summary - Only show when pack is processed */}
                {processedData && summary && <ProcessingSummary packName={processedData.packName} validCharts={summary.validCharts} />}

                {/* Upload Progress - Only show when uploading */}
                {uploading && (
                  <div className="space-y-3">
                    <ProgressBar progress={uploadProgress} size="md" />
                    <div className="text-center text-sm text-base-content/70">Uploading pack to server... This may take a while for large files.</div>
                  </div>
                )}

                <div className="flex justify-end space-x-3">
                  <button type="button" className="btn btn-outline" disabled={processing || uploading} onClick={resetForm}>
                    {processedData ? 'Clear' : 'Cancel'}
                  </button>
                  {processedData && (
                    <button type="button" className="btn btn-secondary" disabled={processing || uploading} onClick={handleDownload}>
                      Download Zip
                    </button>
                  )}
                  <button
                    type="submit"
                    className={`btn btn-primary ${processing || uploading ? 'loading' : ''}`}
                    disabled={!selectedFolder || processing || uploading || !packName.trim()}
                  >
                    {processing ? 'Processing...' : uploading ? 'Uploading...' : processedData ? 'Upload Pack' : 'Process Pack'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
