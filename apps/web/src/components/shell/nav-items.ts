import {
  BarChart3,
  CreditCard,
  FileText,
  LayoutDashboard,
  Package,
  Plug,
  Settings,
  Users,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/invoices', label: 'Comprobantes', icon: FileText },
  { href: '/customers', label: 'Clientes', icon: Users },
  { href: '/products', label: 'Productos', icon: Package },
  { href: '/payments', label: 'Pagos', icon: CreditCard, disabled: true },
  { href: '/reports', label: 'Reportes', icon: BarChart3, disabled: true },
  { href: '/integrations', label: 'Integraciones', icon: Plug, disabled: true },
  { href: '/settings', label: 'Configuración', icon: Settings },
];
