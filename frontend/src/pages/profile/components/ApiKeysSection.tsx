import React, { useEffect, useState } from 'react';
import { Key, Plus, Trash2, Copy } from 'lucide-react';
import { listApiKeys as listKeysApi, createApiKey as createKeyApi, deleteApiKey as deleteKeyApi } from '../../../services/api';
import { FormattedMessage } from 'react-intl';

type UiKey = {
  id: string; // keyHash
  createdAt: string;
  fingerprint: string;
  lastUsedAt?: string | null;
};

const ApiKeysSection: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<UiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { apiKeys } = await listKeysApi();
        if (mounted) setApiKeys(apiKeys.map((k) => ({ id: k.id, createdAt: k.createdAt, fingerprint: k.fingerprint, lastUsedAt: k.lastUsedAt ?? null })));
      } catch (e: any) {
        if (mounted) setError(e.message || 'Failed to load API keys');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleCreateApiKey = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await createKeyApi();
      setApiKeys((prev) => [
        ...prev,
        { id: res.apiKey.id, createdAt: res.apiKey.createdAt, fingerprint: res.apiKey.fingerprint, lastUsedAt: res.apiKey.lastUsedAt ?? null },
      ]);
      setNewKeyPlaintext(res.key);
    } catch (e: any) {
      setError(e.message || 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) return;
    try {
      await deleteKeyApi(keyId);
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch (e: any) {
      setError(e.message || 'Failed to delete API key');
    }
  };

  const copyNewKey = async () => {
    if (!newKeyPlaintext) return;
    try {
      await navigator.clipboard.writeText(newKeyPlaintext);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (loading)
    return (
      <div className="animate-pulse text-sm">
        <FormattedMessage defaultMessage="Loading API keys..." description="Loading message shown while API keys are being fetched" id="FBQiEB" />
      </div>
    );

  return (
    <div>
      <p className="mb-4">
        <FormattedMessage
          defaultMessage="API Keys are used to connect your game client to our servers to submit scores."
          description="Description about API keys usage"
          id="pveInw"
        />
      </p>

      <div className="flex items-center justify-end mb-4 gap-2">
        {error && <div className="text-error text-sm mr-auto">{error}</div>}
        <button onClick={handleCreateApiKey} className="btn btn-primary btn-sm" disabled={creating}>
          <Plus className="w-4 h-4" />
          {creating ? (
            <FormattedMessage defaultMessage="Creating..." description="Button label shown when creating a new API key" id="cEZoTR" />
          ) : (
            <FormattedMessage defaultMessage="Create Key" description="Button label for creating a new API key" id="Q0d0pT" />
          )}
        </button>
      </div>

      {newKeyPlaintext && (
        <div className="alert alert-success mb-4 w-full">
          <div className="flex flex-col gap-2 w-full">
            <div className="font-semibold">
              <FormattedMessage defaultMessage="New API Key" description="Label for new API key display" id="dsUKTu" />
            </div>
            <div className="flex items-center gap-2 w-full">
              <input
                type="text"
                readOnly
                value={newKeyPlaintext}
                className="input input-bordered w-full font-mono text-sm select-all text-primary"
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.currentTarget.select()}
              />
              <div className={`tooltip ${copied ? 'tooltip-open' : ''}`} data-tip={copied ? 'Copied' : ''}>
                <button className="btn btn-outline btn-sm" onClick={copyNewKey}>
                  <Copy className="w-3 h-3 mr-1" />
                  <FormattedMessage defaultMessage="Copy" description="Button label for copying the new API key" id="X6xwCH" />
                </button>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setNewKeyPlaintext(null)}>
                <FormattedMessage defaultMessage="Dismiss" description="Button label for dismissing the new API key display" id="E2VFjz" />
              </button>
            </div>
            <div className="text-xs opacity-70">
              <FormattedMessage
                defaultMessage="This key will only be shown once. Copy and store it securely."
                description="Warning message shown when displaying a new API key"
                id="jIZqAg"
              />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {apiKeys.map((apiKey) => (
          <div key={apiKey.id} className="card bg-base-200/50 border border-base-300/50">
            <div className="card-body p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold">
                    <FormattedMessage
                      defaultMessage="Key • {fingerprint}"
                      description="Label showing the API key fingerprint"
                      id="it89I1"
                      values={{ fingerprint: apiKey.fingerprint }}
                    />
                  </h3>
                  <div className="flex flex-col gap-1 mt-1">
                    <p className="text-xs text-base-content/60">
                      <FormattedMessage
                        defaultMessage="Created: {created,date}"
                        description="Label showing the creation date of an API key"
                        id="kjF7Lj"
                        values={{ created: new Date(apiKey.createdAt) }}
                      />
                    </p>
                    <p className="text-xs text-base-content/60">
                      {apiKey.lastUsedAt ? (
                        <FormattedMessage
                          defaultMessage="Last used: {lastUsed,date}"
                          description="Label showing the last used date of an API key"
                          id="iaN1LS"
                          values={{ lastUsed: new Date(apiKey.lastUsedAt) }}
                        />
                      ) : (
                        <FormattedMessage defaultMessage="Never" description="Label shown when an API key has never been used" id="DPOFoY" />
                      )}
                    </p>
                  </div>
                </div>
                <button onClick={() => handleDeleteApiKey(apiKey.id)} className="btn btn-ghost btn-sm text-error hover:bg-error/20">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {apiKeys.length === 0 && (
        <div className="text-center py-8 text-base-content/60">
          <Key className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>
            <FormattedMessage defaultMessage="No API keys created yet" description="Message shown when there are no API keys created" id="g0JMrv" />
          </p>
        </div>
      )}
    </div>
  );
};

export default ApiKeysSection;
