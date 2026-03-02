import React from 'react';
import { Link } from 'react-router-dom';
import { Settings, HelpCircle } from 'lucide-react';
import { FormattedMessage } from 'react-intl';
import { DiscordIcon } from '../../../components/icons/DiscordIcon';

export const SetupAndSupportCards: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Setup Card */}
      <div className="card bg-gradient-to-br from-base-100 via-base-100/90 to-secondary/10 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:shadow-secondary/20 border border-secondary/20 hover:border-secondary/40 transition-all duration-500 group">
        <div className="card-body">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-secondary/20 to-secondary/10 rounded-lg group-hover:from-secondary/30 group-hover:to-secondary/20 transition-all duration-300">
              <Settings className="w-6 h-6 text-secondary group-hover:rotate-180 transition-transform duration-500" />
            </div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-secondary to-accent bg-clip-text text-transparent">
              <FormattedMessage defaultMessage="Get Set Up" id="1cI8ug" description="section heading on the homepage" />
            </h2>
          </div>

          <div className="space-y-4 flex-1">
            <p className="text-base text-base-content/80 leading-relaxed">
              <FormattedMessage
                defaultMessage="Ready to start tracking your scores? Get set up now to connect your game and start competing on the leaderboards!"
                id="i/TsED"
                description="section text on the homepage"
              />
            </p>

            <div className="pt-4 text-center">
              <Link
                to="/help#setup"
                className="btn btn-md gap-2 bg-gradient-to-r from-secondary to-accent hover:from-secondary/90 hover:to-accent/90 text-white border-0 hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl group"
                onClick={() => {
                  try {
                    sessionStorage.setItem('pendingHelpHash', '#setup');
                  } catch {}
                }}
              >
                <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                <span>
                  <FormattedMessage defaultMessage="Setup Instructions" id="iYr7vn" description="button label on the homepage, links to setup help" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Support & Community Card */}
      <div className="card bg-gradient-to-br from-base-100 via-base-100/90 to-success/10 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:shadow-success/20 border border-success/20 hover:border-success/40 transition-all duration-500 group">
        <div className="card-body">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-success/20 to-success/10 rounded-lg group-hover:from-success/30 group-hover:to-success/20 transition-all duration-300">
              <HelpCircle className="w-6 h-6 text-success group-hover:animate-pulse" />
            </div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-success to-info bg-clip-text text-transparent">
              <FormattedMessage defaultMessage="Support" id="3oeumn" description="section heading on the homepage" />
            </h2>
          </div>

          <div className="space-y-4 flex-1">
            <div className="flex flex-col gap-4">
              <a
                href="https://discord.gg/6WfRgMCFX4"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-md gap-2 bg-gradient-to-r from-success to-info hover:from-success/90 hover:to-info/90 text-white border-0 hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl group"
              >
                <DiscordIcon className="w-5 h-5 group-hover:animate-bounce" />
                <span>
                  <FormattedMessage defaultMessage="Join Discord" id="gKcS+F" description="button label on the homepage" />
                </span>
              </a>

              <Link
                to="/help"
                className="btn btn-outline btn-md gap-2 border-2 border-info/60 hover:border-info hover:bg-info/10 hover:scale-105 transition-all duration-300 group"
              >
                <HelpCircle className="w-5 h-5 group-hover:animate-spin" />
                <span>
                  <FormattedMessage defaultMessage="Help & FAQs" id="lcVOiv" description="button label on the homepage" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
