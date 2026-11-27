import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import { Button } from '../../components/ui/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { selectIsAuthenticated } from '../auth/authSlice.js';
import { fetchSavedIds, removeSaved, saveProfessional } from './savedSlice.js';

// variant "icon": round button for cards. variant "button": labelled button for the detail page.
export default function BookmarkButton({ professionalId, variant = 'icon', className = '' }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const authed = useSelector(selectIsAuthenticated);
  const savedId = useSelector((s) => s.saved.ids.map[professionalId]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (authed) dispatch(fetchSavedIds()); }, [authed, dispatch]);

  const toggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!authed) {
      toast.info('Log in to save professionals.');
      return navigate('/login', { state: { from: location } });
    }
    setBusy(true);
    try {
      if (savedId) { await dispatch(removeSaved({ id: savedId, professionalId })).unwrap(); toast.info('Removed from saved professionals.'); }
      else { await dispatch(saveProfessional({ professionalId })).unwrap(); toast.success('Saved. Organize it in My Saved Professionals.'); }
    } catch (err) {
      toast.error(err?.message || 'Could not update saved professionals');
    } finally { setBusy(false); }
  };

  const saved = !!savedId;
  if (variant === 'button') {
    return (
      <Button variant={saved ? 'primary' : 'secondary'} onClick={toggle} loading={busy} aria-pressed={saved} className={className}>
        <Bookmark className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />{saved ? 'Saved' : 'Save'}
      </Button>
    );
  }
  return (
    <button onClick={toggle} disabled={busy} aria-pressed={saved} aria-label={saved ? 'Remove from saved professionals' : 'Save professional'}
      title={saved ? 'Remove from saved' : 'Save professional'}
      className={`rounded-full p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60 ${saved ? 'bg-brand-50 text-brand-600' : 'text-slate-400 hover:bg-slate-100 hover:text-brand-600'} ${className}`}>
      <Bookmark className={`h-5 w-5 ${saved ? 'fill-current' : ''}`} />
    </button>
  );
}
