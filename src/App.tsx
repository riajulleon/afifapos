import { LoaderCircle } from 'lucide-react';
import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { RequirePerm } from './components/RequirePerm';
import { Toaster } from './components/Toaster';
import { useMe } from './api/queries';
import { ShopLayout } from './layouts/ShopLayout';
import { ApplyPage } from './pages/auth/ApplyPage';
import { LoginPage } from './pages/auth/LoginPage';
import { PendingPage } from './pages/auth/PendingPage';
import { InvoicePage } from './pages/InvoicePage';
import { ReceiptPage } from './pages/ReceiptPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AccountPage } from './pages/shop/AccountPage';
import { CartPage } from './pages/shop/CartPage';
import { CatalogPage } from './pages/shop/CatalogPage';
import { HomePage } from './pages/shop/HomePage';
import { OrderPage } from './pages/shop/OrderPage';
import { OrdersPage } from './pages/shop/OrdersPage';
import { ProductPage } from './pages/shop/ProductPage';
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
  product: () => lazyNamed(() => import('./pages/admin/ProductEditPage'), 'ProductEditPage'),
  deals: () => lazyNamed(() => import('./pages/admin/DealsPage'), 'DealsPage'),
  rules: () => lazyNamed(() => import('./pages/admin/RulesPage'), 'RulesPage'),
  settings: () => lazyNamed(() => import('./pages/admin/SettingsPage'), 'SettingsPage'),
  audit: () => lazyNamed(() => import('./pages/admin/AuditPage'), 'AuditPage'),
  staff: () => lazyNamed(() => import('./pages/admin/StaffPage'), 'StaffPage'),
  categories: () => lazyNamed(() => import('./pages/admin/CategoriesPage'), 'CategoriesPage'),
  reseller: () => lazyNamed(() => import('./pages/admin/ResellerPage'), 'ResellerPage'),
  importResellers: () => lazyNamed(() => import('./pages/admin/ResellerImportPage'), 'ResellerImportPage'),
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
          { path: '/product/:id', element: <ProductPage /> },
          { path: '/cart', element: <CartPage /> },
          { path: '/orders', element: <OrdersPage /> },
          { path: '/orders/:id', element: <OrderPage /> },
          { path: '/account', element: <AccountPage /> },
        ],
      },
      { path: '/invoice/:id', element: <InvoicePage /> },
      { path: '/receipt/:orderId/:paymentId', element: <ReceiptPage /> },
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
          { path: 'orders', element: <RequirePerm perm="orders.view">{admin.orders()}</RequirePerm> },
          { path: 'orders/:id', element: <RequirePerm perm="orders.view">{admin.order()}</RequirePerm> },
          { path: 'approvals', element: <RequirePerm perm="resellers.approve">{admin.approvals()}</RequirePerm> },
          { path: 'resellers', element: <RequirePerm perm="resellers.view">{admin.resellers()}</RequirePerm> },
          { path: 'resellers/import', element: <RequirePerm perm="resellers.import">{admin.importResellers()}</RequirePerm> },
          { path: 'resellers/:id', element: <RequirePerm perm="resellers.view">{admin.reseller()}</RequirePerm> },
          { path: 'products', element: <RequirePerm perm="products.view">{admin.products()}</RequirePerm> },
          { path: 'products/:id', element: <RequirePerm perm="products.view">{admin.product()}</RequirePerm> },
          { path: 'categories', element: <RequirePerm perm="products.view">{admin.categories()}</RequirePerm> },
          { path: 'deals', element: <RequirePerm perm="deals.edit">{admin.deals()}</RequirePerm> },
          { path: 'rules', element: <RequirePerm perm="rules.edit">{admin.rules()}</RequirePerm> },
          { path: 'users', element: <RequirePerm perm="users.manage">{admin.staff()}</RequirePerm> },
          { path: 'settings', element: <RequirePerm perm="settings.edit">{admin.settings()}</RequirePerm> },
          { path: 'audit', element: <RequirePerm perm="audit.view">{admin.audit()}</RequirePerm> },
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
