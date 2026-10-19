import { useLocation } from 'react-router-dom';

// Renders the current URL (path + search) so tests can assert on what a
// page wrote to the URL — e.g. list filters — without a real browser bar.
export function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}
