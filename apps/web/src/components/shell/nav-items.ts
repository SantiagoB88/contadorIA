import {
  Building2,
  CreditCard,
  FileText,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  Receipt,
  Settings,
  FolderOpen,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/obligations', label: 'Mis obligaciones', icon: ListChecks },
  { href: '/payments', label: 'Pagos', icon: CreditCard },
  { href: '/receipts', label: 'Comprobantes', icon: Receipt },
  { href: '/invoices', label: 'Facturación', icon: FileText },
  { href: '/documents', label: 'Documentos', icon: FolderOpen },
  { href: '/messages', label: 'Mensajes / Consultas', icon: MessagesSquare },
  { href: '/settings', label: 'Mi empresa', icon: Building2 },
];

export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { href: '/account-settings', label: 'Configuración', icon: Settings },
  { href: '/help', label: 'Ayuda', icon: HelpCircle },
];
