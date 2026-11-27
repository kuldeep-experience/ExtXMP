export default function Card({ title, action, className = '', children, ...rest }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`} {...rest}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between">
          {title && <h3 className="text-base font-semibold text-slate-900">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
