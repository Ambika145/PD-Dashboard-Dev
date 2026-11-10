import React from 'react';
import {
  LayoutDashboard, Upload, GraduationCap, Megaphone, Table2, History, Settings2,
  Check, AlertTriangle, Info, X, XCircle, CheckCircle2, Download, UploadCloud,
  Copy, FileText, ArrowRight, ArrowLeft, CalendarDays, Table, BarChart3, Search,
  Trash2, Share2, Sun, Moon, Monitor, MoreHorizontal, TrendingUp, TrendingDown,
  Percent, Users, Filter, Sparkles, Target, Activity, Building2, Plus, Pencil, Eye,
  PhoneMissed,
} from 'lucide-react';

const P = {
  overview: LayoutDashboard,
  run: Upload,
  programmes: GraduationCap,
  campaigns: Megaphone,
  records: Table2,
  phoneMissed: PhoneMissed,
  history: History,
  settings: Settings2,
  clients: Building2,
  plus: Plus,
  edit: Pencil,
  view: Eye,
  check: Check,
  alert: AlertTriangle,
  info: Info,
  x: X,
  xCircle: XCircle,
  checkCircle: CheckCircle2,
  download: Download,
  upload: UploadCloud,
  copy: Copy,
  file: FileText,
  arrowRight: ArrowRight,
  arrowLeft: ArrowLeft,
  calendar: CalendarDays,
  table: Table,
  chart: BarChart3,
  search: Search,
  trash: Trash2,
  share: Share2,
  sun: Sun,
  moon: Moon,
  monitor: Monitor,
  more: MoreHorizontal,
  trendUp: TrendingUp,
  trendDown: TrendingDown,
  percent: Percent,
  users: Users,
  filter: Filter,
  spark: Sparkles,
  target: Target,
  activity: Activity,
};

/** Lucide icons with a stable name map used across the app. */
export default function Icon({ name, size = 16, stroke = 1.8, className, ...rest }) {
  const Cmp = P[name];
  if (!Cmp) return null;
  return <Cmp size={size} strokeWidth={stroke} className={className} aria-hidden="true" {...rest} />;
}
