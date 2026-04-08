import React, { useState, useMemo, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { AppPageLayout } from '../../components';
import { MonitorSmartphone, Settings2, Info, BookOpen, Ban, CircleQuestionMark, CheckCircle2, Download } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { GradeImage } from '../../components';
import { downloadArrowCloudIni as fetchArrowCloudIni } from '../../services/api';

// Simple enums for clarity
const OPERATING_SYSTEMS = ['Windows', 'macOS', 'Linux', 'Portable'] as const;
const INSTALL_METHODS = [
  { key: 'theme', label: 'Full Theme (UI + submission)', comingSoon: false },
  { key: 'module', label: 'Module Only (score submission)', comingSoon: false },
] as const;

interface SelectionState {
  os?: (typeof OPERATING_SYSTEMS)[number];
  method?: string;
}

const SectionCard: React.FC<{
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  id?: string;
  accent?: 'primary' | 'secondary' | 'accent' | 'error';
}> = ({ title, children, icon, id, accent = 'primary' }) => (
  <section
    id={id}
    className={`relative group overflow-hidden rounded-2xl border border-base-content/10 bg-base-200/60 backdrop-blur-md p-6 md:p-7 space-y-4 scroll-mt-28 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.25)]`}
    style={{ maxWidth: 'calc(100vw - 2rem)' }}
  >
    <div
      className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-${accent}/10 via-transparent to-${accent}/0 pointer-events-none`}
    />
    <div className="relative z-10">
      <header className="flex items-center gap-3 mb-1">
        <div className={`p-2 rounded-lg bg-${accent}/20 text-${accent} shadow-inner`}>{icon}</div>
        <h2 className="text-xl font-semibold tracking-tight text-base-content flex items-center gap-2">{title}</h2>
      </header>
      <div className="prose prose-sm max-w-none text-base-content/80 leading-relaxed [&_code]:bg-base-300/60 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md">
        {children}
      </div>
    </div>
    <div
      className={`pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 bg-gradient-to-r from-${accent}/40 to-transparent blur-lg transition-opacity`}
    />
  </section>
);

// Copyable text helper for lines/snippets users may need to copy
const CopyableText: React.FC<{ label?: string; value: string; className?: string }> = ({ label, value, className }) => {
  const intl = useIntl();
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore copy failures
    }
  };
  return (
    <div className={`flex items-stretch gap-2 ${className || ''}`}>
      <div className="flex-1 min-w-0">
        {label && <div className="text-xs text-base-content/60 mb-1">{label}</div>}
        <pre className="m-0 p-2 rounded-md bg-base-200/70 border border-base-content/10 overflow-x-auto text-sm select-text">
          <code>{value}</code>
        </pre>
      </div>
      <button
        type="button"
        className="btn btn-sm btn-outline self-start mt-6"
        onClick={onCopy}
        aria-label={intl.formatMessage({ defaultMessage: 'Copy', id: 'Rfndrb', description: 'Button to copy text to clipboard' })}
      >
        {copied
          ? intl.formatMessage({ defaultMessage: 'Copied', id: 'gyhSf+', description: 'Confirmation text after copying' })
          : intl.formatMessage({ defaultMessage: 'Copy', id: 'Rfndrb', description: 'Button to copy text to clipboard' })}
      </button>
    </div>
  );
};

// Step section with heading and rich content support
const StepSection: React.FC<{ number: number; title: string; children: React.ReactNode }> = ({ number, title, children }) => (
  <section className="rounded-lg border border-base-content/10 bg-base-100/60 p-4 space-y-3">
    <header className="flex items-center gap-2">
      <span className="badge badge-primary badge-sm">{number}</span>
      <h4 className="font-semibold text-base-content">{title}</h4>
    </header>
    <div className="text-base text-base-content/80 leading-relaxed">{children}</div>
  </section>
);

const HelpPage: React.FC = () => {
  const intl = useIntl();
  const [selection, setSelection] = useState<SelectionState>({});
  const { user, isInitializing } = useAuth();
  const [activeId, setActiveId] = useState<string>('what-is');

  // Observe sections for active state in side nav
  useEffect(() => {
    const sectionIds = ['what-is', 'what-is-not', 'why-exists', 'setup', 'blue-shift', 'scoring', 'faq'];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => (a.boundingClientRect.top > b.boundingClientRect.top ? 1 : -1));
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: [0, 0.25, 0.5, 1] },
    );
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // Handle initial hash scroll & listen for hash changes triggered by navigation from other pages
  useEffect(() => {
    const scrollToHash = (hash: string) => {
      if (!hash) return;
      const id = hash.replace('#', '');
      const el = document.getElementById(id);
      if (el) {
        // Use scroll-margin set on sections plus smooth scroll
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveId(id);
      }
    };

    // Attempt after a short delay to allow layout/async content
    if (window.location.hash) {
      setTimeout(() => scrollToHash(window.location.hash), 50);
    }
    // Support cross-page navigation storing pending hash (sessionStorage)
    try {
      const pending = sessionStorage.getItem('pendingHelpHash');
      if (pending) {
        setTimeout(() => scrollToHash(pending), 60);
        sessionStorage.removeItem('pendingHelpHash');
      }
    } catch {}

    const onHashChange = () => {
      scrollToHash(window.location.hash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const resetSelection = () => setSelection({});

  const canProceedMethod = !!selection.os;

  const selectionSummary = useMemo(() => {
    if (!selection.os) return 'Choose your operating system to begin.';
    if (!selection.method) return `Selected ${selection.os}. Now choose an installation method.`;
    const methodLabel = INSTALL_METHODS.find((m) => m.key === selection.method)?.label || selection.method;
    return `Selected ${selection.os} / ${methodLabel}. Installation instructions coming soon.`;
  }, [selection]);

  // Download links (hard-coded per request) — use HTTPS to avoid mixed content blocking
  const THEME_DOWNLOAD_URL = 'https://assets.arrowcloud.dance/theme/Arrow%20Cloud%20Theme%2020260321.zip';
  const MODULE_DOWNLOAD_URL = 'https://assets.arrowcloud.dance/theme/Arrow%20Cloud%20Module%2020260320.2.zip';
  // ArrowCloud.ini is generated server-side with a new API key per request
  const ARROWCLOUD_INI_DOWNLOAD_URL = '/arrowcloud.ini';

  const handleDownloadIni = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try {
      const blob = await fetchArrowCloudIni();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ArrowCloud.ini';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download ArrowCloud.ini', err);
      alert('Failed to download ArrowCloud.ini. Please ensure you are logged in and try again.');
    }
  };

  // Stub instruction text per permutation (OS + method)
  const instructionMatrix: Record<string, Record<string, { steps: string[] }>> = {
    Windows: {
      theme: {
        steps: ['Download the Theme archive (zip).', 'Extract into your ITGMania Themes directory.'],
      },
      module: {
        steps: ['Download the Module archive (zip).', 'Drop the module folder into your existing theme (e.g. Simply Love) under /Modules.'],
      },
    },
    macOS: {
      theme: {
        steps: ['Download the Theme archive (zip).', 'Extract into your ITGMania Themes directory.'],
      },
      module: {
        steps: ['Download the Module archive (zip).', 'Drop the module folder into your existing theme (e.g. Simply Love) under /Modules.'],
      },
    },
    Linux: {
      theme: {
        steps: ['Download the Theme archive (zip).', 'Extract into your ITGMania Themes directory.'],
      },
      module: {
        steps: ['Download the Module archive (zip).', 'Drop the module folder into your existing theme (e.g. Simply Love) under /Modules.'],
      },
    },
    Portable: {
      theme: {
        steps: [
          'Download the Theme archive (zip).',
          'Extract into your ITGMania Themes directory.',
          'Launch ITGMania and select the Arrow Cloud theme in system preferences.',
          'Play a chart to verify automatic submission appears on your profile.',
        ],
      },
      module: {
        steps: [
          'Download the Module archive (zip).',
          'Drop the module folder into your existing theme (e.g. Simply Love) under /Modules.',
          'Restart ITGMania to load the module.',
          'Play a chart to verify automatic submission appears on your profile.',
        ],
      },
    },
  };

  const currentInstructions = selection.os && selection.method ? instructionMatrix[selection.os]?.[selection.method] : undefined;

  // Configuration paths for guidance
  const CONFIG_PATHS: Record<string, { base: string; preferences: string; profiles: string }> = {
    Portable: {
      base: 'GAME_INSTALLATION_DIR/Save',
      preferences: 'GAME_INSTALLATION_DIR/Save/Preferences.ini',
      profiles: 'GAME_INSTALLATION_DIR/Save/LocalProfiles/',
    },
    Windows: {
      base: '%AppData%/ITGmania/Save',
      preferences: '%AppData%/ITGmania/Save/Preferences.ini',
      profiles: '%AppData%/ITGmania/Save/LocalProfiles/',
    },
    Linux: {
      base: '~/.itgmania/Save',
      preferences: '~/.itgmania/Save/Preferences.ini',
      profiles: '~/.itgmania/Save/LocalProfiles/',
    },
    macOS: {
      base: '~/Library/Preferences/ITGmania',
      preferences: '~/Library/Preferences/ITGmania/Preferences.ini',
      profiles: '~/Library/Preferences/ITGmania/LocalProfiles/',
    },
  };

  const configInfo = selection.os ? CONFIG_PATHS[selection.os] : undefined;

  // Build rich, discrete setup steps when selection is complete
  const stepSections = useMemo(() => {
    if (!currentInstructions || !configInfo) return undefined;
    const profileExample = `${configInfo.profiles}00000000/`;
    const appendHost = ',*.arrowcloud.dance';
    const exampleLine = 'HttpAllowHosts=*.groovestats.com,*.arrowcloud.dance';

    return [
      {
        title: 'Close ITGMania',
        content: (
          <div className="space-y-2">
            <p>
              {intl.formatMessage({
                defaultMessage:
                  'ITGMania must be closed before continuing. If ITGMania is open it may overwrite some changes to preferences files we will be editing.',
                id: 'VxHwC7',
                description: 'Instructions for closing ITGMania',
              })}
            </p>
          </div>
        ),
      },
      {
        title: 'Download files',
        content: (
          <div className="space-y-2">
            <p>
              {intl.formatMessage({
                defaultMessage: 'Use the buttons below to download the required files for your setup.',
                id: 'opIE4F',
                description: 'Instructions to download theme or module files',
              })}
            </p>
            <div role="alert" className="alert alert-warning">
              <span className="font-medium">{intl.formatMessage({ defaultMessage: 'Heads up:', id: 'Amu9qR', description: 'Alert box heading' })}</span>
              <span>
                {intl.formatMessage({
                  defaultMessage:
                    'Some browsers may flag the ArrowCloud.ini download as suspicious because it is a plain-text configuration file. This is expected and the file is safe—you can proceed with the download.',
                  id: '4TmIV5',
                  description: 'Warning message about browser security flags',
                })}
              </span>
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <a
                href={selection.method === 'theme' ? THEME_DOWNLOAD_URL : MODULE_DOWNLOAD_URL}
                className="btn btn-primary btn-lg gap-2 shadow-lg flex-1 justify-center"
              >
                <Download className="w-5 h-5" />
                {selection.method === 'theme'
                  ? intl.formatMessage({ defaultMessage: 'Download Theme ZIP', id: 'fB9pUP', description: 'Button label to download theme archive' })
                  : intl.formatMessage({ defaultMessage: 'Download Module', id: 'XrZn/3', description: 'Button label to download module archive' })}
              </a>
              <a href={ARROWCLOUD_INI_DOWNLOAD_URL} onClick={handleDownloadIni} className="btn btn-secondary btn-lg gap-2 shadow-lg flex-1 justify-center">
                <Download className="w-5 h-5" />
                {intl.formatMessage({ defaultMessage: 'Download ArrowCloud.ini', id: 'DI/ILQ', description: 'Button label to download configuration file' })}
              </a>
            </div>
          </div>
        ),
      },
      {
        title: 'Place ArrowCloud.ini',
        content: (
          <div className="space-y-3">
            <p>
              {intl.formatMessage(
                {
                  defaultMessage: 'Copy ArrowCloud.ini into your active profile folder (for example: {profileExample}).',
                  id: '2sYnkh',
                  description: 'Instructions for copying configuration file',
                },
                { profileExample: <code className="px-1 py-0.5 rounded bg-base-200/70">{profileExample}</code> },
              )}
            </p>
            <div className="rounded-md border border-base-content/10 bg-base-100/60 p-3 text-sm space-y-1">
              <div className="font-medium text-base-content/80">
                {intl.formatMessage({ defaultMessage: 'Configuration Paths', id: 'qpvO54', description: 'Section header for configuration file paths' })}
              </div>
              <div>
                {intl.formatMessage(
                  { defaultMessage: '<label>Base:</label> {basePath}', id: '30056/', description: 'Label for base configuration path' },
                  {
                    label: (txt) => <span className="text-base-content/60">{txt}</span>,
                    basePath: <code className="bg-base-200/70 px-1 py-0.5 rounded">{configInfo.base}</code>,
                  },
                )}
              </div>
              <div>
                {intl.formatMessage(
                  { defaultMessage: '<label>Preferences:</label> {prefsPath}', id: '1nKpRW', description: 'Label for preferences file path' },
                  {
                    label: (txt) => <span className="text-base-content/60">{txt}</span>,
                    prefsPath: <code className="bg-base-200/70 px-1 py-0.5 rounded">{configInfo.preferences}</code>,
                  },
                )}
              </div>
              <div>
                {intl.formatMessage(
                  { defaultMessage: '<label>Profiles:</label> {profilesPath}', id: 'L4UkwF', description: 'Label for profiles folder path' },
                  {
                    label: (txt) => <span className="text-base-content/60">{txt}</span>,
                    profilesPath: <code className="bg-base-200/70 px-1 py-0.5 rounded">{configInfo.profiles}</code>,
                  },
                )}
              </div>
            </div>
          </div>
        ),
      },
      {
        title: 'Allow Arrow Cloud host',
        content: (
          <div className="space-y-3">
            <p>
              {intl.formatMessage(
                {
                  defaultMessage:
                    'Open {prefsPath} while the game is closed and append the host to the allowed list. If you already have entries, simply add {appendHost} to the end of your existing list.',
                  id: 'JVuqsu',
                  description: 'Instructions for adding host to preferences file',
                },
                {
                  prefsPath: <code className="px-1 py-0.5 rounded bg-base-200/70">{configInfo.preferences}</code>,
                  appendHost: <code className="px-1 py-0.5 rounded bg-base-200/70">{appendHost}</code>,
                },
              )}
            </p>
            <CopyableText
              label={intl.formatMessage({
                defaultMessage: 'Append to AllowedHosts / HttpAllowHosts',
                id: 'm4RRvP',
                description: 'Label for copyable host configuration snippet',
              })}
              value={appendHost}
            />
            <CopyableText
              label={intl.formatMessage({
                defaultMessage: 'Example complete line',
                id: 'zhxMFg',
                description: 'Label for copyable example configuration line',
              })}
              value={exampleLine}
            />
          </div>
        ),
      },
      {
        title: selection.method === 'theme' ? 'Install the Theme' : 'Install the Module',
        content: (
          <div className="space-y-2">
            <ul className="list-disc pl-5 space-y-1">
              {currentInstructions.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        ),
      },
      {
        title: 'Restart & Verify',
        content: (
          <div className="space-y-2">
            <p>
              {intl.formatMessage({
                defaultMessage: 'Restart ITGMania to ensure configuration is loaded, then play any chart.',
                id: 'b497id',
                description: 'Instruction to restart game and test',
              })}
            </p>
            <p>
              {intl.formatMessage({
                defaultMessage: 'Your Arrow Cloud profile should show a new submission shortly after.',
                id: 'cNcvUb',
                description: 'Verification instruction for successful submission',
              })}
            </p>
          </div>
        ),
      },
    ];
  }, [currentInstructions, configInfo, selection.method]);

  return (
    <AppPageLayout className="pb-0" accent="info">
      <div className="pb-28 relative">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid lg:grid-cols-[260px_1fr] gap-8 items-start">
            {/* Side Navigation */}
            <nav
              aria-label={intl.formatMessage({ defaultMessage: 'Help navigation', id: 'dI5InQ', description: 'Label for help section navigation' })}
              className="hidden lg:block sticky top-24"
            >
              <ul className="bg-base-200/60 border border-base-content/10 rounded-2xl p-3 text font-medium w-60 space-y-1 shadow-xl backdrop-blur-md">
                {[
                  { id: 'what-is', label: 'What It Is' },
                  { id: 'what-is-not', label: 'What It Is Not' },
                  { id: 'why-exists', label: 'Why It Exists' },
                  { id: 'setup', label: 'Setup' },
                  { id: 'scoring', label: 'Scoring' },
                  { id: 'faq', label: 'FAQ' },
                ].map((item) => {
                  const active = activeId === item.id;
                  return (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          const el = document.getElementById(item.id);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            // push state to update URL without duplicate history if already same hash
                            if (window.location.hash !== `#${item.id}`) {
                              history.pushState(null, '', `#${item.id}`);
                            }
                          }
                        }}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors relative group ${active ? 'bg-primary/20 text-primary font-semibold' : 'hover:bg-base-300/40 text-base-content/70'}`}
                      >
                        <span
                          className={`w-1 h-5 rounded-full bg-primary transition-transform ${active ? 'scale-y-100' : 'scale-y-0 group-hover:scale-y-100'}`}
                        />
                        {item.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <main className="space-y-10">
              <div
                className="relative overflow-hidden rounded-3xl border border-base-content/10 bg-gradient-to-br from-base-200/80 via-base-200/50 to-base-100/40 backdrop-blur-xl p-10 shadow-[0_8px_40px_-8px_rgba(0,0,0,0.4)]"
                data-testid="help-hero"
              >
                <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_20%_15%,hsl(var(--p)/0.35),transparent_55%),radial-gradient(circle_at_85%_80%,hsl(var(--s)/0.30),transparent_60%)]" />
                <div className="relative z-10 space-y-6">
                  <div>
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight flex items-center gap-4 text-base-content">
                      <span className="inline-flex items-center gap-3 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                        {intl.formatMessage(
                          { defaultMessage: '{bookIcon} Help Center', id: '6HwZWG', description: 'Main heading for help page' },
                          { bookIcon: <BookOpen className="w-10 h-10 text-primary drop-shadow" /> },
                        )}
                      </span>
                    </h1>
                  </div>
                </div>
              </div>

              <SectionCard
                id="what-is"
                title={intl.formatMessage({ defaultMessage: 'What Arrow Cloud Is', id: 'H/xdSH', description: 'Section title explaining what Arrow Cloud is' })}
                icon={<Info className="w-5 h-5" />}
              >
                <p className="mb-4 text leading-relaxed">
                  {intl.formatMessage({
                    defaultMessage:
                      'Arrow Cloud is a modern online service for ITGMania for tracking scores, hosting leaderboards, and running remote online events. Built with fundamentally scalable infrastructure, and will be open sourced in 2026.',
                    id: 'GamScG',
                    description: 'Description of Arrow Cloud service',
                  })}
                </p>

                <p className="text leading-relaxed">
                  {intl.formatMessage({
                    defaultMessage: 'We offer a full integration with ITGMania via our custom theme, or a light-weight alternative drop in Simply Love module.',
                    id: 'jsxVw/',
                    description: 'Explanation of installation options',
                  })}
                </p>
              </SectionCard>

              <SectionCard
                id="what-is-not"
                title={intl.formatMessage({
                  defaultMessage: 'What Arrow Cloud Is NOT',
                  id: 'js1oVo',
                  description: 'Section title about what Arrow Cloud is not',
                })}
                accent="error"
                icon={<Ban className="w-5 h-5" />}
              >
                <p className="text leading-relaxed">
                  {intl.formatMessage(
                    {
                      defaultMessage:
                        'Arrow Cloud is <semibold>not affiliated</semibold> with GrooveStats, BoogieStats, ITC, ITGDB, SMO, or other services. It does not scrape, proxy, or passthrough leaderboards or scores from external platforms.',
                      id: '5XAAaa',
                      description: 'Statement about no affiliation with other services',
                    },
                    { semibold: (txt) => <span className="font-semibold">{txt}</span> },
                  )}
                </p>
              </SectionCard>

              <SectionCard
                id="why-exists"
                title={intl.formatMessage({ defaultMessage: 'Why It Exists', id: '5nutZC', description: 'Section title about the purpose of Arrow Cloud' })}
                accent="accent"
                icon={<CircleQuestionMark className="w-5 h-5" />}
              >
                <div className="space-y-4">
                  <p className="text leading-relaxed">
                    {intl.formatMessage({
                      defaultMessage:
                        "GrooveStats introduced online leaderboards to the ITG community over 20 years ago and has been an extremely valuable tool throughout the game's history. This project aims to offer an alternative platform with a modernized, flexible, and open leaderboard design.",
                      id: 'gW2PUA',
                      description: 'Explanation of Arrow Cloud as alternative to GrooveStats',
                    })}
                  </p>
                </div>
              </SectionCard>

              <SectionCard
                id="setup"
                title={intl.formatMessage({ defaultMessage: 'Setup Guide', id: 'oeCoFG', description: 'Section title for installation setup guide' })}
                accent="secondary"
                icon={<Settings2 className="w-5 h-5" />}
              >
                <p className="mb-4">
                  {intl.formatMessage({
                    defaultMessage: 'Follow this guided selector to view platform-specific instructions.',
                    id: 'B067A3',
                    description: 'Introduction to the setup wizard',
                  })}
                </p>

                {/* Guided Flow */}
                <div className="space-y-6" data-testid="setup-flow">
                  {/* Step 1: Account */}
                  <div
                    className={`rounded-lg p-4 transition-colors ${
                      user ? 'border border-success/40 bg-success/10' : 'border border-base-content/10 bg-base-100/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3 text-base-content/80">
                      <span className={`badge badge-sm ${user ? 'badge-success' : 'badge-primary'}`}>{1}</span>
                      <h3 className="font-medium flex items-center gap-2">
                        {user && <CheckCircle2 className="w-4 h-4 text-success" />}
                        {user
                          ? intl.formatMessage({ defaultMessage: 'Account Ready', id: 'a89Mq1', description: 'Label when user is logged in' })
                          : intl.formatMessage({ defaultMessage: 'Create Your Account', id: '77/s9/', description: 'Label to create account' })}
                      </h3>
                    </div>
                    {isInitializing && !user && (
                      <p className="text mb-1 text-base-content/60 italic">
                        {intl.formatMessage({ defaultMessage: 'Checking login status…', id: 'tJZWpJ', description: 'Loading indicator text for auth status' })}
                      </p>
                    )}
                    {!isInitializing && user && (
                      <p className="text mb-2 text-base-content/70">
                        {intl.formatMessage(
                          { defaultMessage: 'Logged in as {userInfo}. This step is complete.', id: 'FBujCk', description: 'Confirmation of successful login' },
                          { userInfo: <span className="font-medium">{user.alias || user.email}</span> },
                        )}
                      </p>
                    )}
                    {!user && !isInitializing && (
                      <>
                        <p className="text mb-3 text-base-content/70">
                          {intl.formatMessage({
                            defaultMessage:
                              'Sign up on the site (Register) and verify your email. This will associate future score submissions with your profile.',
                            id: '+tpXd6',
                            description: 'Instruction to create account and verify email',
                          })}
                        </p>
                        <div>
                          <a
                            href="/register"
                            className="btn btn-sm btn-primary"
                            onClick={(e) => {
                              e.preventDefault();
                              window.location.href = '/register';
                            }}
                          >
                            {intl.formatMessage({ defaultMessage: 'Register', id: 'RDLRdD', description: 'Button to navigate to registration page' })}
                          </a>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Step 2: OS Selection */}
                  <div className="border border-base-content/10 rounded-lg p-4 bg-base-100/40">
                    <div className="flex items-center gap-2 mb-4 text-base-content/80">
                      <span className="badge badge-primary badge-sm">{2}</span>
                      <h3 className="font-medium">
                        {intl.formatMessage({ defaultMessage: 'Choose Your Operating System', id: 'wuzSwY', description: 'Step 2 title for OS selection' })}
                      </h3>
                    </div>
                    <div className="grid sm:grid-cols-4 gap-3">
                      {OPERATING_SYSTEMS.map((os) => {
                        const active = selection.os === os;
                        return (
                          <button
                            key={os}
                            className={`btn btn-sm h-auto py-3 flex flex-col gap-1 border-base-content/20 ${active ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setSelection((s) => ({ os, method: s.method && s.os === os ? s.method : undefined }))}
                            aria-pressed={active}
                          >
                            <MonitorSmartphone className="w-5 h-5" />
                            <span className="text font-medium">{os}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 3: Installation Method */}
                  <div
                    className={`border border-base-content/10 rounded-lg p-4 bg-base-100/40 relative ${!canProceedMethod ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <div className="flex items-center gap-2 mb-4 text-base-content/80">
                      <span className="badge badge-primary badge-sm">{3}</span>
                      <h3 className="font-medium">
                        {intl.formatMessage({
                          defaultMessage: 'Choose Your Installation Method',
                          id: 'suj+gY',
                          description: 'Step 3 title for method selection',
                        })}
                      </h3>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {INSTALL_METHODS.map((m) => {
                        const active = selection.method === m.key;
                        return (
                          <button
                            key={m.key}
                            className={`btn btn-sm h-auto py-3 flex flex-col gap-1 border-base-content/20 relative ${active ? 'btn-secondary' : 'btn-outline'}`}
                            onClick={() => setSelection((s) => ({ ...s, method: m.key }))}
                            aria-pressed={active}
                            // Temporarily enabled even if marked comingSoon for preview of instructions
                            disabled={false}
                          >
                            <span className="text font-medium text-center">{m.label}</span>
                            {m.comingSoon && (
                              <span className="absolute top-1 right-1 badge badge-xs badge-outline">
                                {intl.formatMessage({ defaultMessage: 'soon', id: 'bXo9VG', description: 'Badge label for upcoming features' })}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 4: Summary & Instructions */}
                  <div className="border border-dashed border-base-content/20 rounded-lg p-4 bg-base-100/30">
                    <div className="flex items-center gap-2 mb-2 text-base-content/80">
                      <span className="badge badge-primary badge-sm">{4}</span>
                      <h3 className="font-medium">
                        {intl.formatMessage({
                          defaultMessage: 'Summary & Instructions',
                          id: 'iQ5NMV',
                          description: 'Step 4 title for summary and instructions',
                        })}
                      </h3>
                    </div>
                    <p className="text text-base-content/70 mb-3">{selectionSummary}</p>
                    {stepSections && (
                      <div className="mt-5 space-y-4">
                        {stepSections.map((s, i) => (
                          <StepSection key={i} number={i + 1} title={s.title}>
                            {s.content}
                          </StepSection>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button className="btn btn-xs btn-outline" onClick={resetSelection} disabled={!selection.os && !selection.method}>
                        {intl.formatMessage({ defaultMessage: 'Reset', id: 'HIvR8W', description: 'Button to reset selection' })}
                      </button>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                id="scoring"
                title={intl.formatMessage({ defaultMessage: 'Scoring & Grading Systems', id: 'HFZ2Dx', description: 'Section title for scoring systems' })}
                accent="primary"
                icon={<Info className="w-5 h-5" />}
              >
                <p className="text mb-4">
                  {intl.formatMessage({
                    defaultMessage:
                      'Arrow Cloud supports three parallel scoring interpretations. Raw judgments (the sequence of offsets and misses) are immutable; scoring systems only change how those raw events are weighted into a percentage and mapped to a grade.',
                    id: 'iN/fQj',
                    description: 'Introduction to scoring systems',
                  })}
                </p>
                <div className="grid md:grid-cols-3 gap-4 text">
                  <div className="p-4 rounded-xl border border-primary/30 bg-primary/10">
                    <p className="font-semibold mb-2 text-primary">
                      {intl.formatMessage({ defaultMessage: 'HardEX (10ms)', id: 'c5lA7h', description: 'HardEX scoring system name' })}
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-base-content/70">
                      <li>
                        {intl.formatMessage({
                          defaultMessage: 'Tight inner Fantastic: ±10ms window',
                          id: 'SF7mNm',
                          description: 'HardEX feature: window size',
                        })}
                      </li>
                      <li>
                        {intl.formatMessage({ defaultMessage: 'Rewards extreme precision', id: 'QGutVM', description: 'HardEX feature: precision focus' })}
                      </li>
                      <li>
                        {intl.formatMessage({ defaultMessage: 'Greats are equivalent to a miss', id: 'oiaphe', description: 'HardEX feature: miss penalty' })}
                      </li>
                    </ul>
                  </div>
                  <div className="p-4 rounded-xl border border-secondary/30 bg-secondary/10">
                    <p className="font-semibold mb-2 text-secondary">
                      {intl.formatMessage({ defaultMessage: 'EX (15ms)', id: '2Q+Z2n', description: 'EX scoring system name' })}
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-base-content/70">
                      <li>{intl.formatMessage({ defaultMessage: 'Primary Fantastic at ±15ms', id: 'QOAp4b', description: 'EX feature: window size' })}</li>
                      <li>
                        {intl.formatMessage({ defaultMessage: 'Slightly broader precision reward', id: 'kYKyoa', description: 'EX feature: precision range' })}
                      </li>
                      <li>
                        {intl.formatMessage({ defaultMessage: 'Greats still retain minor weight', id: 'GgX2r2', description: 'EX feature: great value' })}
                      </li>
                    </ul>
                  </div>
                  <div className="p-4 rounded-xl border border-accent/30 bg-accent/10">
                    <p className="font-semibold mb-2 text-accent">
                      {intl.formatMessage({ defaultMessage: 'ITG (Money)', id: 'y8RU5Y', description: 'ITG scoring system name' })}
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-base-content/70">
                      <li>
                        {intl.formatMessage({ defaultMessage: 'Classic ITG style weighting', id: 'aiXGAN', description: 'ITG feature: weighting style' })}
                      </li>
                      <li>{intl.formatMessage({ defaultMessage: 'Way Off & Miss heavily punished', id: '85Sq9G', description: 'ITG feature: penalty' })}</li>
                      <li>{intl.formatMessage({ defaultMessage: 'No inner Fantastic split', id: 'eE6UfK', description: 'ITG feature: no split' })}</li>
                    </ul>
                  </div>
                </div>
                <div className="mt-8 grid lg:grid-cols-2 gap-8 text">
                  <div className="p-4 rounded-xl border border-base-content/10 bg-base-100/40 space-y-3">
                    <h3 className="font-semibold tracking-wide text-primary text-sm">
                      {intl.formatMessage({
                        defaultMessage: 'How Percentage Is Computed',
                        id: 'LHEIOI',
                        description: 'Section heading for percentage calculation',
                      })}
                    </h3>
                    <ol className="list-decimal pl-4 space-y-1 text-base-content/70">
                      <li>
                        {intl.formatMessage({
                          defaultMessage: 'Each tap note contributes its window weight based on the offset of when you hit the tap note.',
                          id: '+9eRWt',
                          description: 'Percentage calculation step 1',
                        })}
                      </li>
                      <li>
                        {intl.formatMessage({
                          defaultMessage: 'Total max = (tap count * perfect weight) + (holds + rolls)*heldWeight.',
                          id: 'a4zEIi',
                          description: 'Percentage calculation step 2',
                        })}
                      </li>
                      <li>
                        {intl.formatMessage({
                          defaultMessage:
                            'Score sum = tap weights + (held completions * heldWeight) + (roll completions * heldWeight) + (mine hits * minePenalty).',
                          id: '5ghtCO',
                          description: 'Percentage calculation step 3',
                        })}
                      </li>
                      <li>
                        {intl.formatMessage({ defaultMessage: 'Percent = score sum / max.', id: 'QreD4A', description: 'Percentage calculation step 4' })}
                      </li>
                    </ol>
                  </div>
                  <div className="p-4 rounded-xl border border-base-content/10 bg-base-100/40 space-y-3">
                    <h3 className="font-semibold tracking-wide text-primary text-sm">
                      {intl.formatMessage({ defaultMessage: 'How Grade Is Computed', id: 'wMXZJe', description: 'Section heading for grade calculation' })}
                    </h3>
                    <ol className="list-decimal pl-4 space-y-1 text-base-content/70">
                      <li>
                        {intl.formatMessage({ defaultMessage: 'Each grade has a minimum % threshold.', id: 'BHuTSI', description: 'Grade calculation step 1' })}
                      </li>
                      <li>
                        {intl.formatMessage({
                          defaultMessage: 'Some top grades (Sext / Quint) evaluate using a stricter scoring system override (HardEX/EX).',
                          id: '2BwvtG',
                          description: 'Grade calculation step 2',
                        })}
                      </li>
                      <li>
                        {intl.formatMessage({
                          defaultMessage: 'Ties on threshold resolved by system precision priority: HardEX > EX > ITG.',
                          id: 'sCaEgz',
                          description: 'Grade calculation step 3',
                        })}
                      </li>
                      <li>
                        {intl.formatMessage({
                          defaultMessage: 'If no thresholds met: fallback to minimum pass grade (D).',
                          id: 'KV+29l',
                          description: 'Grade calculation step 4',
                        })}
                      </li>
                    </ol>
                  </div>
                </div>
                <div className="mt-10">
                  <h3 className="font-semibold mb-4 text-sm tracking-wide text-primary">
                    {intl.formatMessage({
                      defaultMessage: 'Grade Thresholds & Badges (ITG base + extensions)',
                      id: 'PTMqr0',
                      description: 'Section heading for grade threshold table',
                    })}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {[
                      { name: 'Sext', min: '100% (HardEX Split)' },
                      { name: 'Quint', min: '100% (EX Split)' },
                      { name: 'Quad', min: '100%' },
                      { name: 'Tristar', min: '99%' },
                      { name: 'Twostar', min: '98%' },
                      { name: 'Star', min: '96%' },
                      { name: 'S+', min: '94%' },
                      { name: 'S', min: '92%' },
                      { name: 'S-', min: '≥89%' },
                      { name: 'A+', min: '≥86%' },
                      { name: 'A', min: '≥83%' },
                      { name: 'A-', min: '≥80%' },
                      { name: 'B+', min: '≥76%' },
                      { name: 'B', min: '≥72%' },
                      { name: 'B-', min: '≥68%' },
                      { name: 'C+', min: '≥64%' },
                      { name: 'C', min: '≥60%' },
                      { name: 'C-', min: '≥55%' },
                      {
                        name: 'D',
                        min: intl.formatMessage({
                          defaultMessage: 'Pass Floor',
                          id: 'NIMaHT',
                          description: 'brief description of the D grade, which is awarded for any pass that does not meet the C- threshold or higher',
                        }),
                      },
                      {
                        name: 'F',
                        min: intl.formatMessage({
                          defaultMessage: 'Failed Play',
                          id: 'ryU59V',
                          description: 'brief description of the F grade, which is awarded if the lifebar reaches zero during play',
                        }),
                      },
                    ].map((g) => (
                      <div key={g.name} className="flex items-center gap-3 p-2 rounded-lg border border-base-content/10 bg-base-100/50">
                        <GradeImage grade={g.name} className="h-8 w-auto" />
                        <div className="text-xs leading-tight">
                          <div className="font-semibold">{g.name}</div>
                          <div className="text-base-content/60">{g.min}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-6 w-full max-w-full overflow-x-auto">
                  <table className="table table-xs min-w-[560px]">
                    <thead>
                      <tr className="text-base-content/70">
                        <th className="font-semibold">
                          {intl.formatMessage({
                            defaultMessage: 'Window (±ms)',
                            id: '11eEsx',
                            description: 'table column heading for descriptions of the timing windows and corresponding score weights',
                          })}
                        </th>
                        <th>
                          {intl.formatMessage({
                            defaultMessage: 'HardEX Weight',
                            id: '9HRRf6',
                            description: 'table column heading for descriptions of the timing windows and corresponding score weights',
                          })}
                        </th>
                        <th>
                          {intl.formatMessage({
                            defaultMessage: 'EX Weight',
                            id: '0k4n4s',
                            description: 'table column heading for descriptions of the timing windows and corresponding score weights',
                          })}
                        </th>
                        <th>
                          {intl.formatMessage({
                            defaultMessage: 'ITG Weight',
                            id: 'SI6+yb',
                            description: 'table column heading for descriptions of the timing windows and corresponding score weights',
                          })}
                        </th>
                      </tr>
                    </thead>
                    {/* eslint-disable formatjs/no-literal-string-in-jsx */}
                    <tbody>
                      <tr>
                        <td>10</td>
                        <td>3.5 (Fantastic 10ms)</td>
                        <td>—</td>
                        <td>—</td>
                      </tr>
                      <tr>
                        <td>15</td>
                        <td>—</td>
                        <td>3.5 (Fantastic 15ms)</td>
                        <td>—</td>
                      </tr>
                      <tr>
                        <td>23</td>
                        <td>3.0 (White Fantastic)</td>
                        <td>3.0 (White Fantastic)</td>
                        <td>5 (Fantastic)</td>
                      </tr>
                      <tr>
                        <td>44.5</td>
                        <td>1 (Excellent)</td>
                        <td>2 (Excellent)</td>
                        <td>4 (Excellent)</td>
                      </tr>
                      <tr>
                        <td>103.5</td>
                        <td>0 (Great)</td>
                        <td>1 (Great)</td>
                        <td>2 (Great)</td>
                      </tr>
                      <tr>
                        <td>136.5</td>
                        <td>0 (Decent)</td>
                        <td>0 (Decent)</td>
                        <td>0 (Decent)</td>
                      </tr>
                      <tr>
                        <td>181.5</td>
                        <td>0 (Way Off)</td>
                        <td>0 (Way Off)</td>
                        <td>-6 (Way Off)</td>
                      </tr>
                      <tr>
                        <td>&gt;181.5</td>
                        <td>0 (Miss)</td>
                        <td>0 (Miss)</td>
                        <td>-12 (Miss)</td>
                      </tr>
                    </tbody>
                    {/* eslint-enable formatjs/no-literal-string-in-jsx */}
                  </table>
                </div>
              </SectionCard>

              <SectionCard
                id="faq"
                title={intl.formatMessage({ defaultMessage: 'FAQ', id: 'euAGju', description: 'Section title for frequently asked questions' })}
                accent="secondary"
                icon={<Info className="w-5 h-5" />}
              >
                <p className="mb-4 text text-base-content/70">
                  {intl.formatMessage({
                    defaultMessage: 'Common quick answers/miscellaneous information',
                    id: '/yrXf9',
                    description: 'Description of FAQ section',
                  })}
                </p>
                <div className="space-y-4 text">
                  <details className="group border border-base-content/10 rounded-lg p-4 bg-base-100/40">
                    <summary className="cursor-pointer font-medium flex items-center gap-2">
                      <span className="badge badge-secondary badge-xs" />
                      {intl.formatMessage({ defaultMessage: 'Can I submit keyboard scores?', id: '7/VMkx', description: 'FAQ question about keyboard scores' })}
                    </summary>
                    <div className="mt-3 text-base-content/70 leading-relaxed">
                      <p className="mb-4">
                        {intl.formatMessage(
                          {
                            defaultMessage:
                              "<strong>No.</strong> You're looking for Etterna instead. If you submitted a keyboard score by mistake it is your responsibility to delete it. If we notice users with too many keyboard scores, your scores may be wiped at an administrator's discretion.",
                            id: '8x/8+a',
                            description: 'FAQ answer about keyboard scores',
                          },
                          { strong: (txt) => <strong>{txt}</strong> },
                        )}
                      </p>
                    </div>
                  </details>
                  <details className="group border border-base-content/10 rounded-lg p-4 bg-base-100/40">
                    <summary className="cursor-pointer font-medium flex items-center gap-2">
                      <span className="badge badge-secondary badge-xs" />
                      {intl.formatMessage({
                        defaultMessage: 'My score failed to submit, what do I do?',
                        id: '9gCla1',
                        description: 'FAQ question about failed score submission',
                      })}
                    </summary>
                    <div className="mt-3 text-base-content/70 leading-relaxed">
                      <p className="mb-4">
                        {intl.formatMessage({
                          defaultMessage:
                            'If your score failed to submit, please check your internet connection. We do not accept manual score submissions. We will work to make sure our theme and module integrations handle retrying failed submissions, but that feature is currently not available.',
                          id: 'FEaNa1',
                          description: 'FAQ answer about failed submission - part 1',
                        })}
                      </p>
                      <p>
                        {intl.formatMessage({
                          defaultMessage:
                            "If Arrow Cloud is actually down, it means one of two things probably happened: either AWS is having an outage in our region, or a developer pushed a bad release. If this happens we may extend event deadlines to accommodate affected players. Again, we'll do our best to build our module and theme to handle resubmitting your scores automatically.",
                          id: 'DpZVFd',
                          description: 'FAQ answer about failed submission - part 2',
                        })}
                      </p>
                    </div>
                  </details>
                  <details className="group border border-base-content/10 rounded-lg p-4 bg-base-100/40">
                    <summary className="cursor-pointer font-medium flex items-center gap-2">
                      <span className="badge badge-secondary badge-xs" />
                      {intl.formatMessage({
                        defaultMessage: 'Blue Shift?',
                        id: 'UgVhWr',
                        description: 'FAQ question about Blue Shift',
                      })}
                    </summary>
                    <div className="mt-3 text-base-content/70 leading-relaxed">
                      <p className="mb-4">
                        {intl.formatMessage({
                          defaultMessage:
                            "Blue Shift was Arrow Cloud's inaugural event which ran from December 2025 to February 2026. You can view the results below.",
                          id: 'eA3EeG',
                          description: 'FAQ answer about failed submission - part 1',
                        })}
                      </p>
                      <p>
                        <a href="/blueshift-results" className="btn btn-sm btn-secondary">
                          {intl.formatMessage({
                            defaultMessage: 'View Blue Shift Results',
                            id: 'wl0L1c',
                            description: 'Link text to view Blue Shift results',
                          })}
                        </a>
                      </p>
                    </div>
                  </details>
                </div>
              </SectionCard>
            </main>
          </div>
        </div>
      </div>
    </AppPageLayout>
  );
};

export default HelpPage;
