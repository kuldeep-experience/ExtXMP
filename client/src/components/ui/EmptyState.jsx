import Card from './Card.jsx';

export default function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <Card className={`flex flex-col items-center px-6 py-12 text-center ${className}`}>
      {Icon && <Icon className="h-10 w-10 text-slate-300" />}
      <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}
