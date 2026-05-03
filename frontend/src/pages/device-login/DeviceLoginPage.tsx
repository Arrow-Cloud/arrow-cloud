import React, { useEffect, useMemo, useState } from 'react';
import { useIntl, FormattedMessage, FormattedDate, FormattedTime } from 'react-intl';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { QrCode, ShieldCheck, CircleAlert, RotateCcw, CheckCircle2, Clock3 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { approveDeviceLoginSession, getDeviceLoginSession, type DeviceLoginSessionResponse } from '../../services/api';

const DeviceLoginPage: React.FC = () => {
  const { formatMessage } = useIntl();
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [session, setSession] = useState<DeviceLoginSessionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = async () => {
    if (!sessionId) {
      setError(
        formatMessage({
          defaultMessage: 'Invalid device login session.',
          id: 'yt+/RO',
          description: 'Error shown when session ID path param is missing on device login page',
        }),
      );
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await getDeviceLoginSession(sessionId);
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  const handleApprove = async () => {
    if (!sessionId) return;

    setIsApproving(true);
    setError(null);

    try {
      const data = await approveDeviceLoginSession(sessionId);
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApproving(false);
    }
  };

  const handleLogin = () => {
    navigate('/login', {
      state: {
        from: {
          pathname: location.pathname,
        },
      },
    });
  };

  const isTerminalStatus = useMemo(() => {
    return !!session && ['consumed', 'cancelled', 'expired'].includes(session.status);
  }, [session]);

  return (
    <div className="min-h-screen pt-28 pb-12 px-4">
      <div className="mx-auto w-full max-w-xl">
        <div className="card bg-base-100/90 shadow-xl border border-base-content/10">
          <div className="card-body p-6 md:p-8 gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/15 text-primary">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-base-content">
                  <FormattedMessage defaultMessage="Device Login" id="v3STVc" description="Simple heading for device login approval page" />
                </h1>
              </div>
            </div>

            {isLoading && (
              <div className="flex items-center gap-3 text-base-content/70">
                <span className="loading loading-spinner loading-sm" />
                <span>
                  <FormattedMessage defaultMessage="Loading request…" id="+wThsM" description="Loading text while fetching device login session" />
                </span>
              </div>
            )}

            {!isLoading && error && (
              <div role="alert" className="alert alert-error">
                <CircleAlert className="w-5 h-5" />
                <span>{error}</span>
              </div>
            )}

            {!isLoading && session && (
              <>
                <div className="rounded-xl border border-base-content/10 bg-base-200/70 p-4 space-y-2">
                  <p className="text-xl font-mono font-semibold tracking-widest">{session.shortCode}</p>

                  {session.machineLabel && <p className="text-sm text-base-content/80">{session.machineLabel}</p>}

                  <p className="text-xs text-base-content/60 flex items-center gap-2">
                    <Clock3 className="w-4 h-4" />
                    <FormattedMessage
                      defaultMessage="Expires {date} {time}"
                      id="cIL55Q"
                      description="Expiry timestamp line for device login request"
                      values={{
                        date: <FormattedDate value={new Date(session.expiresAt)} year="numeric" month="short" day="2-digit" />,
                        time: <FormattedTime value={new Date(session.expiresAt)} hour="numeric" minute="2-digit" second="2-digit" />,
                      }}
                    />
                  </p>
                </div>

                {session.status === 'pending' && !user && (
                  <div className="space-y-3">
                    <button className="btn btn-primary w-full" onClick={handleLogin}>
                      <ShieldCheck className="w-4 h-4" />
                      <FormattedMessage defaultMessage="Sign In" id="YaQUb1" description="Button label to sign in from device login approval page" />
                    </button>
                  </div>
                )}

                {session.status === 'pending' && user && (
                  <div className="space-y-3">
                    <button className="btn btn-primary w-full" onClick={handleApprove} disabled={isApproving}>
                      {isApproving ? (
                        <>
                          <span className="loading loading-spinner loading-sm" />
                          {formatMessage({
                            defaultMessage: 'Approving…',
                            id: 'ca3iDw',
                            description: 'Button label while approving device login',
                          })}
                        </>
                      ) : (
                        <FormattedMessage defaultMessage="Approve Login" id="r2SD/r" description="Primary button label to approve device login" />
                      )}
                    </button>
                  </div>
                )}

                {session.status === 'approved' && (
                  <div role="alert" className="alert alert-success">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>
                      <FormattedMessage
                        defaultMessage="Approved. Return to game."
                        id="8Br9Yc"
                        description="Success message shown after browser approval while game still polling"
                      />
                    </span>
                  </div>
                )}

                {session.status === 'consumed' && (
                  <div role="alert" className="alert alert-success">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>
                      <FormattedMessage
                        defaultMessage="Login completed on game client."
                        id="V9Qz6n"
                        description="Message shown when device login request has already been consumed"
                      />
                    </span>
                  </div>
                )}

                {session.status === 'expired' && (
                  <div role="alert" className="alert alert-warning">
                    <CircleAlert className="w-5 h-5" />
                    <span>
                      <FormattedMessage
                        defaultMessage="Request expired. Start a new login in game."
                        id="mWZvu2"
                        description="Message shown when device login request is expired"
                      />
                    </span>
                  </div>
                )}

                {session.status === 'cancelled' && (
                  <div role="alert" className="alert alert-warning">
                    <CircleAlert className="w-5 h-5" />
                    <span>
                      <FormattedMessage defaultMessage="Request cancelled." id="Bkfjgm" description="Message shown when device login request was cancelled" />
                    </span>
                  </div>
                )}

                {!isTerminalStatus && (
                  <button className="btn btn-ghost btn-sm w-fit" onClick={fetchSession} disabled={isLoading}>
                    <RotateCcw className="w-4 h-4" />
                    <FormattedMessage defaultMessage="Refresh Status" id="p+CuwE" description="Button label to refresh device login session status" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceLoginPage;
