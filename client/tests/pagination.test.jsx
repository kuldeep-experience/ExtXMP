import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pagination, { pageWindow } from '../src/components/ui/Pagination.jsx';
import RatingStars from '../src/components/ui/RatingStars.jsx';

test('pageWindow stays within bounds', () => {
  expect(pageWindow(1, 10)).toEqual([1, 2, 3, 4, 5]);
  expect(pageWindow(10, 10)).toEqual([6, 7, 8, 9, 10]);
  expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
});

test('Pagination calls onChange and disables edges', async () => {
  const onChange = vi.fn();
  render(<Pagination page={1} totalPages={3} onChange={onChange} />);
  expect(screen.getByLabelText('Previous page')).toBeDisabled();
  await userEvent.click(screen.getByLabelText('Next page'));
  expect(onChange).toHaveBeenCalledWith(2);
});

test('Pagination renders nothing for a single page', () => {
  const { container } = render(<Pagination page={1} totalPages={1} onChange={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

test('RatingStars exposes an accessible label', () => {
  render(<RatingStars value={4.5} />);
  expect(screen.getByRole('img', { name: '4.5 out of 5 stars' })).toBeInTheDocument();
});
