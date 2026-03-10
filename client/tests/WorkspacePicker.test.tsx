import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspacePicker } from '../src/components/WorkspacePicker';

afterEach(() => {
  cleanup();
});

describe('WorkspacePicker', () => {
  it('filters workspaces and returns the selected item', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <WorkspacePicker
        open
        selectedPath={null}
          errorMessage={null}
          isBusy={false}
        onClose={vi.fn()}
          onAddCustomWorkspace={vi.fn()}
        onSelect={onSelect}
        workspaces={[
          { name: 'copilot-api-wrapper', path: '/home/user/copilot-api-wrapper' },
          { name: 'mobile-client', path: '/home/user/mobile-client' },
        ]}
      />,
    );

    await user.type(screen.getByPlaceholderText('Buscar por nome ou path...'), 'mobile');
    expect(screen.queryByText('copilot-api-wrapper')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /mobile-client/i }));

    expect(onSelect).toHaveBeenCalledWith({
      name: 'mobile-client',
      path: '/home/user/mobile-client',
    });
  });

  it('submits a custom workspace path', async () => {
    const user = userEvent.setup();
    const onAddCustomWorkspace = vi.fn();

    render(
      <WorkspacePicker
        open
        selectedPath={null}
        errorMessage={null}
        isBusy={false}
        onClose={vi.fn()}
        onAddCustomWorkspace={onAddCustomWorkspace}
        onSelect={vi.fn()}
        workspaces={[]}
      />,
    );

    await user.type(
      screen.getByPlaceholderText('Adicionar workspace customizado: /caminho/absoluto'),
      '/home/user/outro-projeto',
    );
    await user.click(screen.getByRole('button', { name: 'Salvar workspace' }));

    expect(onAddCustomWorkspace).toHaveBeenCalledWith('/home/user/outro-projeto');
  });
});