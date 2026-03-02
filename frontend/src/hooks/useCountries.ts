import { useState, useEffect } from 'react';
import { getCountries, type Country } from '../services/api';

interface UseCountriesResult {
  countries: Country[];
  loading: boolean;
  error: string | null;
}

export const useCountries = (): UseCountriesResult => {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCountries = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getCountries();
        setCountries(response.countries);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch countries');
        console.error('Error fetching countries:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCountries();
  }, []);

  return { countries, loading, error };
};
