import React, { useState, useEffect, useCallback } from 'react';
import { UserCheck, Trash2, Search } from 'lucide-react';
import { Alert } from '../../../components/ui';
import { listRivals, addRival, deleteRival, autocompleteUsers, type RivalEntry } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { FormattedMessage, useIntl } from 'react-intl';

const RivalsSection: React.FC = () => {
  const [rivals, setRivals] = useState<RivalEntry[]>([]);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<RivalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const { formatMessage } = useIntl();

  const { user, updateUser } = useAuth();

  // Helper: push updated rival ids into auth context (no network)
  const syncContextRivals = useCallback(
    (ids: string[]) => {
      if (!user) return;
      // avoid unnecessary re-renders if identical (order-insensitive)
      const current = (user as any).rivalUserIds as string[] | undefined;
      const normalizedNew = [...ids].sort();
      const normalizedCurrent = current ? [...current].sort() : [];
      const same = normalizedNew.length === normalizedCurrent.length && normalizedNew.every((v, i) => v === normalizedCurrent[i]);
      if (same) return;
      updateUser({ ...(user as any), rivalUserIds: ids });
    },
    [user, updateUser],
  );

  // Load rivals on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const { rivals } = await listRivals();
        if (!active) return;
        setRivals(rivals);
        syncContextRivals(rivals.map((r) => r.userId));
      } catch (e: any) {
        if (!active) return;
        setError(e.message || 'Failed to load rivals');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [syncContextRivals]);

  // Debounced autocomplete
  useEffect(() => {
    if (search.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const { users } = await autocompleteUsers(search.trim());
        setSuggestions(users);
      } catch (e) {
        console.error('Autocomplete error', e);
      }
    }, 300);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [search]);

  const handleAddRival = useCallback(
    async (r: { rivalUserId?: string; rivalAlias?: string }) => {
      try {
        setAdding(true);
        const { rival } = await addRival(r);
        // Prevent duplicate UI entry
        setRivals((prev) => {
          if (prev.find((x) => x.userId === rival.userId)) return prev;
          const updated = [...prev, { ...rival, createdAt: new Date().toISOString() }];
          // sync context
          syncContextRivals(updated.map((x) => x.userId));
          return updated;
        });
        setLastAddedId(rival.userId);
        setSearch('');
        setSuggestions([]);
      } catch (e: any) {
        setError(e.message || 'Failed to add rival');
      } finally {
        setAdding(false);
      }
    },
    [syncContextRivals],
  );

  const handleRemoveRival = useCallback(
    async (userId: string) => {
      setPendingRemove(userId);
      const prev = rivals;
      setRivals((r) => {
        const updated = r.filter((x) => x.userId !== userId);
        syncContextRivals(updated.map((x) => x.userId));
        return updated;
      });
      try {
        await deleteRival(userId);
      } catch (e) {
        // rollback
        setRivals(prev);
        syncContextRivals(prev.map((x) => x.userId));
        setError(e instanceof Error ? e.message : 'Failed to remove rival');
      } finally {
        setPendingRemove(null);
      }
    },
    [rivals, syncContextRivals],
  );

  return (
    <div>
      {error && (
        <Alert variant="error" className="mb-4">
          <span>{error}</span>
        </Alert>
      )}

      <p className="mb-4">
        <FormattedMessage
          defaultMessage="Rivals are other players you want to keep a close eye on, and/or compete with. Rivals will be highlighted and prioritized when viewing various leaderboards."
          description="Description of the rivals section on the profile page"
          id="lzqhT9"
        />
      </p>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1" htmlFor="rival-search">
          <FormattedMessage defaultMessage="Add Rival" description="Label for the add rival input field" id="AGRuvQ" />
        </label>
        <div className="relative">
          <input
            id="rival-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={formatMessage({
              defaultMessage: 'Search user alias (min 2 chars)',
              id: 'Qpj9Z+',
              description: 'Placeholder for the add rival input field',
            })}
            className="input input-bordered w-full pr-9"
          />
          <Search className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 opacity-60" />
        </div>
        {suggestions.length > 0 && (
          <div className="mt-2 border rounded-md bg-base-200 divide-y max-h-64 overflow-auto shadow">
            {suggestions.map((s) => (
              <button
                key={s.userId}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-base-300/60 disabled:opacity-50"
                disabled={adding}
                onClick={() => handleAddRival({ rivalUserId: s.userId })}
              >
                <span>{s.alias}</span>
                {lastAddedId === s.userId && (
                  <span className="text-xs text-success">
                    <FormattedMessage defaultMessage="Added" description="Indicates that a rival has been added" id="1IiFi6" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {loading && (
          <div className="text-sm text-base-content/60">
            <FormattedMessage defaultMessage="Loading rivals..." description="Loading rivals indicator" id="bxd/mE" />
          </div>
        )}
        {!loading &&
          rivals
            .slice()
            .sort((a, b) => a.alias.localeCompare(b.alias))
            .map((rival) => (
              <div key={rival.userId} className="flex items-center justify-between p-3 bg-base-200/50 rounded-lg border border-base-300/50">
                <div>
                  <h3 className="font-semibold">{rival.alias}</h3>
                  <p className="text-xs text-base-content/60">
                    <FormattedMessage
                      defaultMessage="Added: {added,date}"
                      description="Date when a rival was added"
                      id="AhjRKO"
                      values={{ added: rival.createdAt ? new Date(rival.createdAt) : undefined }}
                    />
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveRival(rival.userId)}
                  disabled={pendingRemove === rival.userId}
                  className="btn btn-ghost btn-sm text-error hover:bg-error/20"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
      </div>

      {rivals.length === 0 && (
        <div className="text-center py-8 text-base-content/60">
          <UserCheck className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>
            <FormattedMessage defaultMessage="No rivals added yet" description="Description shown when no rivals have been added" id="5mntyH" />
          </p>
        </div>
      )}
    </div>
  );
};

export default RivalsSection;
