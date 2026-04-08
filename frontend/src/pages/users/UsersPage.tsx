import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';
import { useUserList, useDebounce, useCountries } from '../../hooks';
import { UserListItem } from '../../schemas/apiSchemas';
import { AppPageLayout, Pagination, ProfileAvatar } from '../../components';
import { FormattedMessage, useIntl } from 'react-intl';

interface UserTableHeaderProps {
  label: string;
  sortKey: string;
  currentOrderBy: string;
  currentDirection: 'asc' | 'desc';
  onSort: (orderBy: string, direction: 'asc' | 'desc') => void;
}

const UserTableHeader: React.FC<UserTableHeaderProps> = ({ label, sortKey, currentOrderBy, currentDirection, onSort }) => {
  const isActive = currentOrderBy === sortKey;
  const nextDirection = isActive && currentDirection === 'asc' ? 'desc' : 'asc';

  return (
    <th className="cursor-pointer hover:bg-base-300/50 transition-colors select-none px-4 py-3" onClick={() => onSort(sortKey, nextDirection)}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-base-content">{label}</span>
        <div className="flex flex-col">
          <ChevronUp size={12} className={`${isActive && currentDirection === 'asc' ? 'text-primary' : 'text-base-content/30'}`} />
          <ChevronDown size={12} className={`${isActive && currentDirection === 'desc' ? 'text-primary' : 'text-base-content/30'} -mt-1`} />
        </div>
      </div>
    </th>
  );
};

interface UserRowProps {
  user: UserListItem;
  onClick: (userId: string) => void;
}

const UserRow: React.FC<UserRowProps> = ({ user, onClick }) => {
  return (
    <tr className="hover:bg-base-200/50 transition-colors cursor-pointer" onClick={() => onClick(user.id)}>
      <td className="px-4 py-5">
        <div className="flex items-center gap-4">
          <ProfileAvatar profileImageUrl={user.profileImageUrl} alias={user.alias} size="md" />
          <span className="font-medium text-base-content text-lg">{user.alias}</span>
        </div>
      </td>
      <td className="px-4 py-5 text-sm text-base-content/70">{user.country || ''}</td>
      <td className="px-4 py-5 text-sm text-base-content/70">{new Date(user.createdAt).toLocaleDateString()}</td>
    </tr>
  );
};

export const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [selectedCountryId, setSelectedCountryId] = useState<number | undefined>(undefined);
  const debouncedSearch = useDebounce(searchInput, 300);
  const [searchCallCounter, setSearchCallCounter] = useState(0);
  const { formatMessage } = useIntl();

  const { countries } = useCountries();
  const { users, meta, filters, loading, error, setSearch, setCountryId, setOrderBy, setOrderDirection, setPage, refresh } = useUserList();

  useEffect(() => {
    // Hack to prevent a second API call on first render
    if (debouncedSearch.trim() === '' && searchCallCounter === 0) {
      setSearchCallCounter((prev) => prev + 1);
      return;
    }
    setSearch(debouncedSearch);
  }, [debouncedSearch]);

  const handleSort = (orderBy: string, direction: 'asc' | 'desc') => {
    setOrderBy(orderBy);
    setOrderDirection(direction);
  };

  const handleUserClick = (userId: string) => {
    navigate(`/user/${userId}`);
  };

  if (error) {
    return (
      <AppPageLayout>
        <div className="container mx-auto px-4">
          <div className="card bg-base-100/40 backdrop-blur-sm shadow-xl">
            <div className="card-body">
              <div className="alert alert-error">
                <span>
                  <FormattedMessage
                    defaultMessage="Error loading users: {error}"
                    id="AbjsQp"
                    description="Error message for when the users page fails to load"
                    values={{ error }}
                  />
                </span>
                <button className="btn btn-sm" onClick={refresh}>
                  <FormattedMessage defaultMessage="Retry" id="80Vzt6" description="Button label to retry loading" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout>
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center my-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            <FormattedMessage defaultMessage="Users" id="zb/rKC" description="Title for the users page" />
          </h1>
        </div>

        {/* Main Content Card */}
        <div className="card bg-base-100/60 backdrop-blur-sm shadow-xl">
          <div className="card-body">
            {/* Search and Filters */}
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="relative flex-grow max-w-md">
                  <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50" />
                  <input
                    type="text"
                    placeholder={formatMessage({
                      defaultMessage: 'Search users...',
                      id: 'AAP0Lq',
                      description: 'Placeholder text for the search input on the users page',
                    })}
                    className="input input-bordered w-full pl-10 bg-base-100/60 focus:outline-none"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                  {loading && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <span className="loading loading-spinner loading-sm"></span>
                    </div>
                  )}
                </div>

                <select
                  className="select select-bordered bg-base-100/60 min-w-[160px]"
                  value={selectedCountryId ?? ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    setSelectedCountryId(value);
                    setCountryId(value);
                  }}
                >
                  <option value="">
                    {formatMessage({
                      defaultMessage: 'All Countries',
                      id: 'LnQ8ys',
                      description: 'Option to show users from all countries',
                    })}
                  </option>
                  {countries.map((country) => (
                    <option key={country.id} value={country.id}>
                      {country.name}
                    </option>
                  ))}
                </select>

                {meta && (
                  <div className="text-sm text-base-content/70">
                    <FormattedMessage
                      defaultMessage="Showing {shown,number} of {total,number} users"
                      id="HSLoUA"
                      description="Text showing how many users are currently displayed out of the total available"
                      values={{ shown: users.length, total: meta.total }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg">
              <table className="table table-zebra w-full bg-base-100 border border-base-content/10">
                <thead className="bg-base-200/80">
                  <tr>
                    <UserTableHeader
                      label={formatMessage({ defaultMessage: 'User', id: 'ZG7hLb', description: 'Table header for the user name' })}
                      sortKey="alias"
                      currentOrderBy={filters?.orderBy || 'createdAt'}
                      currentDirection={(filters?.orderDirection as 'asc' | 'desc') || 'desc'}
                      onSort={handleSort}
                    />
                    <th className="px-4 py-3">
                      <span className="font-semibold text-base-content">
                        {formatMessage({ defaultMessage: 'Country', id: 'vGgqg5', description: 'Table header for the country' })}
                      </span>
                    </th>
                    <UserTableHeader
                      label={formatMessage({ defaultMessage: 'Joined', id: 'j87Gi0', description: 'Table header for the join date' })}
                      sortKey="createdAt"
                      currentOrderBy={filters?.orderBy || 'createdAt'}
                      currentDirection={(filters?.orderDirection as 'asc' | 'desc') || 'desc'}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody className={loading ? 'opacity-50' : ''}>
                  {users.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={3} className="text-center py-12 text-base-content/50">
                        {filters?.search
                          ? formatMessage(
                              {
                                defaultMessage: `No users found matching "{search}"`,
                                id: 'g8JAUX',
                                description: 'Displayed when no users match the search query',
                              },
                              { search: filters.search },
                            )
                          : formatMessage({
                              defaultMessage: 'No users available',
                              id: '8IH2Xh',
                              description: 'Displayed when there are no users available',
                            })}
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => <UserRow key={user.id} user={user} onClick={handleUserClick} />)
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {meta && <Pagination meta={meta} onPageChange={setPage} />}
          </div>
        </div>
      </div>
    </AppPageLayout>
  );
};
