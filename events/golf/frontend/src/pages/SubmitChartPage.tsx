import { useState, useRef } from 'react';
import { useIntl, FormattedMessage } from 'react-intl';
import { Flag, UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';

const SUBMIT_API_URL = import.meta.env.VITE_GOLF_SUBMIT_API_URL as string | undefined;

type UploadState = 'idle' | 'requesting' | 'uploading' | 'done' | 'error';

const SubmitChartPage = () => {
  const { formatMessage } = useIntl();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [progress, setProgress] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setUploadState('idle');
    setErrorMessage('');
    setProgress(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !SUBMIT_API_URL) return;

    setUploadState('requesting');
    setErrorMessage('');

    try {
      // Step 1: get a pre-signed upload URL from the backend
      const urlRes = await fetch(`${SUBMIT_API_URL}/upload-url`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream' }),
      });

      if (!urlRes.ok) {
        const { error } = (await urlRes.json()) as { error?: string };
        throw new Error(error ?? `Server error ${urlRes.status}`);
      }

      const { uploadUrl } = (await urlRes.json()) as { uploadUrl: string; key: string };

      // Step 2: PUT the file directly to S3 using the pre-signed URL
      setUploadState('uploading');

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });

      setUploadState('done');
    } catch (err) {
      setUploadState('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const reset = () => {
    setFile(null);
    setUploadState('idle');
    setErrorMessage('');
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex flex-col items-center pt-24 pb-16 px-4 min-h-screen">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Flag className="w-10 h-10 text-accent" />
          <h1 className="text-2xl font-bold">
            <FormattedMessage defaultMessage="Submit a Chart" id="fZEEk5" description="Submit chart page heading" />
          </h1>
          <p className="text-base-content/60 text-sm">
            <FormattedMessage
              defaultMessage="Upload a .zip file containing your chart package."
              id="G7e5U/"
              description="Submit chart file format instructions"
            />
          </p>
        </div>

        {uploadState === 'done' ? (
          <div className="card bg-base-200 p-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-10 h-10 text-success" />
            <p className="font-semibold">
              <FormattedMessage defaultMessage="Chart submitted successfully!" id="vAro4O" description="Upload success message" />
            </p>
            <button className="btn btn-outline btn-sm" onClick={reset}>
              <FormattedMessage defaultMessage="Submit another" id="e+fe5f" description="Reset form to submit another chart" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card bg-base-200 p-6 flex flex-col gap-4">
            <label className="form-control w-full">
              <div className="label">
                <span className="label-text">
                  <FormattedMessage defaultMessage="Chart package (.zip)" id="JQnZcl" description="File input label" />
                </span>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream"
                className="file-input file-input-bordered w-full"
                onChange={handleFileChange}
                disabled={uploadState === 'requesting' || uploadState === 'uploading'}
              />
            </label>

            {uploadState === 'uploading' && (
              <div className="flex flex-col gap-1">
                <progress className="progress progress-accent w-full" value={progress} max={100} />
                  <span className="text-xs text-base-content/60 text-right">
                    {formatMessage(
                      {
                        defaultMessage: '{progress}% ',
                        id: 'SrvHAs',
                        description: 'Upload progress percentage label',
                      },
                      { progress },
                    ).trim()}
                  </span>
              </div>
            )}

            {uploadState === 'error' && (
              <div role="alert" className="alert alert-error text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {!SUBMIT_API_URL && (
              <div role="alert" className="alert alert-warning text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  <FormattedMessage
                    defaultMessage="VITE_GOLF_SUBMIT_API_URL is not configured."
                    id="CXVMTq"
                    description="Missing env var warning"
                  />
                </span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-accent gap-2"
              disabled={!file || !SUBMIT_API_URL || uploadState === 'requesting' || uploadState === 'uploading'}
            >
              {uploadState === 'requesting' || uploadState === 'uploading' ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <UploadCloud className="w-4 h-4" />
              )}
              {uploadState === 'requesting'
                ? formatMessage({ defaultMessage: 'Preparing…', id: 'XZYIHZ', description: 'Requesting upload URL state' })
                : uploadState === 'uploading'
                  ? formatMessage({ defaultMessage: 'Uploading…', id: 'embOlu', description: 'Uploading file state' })
                  : formatMessage({ defaultMessage: 'Upload', id: '1qCNFl', description: 'Submit button label' })}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default SubmitChartPage;
