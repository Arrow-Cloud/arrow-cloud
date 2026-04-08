import React from 'react';
import { AppPageLayout } from '../../components';
import { FormattedMessage } from 'react-intl';

const lastUpdated = new Date('2025-11-29');

export const PrivacyPolicyPage: React.FC = () => {
  return (
    <AppPageLayout className="pb-0" accent="info">
      <div>
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="card bg-base-200/60 backdrop-blur-sm border border-base-content/10 shadow-md rounded-xl p-8" data-testid="privacy-card">
            <header className="mb-8">
              <h1 className="text-3xl font-bold mb-2 text-base-content">
                <FormattedMessage defaultMessage="Privacy Policy" description="Page title for the privacy policy page" id="/c0R5m" />
              </h1>
              <p className="text-sm text-base-content/60">
                <FormattedMessage
                  defaultMessage="Last updated: {lastUpdated,date}"
                  description="Date when the privacy policy was last updated"
                  id="1CBPXl"
                  values={{ lastUpdated }}
                />
              </p>
            </header>

            <section aria-labelledby="summary-heading" className="mb-8" data-testid="privacy-summary">
              <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed">
                <li>
                  <FormattedMessage
                    defaultMessage="We collect only: your email address, your chosen alias (display name), and your country if you optionally provide it."
                    description="Summary point about data collection"
                    id="gJs2Fl"
                  />
                </li>
                <li>
                  <FormattedMessage
                    defaultMessage="Your email is used only for account security actions (such as password resets), and occasional announcements."
                    description="Summary point about email usage"
                    id="2hFzLG"
                  />
                </li>
                <li>
                  <FormattedMessage
                    defaultMessage="We do not use any tracking cookies or similar technologies."
                    description="Summary point about tracking technologies"
                    id="qYK6Ec"
                  />
                </li>
              </ul>
            </section>

            <hr className="border-base-content/10 mb-8" />

            <section aria-labelledby="detailed-heading" className="space-y-6" data-testid="privacy-detailed">
              <p className="text-sm leading-relaxed text-base-content">
                <FormattedMessage
                  defaultMessage="Arrow Cloud (the 'Service') processes minimal personal data. The only personal data categories retained are: (1) email address, (2) user-selected alias, and (3) optional country designation. Email addresses are used exclusively for security and account lifecycle purposes, including password reset and verification workflows. Aliases are publicly displayed on site interfaces and in in-game leaderboard integrations. Country information, when provided, is displayed solely on the user’s profile page and not elsewhere."
                  description="Detailed explanation of data processing and retention"
                  id="h1j+Ft"
                />
              </p>
              <p className="text-sm leading-relaxed text-base-content">
                <FormattedMessage
                  defaultMessage="We do not sell or rent personal data. Passwords are stored using industry-standard salted hashing. Direct database access is restricted to authorized site administrators. From time to time, anonymized database exports (with direct identifiers removed) may be published or distributed for backup, archival, analytical, or restoration purposes."
                  description="Detailed explanation of data security and database access"
                  id="QJ79vt"
                />
              </p>
              <p className="text-sm leading-relaxed text-base-content">
                <FormattedMessage
                  defaultMessage="An account deletion request requires proof of control over the email associated with the account (for example, responding from that address or completing a verification step). Upon verified deletion request, personal data will be removed or irreversibly anonymized subject to any system integrity or anti-abuse safeguards. You may request account deletion by emailing support (at) arrowcloud (dot) dance, or reaching out to an administrator on our Discord Server."
                  description="Detailed explanation of account deletion process"
                  id="NbqIsv"
                />
              </p>
              <p className="text-sm leading-relaxed text-base-content">
                <FormattedMessage
                  defaultMessage="We currently use no advertising or third-party tracking scripts, or third-party tracking services."
                  description="Statement about advertising and tracking scripts"
                  id="9KiYOr"
                />
              </p>
              <p className="text-sm leading-relaxed text-base-content">
                <FormattedMessage
                  defaultMessage="Notifications of updates to this privacy policy will be sent via email, announced on Discord, and posted on our website."
                  description="Statement about how privacy policy updates are communicated"
                  id="OrEocL"
                />
              </p>
            </section>
          </div>
        </div>
      </div>
    </AppPageLayout>
  );
};

export default PrivacyPolicyPage;
