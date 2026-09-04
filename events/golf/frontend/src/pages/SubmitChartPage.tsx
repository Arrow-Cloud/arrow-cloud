import React, { useState, useRef, useEffect } from 'react';
import { useIntl, FormattedMessage } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import { Flag, UploadCloud, CheckCircle2, AlertCircle, ChevronLeft } from 'lucide-react';
import { useAuth } from '@shared/contexts/AuthContext';

const SUBMIT_API_URL = import.meta.env.VITE_GOLF_SUBMIT_API_URL as string | undefined;

type UploadState = 'idle' | 'requesting' | 'uploading' | 'done' | 'error';

interface RuleSection {
  heading?: string;
  items: string[];
}

interface Pack {
  id: string;
  name: string;
  badge: string;
  curators: string[];
  ruleSections: RuleSection[];
}

const PACKS: Pack[] = [
  {
    id: 'quint-bait',
    name: 'Quint Bait',
    badge: 'Blocks 8–10 · Length 1:30–2:15',
    curators: ['Flicks', 'freyja', 'Wafles'],
    ruleSections: [
      {
        items: [
          'Length: 1:30–2:15',
          'Block rating: 8, 9, or 10',
          'Emphasis on song selection — bangers, memorable music, popular music',
          'Charts should have an "identity" that makes playing feel memorable and relatively unique',
          'Tech, low-tech, and no-tech are all fine; use of tech should be focused and intentional',
          'Minimal BR usage preferred (most charts with BR should be playable by jumping)',
        ],
      },
    ],
  },
  {
    id: 'stamina-stamtech',
    name: 'Stamina / StamTech',
    badge: 'Blocks 11–13 · Length 2:30–7:00',
    curators: ['freyja'],
    ruleSections: [
      {
        heading: 'Stamina (Vanilla)',
        items: [
          'Difficulty 11–13; BPM range 120–165; length 2:30–7:00',
          'High priority in variety music',
          '32 measures minimum total stream in chart',
          'No tech allowed',
        ],
      },
      {
        heading: 'StamTech',
        items: [
          'Difficulty 11–13; BPM range 120–165; length 2:30–7:00',
          '32 measures of stream recommended (does not need to be unbroken)',
          "Don't get too unhinged with tech, and keep XO to a minimum",
          'Keep chained tech to a minimum — avoid choke points',
          'Cool motifs are extremely important — bring a theme or unique pattern to the song',
        ],
      },
    ],
  },
  {
    id: 'pride-demon',
    name: 'Pride Demon',
    badge: 'Blocks 9–11 · Length 1:30–2:15',
    curators: ['DRILLBOT', 'valgrind'],
    ruleSections: [
      {
        items: [
          'Length: 1:30–2:15',
          'Difficulties: 9–11',
          'Songs by LGBTQ+ artists or generally popular with LGBTQ+ people',
          'Any tech density fine; Pride generally leans more accessible than Demon (songwise and techwise)',
          'Content should be appealing on the runback; target ITL equivalent of +300–1100 off base block rating',
        ],
      },
    ],
  },
];

const SubmitChartPage = () => {
  const { formatMessage } = useIntl();
  const { user, isInitializing } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isInitializing && !user) {
      navigate('/login', { replace: true });
    }
  }, [isInitializing, user, navigate]);

  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [progress, setProgress] = useState(0);

  const resetToStep1 = () => {
    setSelectedPack(null);
    setFile(null);
    setUploadState('idle');
    setErrorMessage('');
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handlePackSelect = (pack: Pack) => {
    setSelectedPack(pack);
    setFile(null);
    setUploadState('idle');
    setErrorMessage('');
    setProgress(0);
    window.history.pushState({ step: 2 }, '');
  };

  useEffect(() => {
    const onPopState = () => resetToStep1();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleBack = () => {
    window.history.back();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setUploadState('idle');
    setErrorMessage('');
    setProgress(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !SUBMIT_API_URL || !user || !selectedPack) return;

    setUploadState('requesting');
    setErrorMessage('');

    try {
      const urlRes = await fetch(`${SUBMIT_API_URL}/upload-url`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          userId: user.id,
          userAlias: user.alias,
          packId: selectedPack.id,
        }),
      });

      if (!urlRes.ok) {
        const { error } = (await urlRes.json()) as { error?: string };
        throw new Error(error ?? `Server error ${urlRes.status}`);
      }

      const { uploadUrl } = (await urlRes.json()) as { uploadUrl: string; key: string };

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
    window.history.back();
  };

  // Step 1: pack selection
  if (!selectedPack) {
    return (
      <div className="flex flex-col items-center pt-24 pb-16 px-4 min-h-screen">
        <div className="w-full max-w-lg flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <Flag className="w-10 h-10 text-accent" />
            <h1 className="text-2xl font-bold">
              <FormattedMessage defaultMessage="Submit a Chart" id="fZEEk5" description="Submit chart page heading" />
            </h1>
            <p className="text-base-content/60 text-sm">
              <FormattedMessage defaultMessage="Choose a pack to submit to." id="6UWT96" description="Pack selection prompt on submit chart page" />
            </p>
          </div>
          {/* General Info & Charting Rules */}
          <div className="card bg-base-200 p-5 flex flex-col gap-4">
            <h2 className="font-semibold text-sm text-base-content/70 uppercase tracking-wider">
              <FormattedMessage defaultMessage="General Information" id="elcNgS" description="General information section heading on submit chart page" />
            </h2>
            <ul className="flex flex-col gap-1 list-disc list-outside pl-4 marker:text-accent">
              <li className="text-sm text-base-content/80 pl-1">
                <FormattedMessage
                  defaultMessage="The event's theme and scoring system have not been announced yet, but shouldn't meaningfully impact how charts are written. These will be announced in the fall. The scoring system is accuracy oriented, with more timing windows that are less punishing regarding small mistakes."
                  id="WLy3O5"
                  description="General info bullet: theme/scoring system not yet announced"
                />
              </li>
              <li className="text-sm text-base-content/80 pl-1">
                <FormattedMessage
                  defaultMessage="The event will go live in December with 3 or 4 small packs with about 20 charts in each pack. More packs will be made available to submit charts to and will release after the initial event goes live."
                  id="DTG0cR"
                  description="General info bullet: event launch timing"
                />
              </li>
              <li className="text-sm text-base-content/80 pl-1">
                <FormattedMessage
                  defaultMessage="The curators for the packs will review your chart submissions and may reach out to you for some small changes."
                  id="W6rPfy"
                  description="General info bullet: curator review process"
                />
              </li>
            </ul>

            <h2 className="font-semibold text-sm text-base-content/70 uppercase tracking-wider">
              <FormattedMessage defaultMessage="Charting Rules" id="OmylTm" description="Charting rules section heading on submit chart page" />
            </h2>
            <ul className="flex flex-col gap-1 list-disc list-outside pl-4 marker:text-accent">
              <li className="text-sm text-base-content/80 pl-1">
                <FormattedMessage
                  defaultMessage="Your chart <strong>MUST BE UNRELEASED</strong>. You may release your chart separately after your chart debuts in the event."
                  id="F0dRE7"
                  description="Charting rule: chart must be unreleased"
                  values={{ strong: (chunks: React.ReactNode) => <strong>{chunks}</strong> }}
                />
              </li>
              <li className="text-sm text-base-content/80 pl-1">
                <FormattedMessage
                  defaultMessage="Your chart <strong>WILL BE REVIEWED ON MMOD</strong>. CMOD is not allowed in this event. If you need help normalizing scroll speed please ask in Discord."
                  id="8fqwZu"
                  description="Charting rule: MMOD review requirement"
                  values={{ strong: (chunks: React.ReactNode) => <strong>{chunks}</strong> }}
                />
              </li>
              <li className="text-sm text-base-content/80 pl-1">
                <FormattedMessage
                  defaultMessage="Explicit content is allowed but it is up to the discretion of the curators if something crosses the line. Songs like WAP, Nissan Altima, are not likely to be accepted. Use your judgment."
                  id="tIKdFn"
                  description="Charting rule: explicit content policy"
                />
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            {PACKS.map((pack) => (
              <button
                key={pack.id}
                className="card bg-base-200 p-5 text-left hover:bg-base-300 transition-colors cursor-pointer border border-transparent hover:border-accent/30"
                onClick={() => handlePackSelect(pack)}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-base-content">{pack.name}</span>
                  <span className="text-sm text-base-content/60">{pack.badge}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Step 2: rules + upload
  return (
    <div className="flex flex-col items-center pt-24 pb-16 px-4 min-h-screen">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Flag className="w-10 h-10 text-accent" />
          <h1 className="text-2xl font-bold">{selectedPack.name}</h1>
          <p className="text-sm text-base-content/60">
            <FormattedMessage
              defaultMessage="Curated by {curators}"
              id="lYb4jE"
              description="Curator credit line on submit chart page"
              values={{ curators: selectedPack.curators.join(', ') }}
            />
          </p>
        </div>

        {/* Pack-specific Rules */}
        <div className="card bg-base-200 p-5 flex flex-col gap-4">
          <h2 className="font-semibold text-sm text-base-content/70 uppercase tracking-wider">
            <FormattedMessage defaultMessage="Submission Rules" id="JHeC4d" description="Rules section heading on submit chart page" />
          </h2>
          {selectedPack.ruleSections.map((section, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              {section.heading && <h3 className="font-semibold text-sm">{section.heading}</h3>}
              <ul className="flex flex-col gap-1 list-disc list-outside pl-4 marker:text-accent">
                {section.items.map((rule, j) => (
                  <li key={j} className="text-sm text-base-content/80 pl-1">
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Upload form / success */}
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
                  {formatMessage({ defaultMessage: '{progress}% ', id: 'SrvHAs', description: 'Upload progress percentage label' }, { progress }).trim()}
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
                  <FormattedMessage defaultMessage="VITE_GOLF_SUBMIT_API_URL is not configured." id="CXVMTq" description="Missing env var warning" />
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm gap-1"
                onClick={handleBack}
                disabled={uploadState === 'requesting' || uploadState === 'uploading'}
              >
                <ChevronLeft className="w-4 h-4" />
                <FormattedMessage defaultMessage="Change pack" id="XZ5vB9" description="Back button to change pack selection" />
              </button>
              <button
                type="submit"
                className="btn btn-accent gap-2 flex-1"
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
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default SubmitChartPage;
