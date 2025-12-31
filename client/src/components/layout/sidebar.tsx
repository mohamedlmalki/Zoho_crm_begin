import { Link, useLocation } from "wouter";
import { 
  Home, Users, BarChart3, UserPlus, UserRoundPlus, 
  ListFilter, Mailbox, Activity, Workflow
} from "lucide-react";

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="fixed left-0 top-0 h-full w-60 bg-sidebar border-r border-sidebar-border z-50 shadow-lg overflow-y-auto">
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <BarChart3 className="text-primary-foreground text-lg" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-sidebar-foreground">Unified CRM</h1>
            <p className="text-sm text-muted-foreground">Manager</p>
          </div>
        </div>
      </div>
      
      <nav className="p-4 space-y-6">
        
        {/* GLOBAL SECTION */}
        <div className="space-y-1">
           <Link href="/">
              <button className={`sidebar-nav-item ${location === "/" ? "active" : ""}`}>
                <Home className="w-5 h-5" />
                <span className="font-medium">Dashboard</span>
              </button>
            </Link>
             <Link href="/accounts">
              <button className={`sidebar-nav-item ${location === "/accounts" ? "active" : ""}`}>
                <Users className="w-5 h-5" />
                <span className="font-medium">Account Manager</span>
              </button>
            </Link>
        </div>

        {/* ZOHO CRM SECTION */}
        <div>
          <h3 className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Zoho CRM
          </h3>
          <div className="space-y-1">
            <Link href="/contact-manager">
              <button className={`sidebar-nav-item ${location === "/contact-manager" ? "active" : ""}`}>
                <ListFilter className="w-5 h-5" />
                <span className="font-medium">Contact Manager</span>
              </button>
            </Link>
            <Link href="/email-stats">
              <button className={`sidebar-nav-item ${location === "/email-stats" ? "active" : ""}`}>
                <BarChart3 className="w-5 h-5" />
                <span className="font-medium">Email Statistics</span>
              </button>
            </Link>
            <Link href="/workflow-report">
              <button className={`sidebar-nav-item ${location === "/workflow-report" ? "active" : ""}`}>
                <Activity className="w-5 h-5" />
                <span className="font-medium">Workflow Report</span>
              </button>
            </Link>
             <Link href="/single-contact">
              <button className={`sidebar-nav-item ${location === "/single-contact" ? "active" : ""}`}>
                <UserPlus className="w-5 h-5" />
                <span className="font-medium">Add Contact</span>
              </button>
            </Link>
             <Link href="/bulk-contacts">
              <button className={`sidebar-nav-item ${location === "/bulk-contacts" ? "active" : ""}`}>
                <UserRoundPlus className="w-5 h-5" />
                <span className="font-medium">Bulk Contacts</span>
              </button>
            </Link>
             <Link href="/email-templates">
              <button className={`sidebar-nav-item ${location === "/email-templates" ? "active" : ""}`}>
                <Mailbox className="w-5 h-5" />
                <span className="font-medium">Email Templates</span>
              </button>
            </Link>
          </div>
        </div>

        {/* ZOHO BIGIN SECTION */}
        <div>
          <h3 className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Zoho Bigin
          </h3>
          <div className="space-y-1">
            <Link href="/bulk-contacts-bigin">
              <button className={`sidebar-nav-item ${location === "/bulk-contacts-bigin" ? "active" : ""}`}>
                <UserRoundPlus className="w-5 h-5" />
                <span className="font-medium">Bulk Contacts</span>
              </button>
            </Link>
          </div>
        </div>

      </nav>
    </div>
  );
}