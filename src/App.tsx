import { LoaderCircle } from 'lucide-react';
import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { Toaster } from './components/Toaster';
import { useMe } from './api/queries';
import { ShopLayout } from './layouts/ShopLayout';
import { ApplyPage } from './pages/auth/ApplyPage';
import { LoginPage } from './pages/auth/LoginPage';
import { PendingPage } from './pages/auth/PendingPage';
import { InvoicePage } from './pages/InvoicePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AccountPage } from './pages/shop/AccountPage';
import { CartPage } from './pages/shop/CartPage';
import { CatalogPage } from './pages/shop/CatalogPage';
import { HomePage } from './pages/shop/HomePage';
import { OrderPage } from './pages/shop/OrderPage';
import { OrdersPage } from './pages/shop/OrdersPage';
import { SalePage } from './pages/shop/SalePage';

function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas" aria-busy="true">
      <LoaderCircle className="size-6 animate-spin text-muted" aria-label="Loading" />
    </div>
  );
}

// The admin console is its own chunk, so resellers on phones never download it.
function lazyNamed(load: () => Promise<Record<string, unknown>>, name: string) {
  const C = lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
  return <Suspense fallback={<Loading />}><C /></Suspense>;
}
const admin = {
  layout: () => lazyNamed(() => import('./layouts/AdminLayout'), 'AdminLayout'),
  overview: () => lazyNamed(() => import('./pages/admin/OverviewPage'), 'OverviewPage'),
  orders: () => lazyNamed(() => import('./pages/admin/AdminOrdersPage'), 'AdminOrdersPage'),
  order: () => lazyNamed(() => import('./pages/admin/AdminOrderPage'), 'AdminOrderPage'),
  approvals: () => lazyNamed(() => import('./pages/admin/ApprovalsPage'), 'ApprovalsPage'),
  resellers: () => lazyNamed(() => import('./pages/admin/ResellersPage'), 'ResellersPage'),
  products: () => lazyNamed(() => import('./pages/admin/ProductsPage'), 'ProductsPage'),
  deals: () => lazyNamed(() => import('./pages/admin/DealsPage'), 'DealsPage'),
  rules: () => lazyNamed(() => import('./pages/admin/RulesPage'), 'RulesPage'),
  settings: () => lazyNamed(() => import('./pages/admin/SettingsPage'), 'SettingsPage'),
  audit: () => lazyNamed(() => import('./pages/admin/AuditPage'), 'AuditPage'),
};

/** Only approved accounts reach the shop (AUTH-04). Pending applicants see their status page. */
function RequireApproved() {
  const me = useMe();
  if (me.isLoading) return <Loading />;
  if (!me.data) return <Navigate to="/login" replace />;
  if (me.data.state !== 'approved') return <Navigate to="/pending" replace />;
  return <Outlet />;
}

function RequireAdmin() {
  const me = useMe();
  if (me.isLoading) return <Loading />;
  if (!me.data) return <Navigate to="/login" replace />;
  if (me.data.role === 'reseller') return <Navigate to="/" replace />;
  return <Outlet />;
}

function PublicOnly() {
  const me = useMe();
  if (me.isLoading) return <Loading />;
  if (me.data?.state === 'approved') return <Navigate to={me.data.role === 'reseller' ? '/' : '/admin'} replace />;
  return <Outlet />;
}

/** Root: every page plus the toast area (toasts contain router links). */
function Root() {
  return (
    <>
      <Outlet />
      <Toaster />
    </>
  );
}

const router = createBrowserRouter([
  {
  element: <Root />,
  children: [
  {
    element: <PublicOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/apply', element: <ApplyPage /> },
    ],
  },
  { path: '/pending', element: <PendingPage /> },
  {
    element: <RequireApproved />,
    children: [
      {
        element: <ShopLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/sale', element: <SalePage /> },
          { path: '/catalog', element: <CatalogPage /> },
          { path: '/cart', element: <CartPage /> },
          { path: '/orders', element: <OrdersPage /> },
          { path: '/orders/:id', element: <OrderPage /> },
          { path: '/account', element: <AccountPage /> },
        ],
      },
      { path: '/invoice/:id', element: <InvoicePage /> },
    ],
  },
  {
    element: <RequireAdmin />,
    children: [
      {
        path: '/admin',
        element: admin.layout(),
        children: [
          { index: true, element: admin.overview() },
          { path: 'orders', element: admin.orders() },
          { path: 'orders/:id', element: admin.order() },
          { path: 'approvals', element: admin.approvals() },
          { path: 'resellers', element: admin.resellers() },
          { path: 'products', element: admin.products() },
          { path: 'deals', element: admin.deals() },
          { path: 'rules', element: admin.rules() },
          { path: 'settings', element: admin.settings() },
          { path: 'audit', element: admin.audit() },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
  ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
