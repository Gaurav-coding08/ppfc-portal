import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API } from '@/test/handlers';
import { filterOptionsResponse, projectListItem } from '@/test/fixtures/projects';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { ProjectsListPage } from './ProjectsListPage';

// Every `GET /projects` query string the page sent, in order — the
// network-level proof of which filters the page applied.
let listRequests: URLSearchParams[];

beforeEach(() => {
  listRequests = [];
  server.use(
    http.get(`${API}/projects`, ({ request }) => {
      listRequests.push(new URL(request.url).searchParams);
      return HttpResponse.json({ data: [projectListItem], meta: { page: 1, pageSize: 20, total: 1 } });
    }),
    http.get(`${API}/dashboard/filters`, () => HttpResponse.json(filterOptionsResponse)),
  );
});

const location = () => screen.getByTestId('location').textContent;

describe('ProjectsListPage', () => {
  it('reads filters, sort and page from the URL on load and sends them to the API', async () => {
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    renderWithProviders(<ProjectsListPage />, {
      route:
        '/projects?q=portal&status=on_hold&departmentId=2&startFrom=2026-01-01&sort=name&order=desc&page=2',
    });

    expect(await screen.findByText('Digital Platforms Modernization')).toBeInTheDocument();
    const sent = listRequests.at(-1)!;
    expect(sent.get('q')).toBe('portal');
    expect(sent.get('status')).toBe('on_hold');
    expect(sent.get('departmentId')).toBe('2');
    expect(sent.get('startFrom')).toBe('2026-01-01');
    expect(sent.get('sort')).toBe('name');
    expect(sent.get('order')).toBe('desc');
    expect(sent.get('page')).toBe('2');

    // …and the controls reflect the URL, as they would after a reload.
    expect(screen.getByLabelText('Search projects…')).toHaveValue('portal');
    expect(screen.getByLabelText('Starts on or after')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('Status')).toHaveTextContent('On hold');
    await waitFor(() => expect(screen.getByLabelText('Department')).toHaveTextContent('Network Engineering'));
  });

  it('writes search (debounced) and sort changes to the URL and resets the page', async () => {
    const user = userEvent.setup();
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    renderWithProviders(<ProjectsListPage />, { route: '/projects?page=3' });
    await screen.findByText('Digital Platforms Modernization');

    await user.type(screen.getByLabelText('Search projects…'), 'network');
    await waitFor(() => expect(location()).toBe('/projects?q=network'));
    await waitFor(() => expect(listRequests.at(-1)!.get('q')).toBe('network'));

    await user.click(screen.getByRole('button', { name: /^Name/ }));
    await waitFor(() => expect(location()).toBe('/projects?q=network&sort=name'));
    await user.click(screen.getByRole('button', { name: /^Name/ }));
    await waitFor(() => expect(location()).toBe('/projects?q=network&sort=name&order=desc'));
    await waitFor(() => expect(listRequests.at(-1)!.get('order')).toBe('desc'));
  });

  it('hides "New project" for a contributor', async () => {
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    renderWithProviders(<ProjectsListPage />, { route: '/projects' });
    await screen.findByText('Digital Platforms Modernization');
    expect(screen.queryByRole('button', { name: /New project/ })).not.toBeInTheDocument();
  });

  it('shows "New project" for a project manager', async () => {
    mockSession('project_manager');
    renderWithProviders(<ProjectsListPage />, { route: '/projects' });
    expect(await screen.findByRole('button', { name: /New project/ })).toBeInTheDocument();
  });
});
