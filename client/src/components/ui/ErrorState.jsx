import { TriangleAlert } from 'lucide-react';
import Button from './Button.jsx';
import Card from './Card.jsx';

export default function ErrorState({ message, onRetry, className = '' }) {
  return (
    <Card className={`flex flex-col items-center px-6 py-10 text-center ${className}`} role="alert">
      <TriangleAlert className="h-9 w-9 text-red-400" />
      <p className="mt-3 text-sm text-red-700">{message || 'Something went wrong.'}</p>
      {onRetry && <Button className="mt-3" size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}
    </Card>
  );
}
