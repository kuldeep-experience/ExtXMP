import { render, screen } from '@testing-library/react';
import { Badge, Button } from '../src/components/ui/index.js';

test('Button renders its label', () => {
  render(<Button>Save</Button>);
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
});

test('Button is disabled while loading', () => {
  render(<Button loading>Save</Button>);
  expect(screen.getByRole('button')).toBeDisabled();
});

test('Badge renders text', () => {
  render(<Badge>New</Badge>);
  expect(screen.getByText('New')).toBeInTheDocument();
});
