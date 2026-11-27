const dateOpts = { year: 'numeric', month: 'short', day: 'numeric' };
export const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, dateOpts);
export const fmtDateTime = (d) => new Date(d).toLocaleString(undefined, { ...dateOpts, hour: 'numeric', minute: '2-digit' });
export const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const fmtWeekday = (d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
// <input type="datetime-local"> works in the visitor's local time: convert both ways.
export const toLocalInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
export const greeting = (d = new Date()) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening');
