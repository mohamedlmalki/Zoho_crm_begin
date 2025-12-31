import { Link, useLocation } from "wouter";
import { Home, Users, BarChart3, UserPlus, UserRoundPlus, ListFilter, Mailbox, Activity } from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Account Manager", href: "/accounts", icon: Users },
  { name: "Contact Manager", href: "/contact-manager", icon: ListFilter },
  { name: "Email Statistics", href: "/email-stats", icon: BarChart3 },
  { name: "Workflow Report", href: "/workflow-report", icon: Activity },
  { name: "Add Contact", href: "/single-contact", icon: UserPlus },
  { name: "Bulk Contacts", href: "/bulk-contacts", icon: UserRoundPlus },
  { name: "Email Templates", href: "/email-templates", icon: Mailbox },
];

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="fixed left-0 top-0 h-full w-60 bg-sidebar border-r border-sidebar-border z-50 shadow-lg">
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <BarChart3 className="text-primary-foreground text-lg" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-sidebar-foreground">Zoho CRM</h1>
            <p className="text-sm text-muted-foreground">Manager</p>
          </div>
        </div>
      </div>
      
      <nav className="p-4 space-y-2">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <button 
                className={`sidebar-nav-item ${isActive ? "active" : ""}`}
                data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </button>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}