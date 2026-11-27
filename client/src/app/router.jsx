import { createBrowserRouter } from 'react-router-dom';
import PublicLayout from '../components/layout/PublicLayout.jsx';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import Home from '../pages/Home.jsx';
import Login from '../pages/Login.jsx';
import Register from '../pages/Register.jsx';
import Professionals from '../pages/Professionals.jsx';
import ProfessionalDetail from '../pages/ProfessionalDetail.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import ForgotPassword from '../pages/ForgotPassword.jsx';
import ResetPassword from '../pages/ResetPassword.jsx';
import VerifyEmail from '../pages/VerifyEmail.jsx';
import DevMailbox from '../pages/DevMailbox.jsx';
import SavedProfessionals from '../pages/SavedProfessionals.jsx';
import SearchPreferences from '../pages/SearchPreferences.jsx';
import AiAssistant from '../pages/AiAssistant.jsx';
import ReviewInsights from '../pages/ReviewInsights.jsx';
import RecentlyViewed from '../pages/RecentlyViewed.jsx';
import Compare from '../pages/Compare.jsx';
import ExperienceHistory from '../pages/ExperienceHistory.jsx';
import Conversations from '../pages/Conversations.jsx';
import ChatThread from '../pages/ChatThread.jsx';
import Discover from '../pages/Discover.jsx';
import Profile from '../pages/Profile.jsx';
import Settings from '../pages/Settings.jsx';
import { GuestRoute, ProtectedRoute } from '../components/routes/Guards.jsx';
import NotFound from '../pages/NotFound.jsx';

export const router = createBrowserRouter([
  { element: <PublicLayout />, children: [
    { path: '/', element: <Home /> },
    { path: '/professionals', element: <Professionals /> },
    { path: '/professionals/:id', element: <ProfessionalDetail /> },
    { path: '/compare', element: <Compare /> },
    { path: '*', element: <NotFound /> },
  ] },
  { element: <GuestRoute />, children: [{ path: '/login', element: <Login /> }, { path: '/register', element: <Register /> }] },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/verify-email', element: <VerifyEmail /> },
  // Shows content only while the server runs its development-only mailbox (EMAIL_MODE=dev).
  { path: '/dev/mailbox', element: <DevMailbox /> },
  {
    element: <ProtectedRoute />,
    children: [{
      path: '/dashboard',
      element: <DashboardLayout />,
      children: [
        { index: true, element: <Dashboard />, handle: { title: 'Overview' } },
        { path: 'discover', element: <Discover />, handle: { title: 'Discovery' } },
        { path: 'saved', element: <SavedProfessionals />, handle: { title: 'Saved Professionals' } },
        { path: 'experience-history', element: <ExperienceHistory />, handle: { title: 'Experience History' } },
        { path: 'search-preferences', element: <SearchPreferences />, handle: { title: 'Search Preferences' } },
        { path: 'ai-assistant', element: <AiAssistant />, handle: { title: 'AI Assistant' } },
        { path: 'recently-viewed', element: <RecentlyViewed />, handle: { title: 'Recently Viewed' } },
        { path: 'contacts', element: <Conversations />, handle: { title: 'My Contacts' } },
        { path: 'contacts/:id', element: <ChatThread />, handle: { title: 'Contact' } },
        { path: 'review-insights', element: <ReviewInsights />, handle: { title: 'Review Insights' } },
        { path: 'profile', element: <Profile />, handle: { title: 'My Profile' } },
        { path: 'settings', element: <Settings />, handle: { title: 'Account Settings' } },
        { path: '*', element: <NotFound /> },
      ],
    }],
  },
]);
