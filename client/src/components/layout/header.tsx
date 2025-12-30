import { useLocation } from "wouter";

const titles = {
  "/": "Dashboard",
  "/accounts": "Account Manager",
  "/email-stats": "Email Statistics",
  "/single-contact": "Add Single Contact",
  "/bulk-contacts": "Bulk Add Contacts",
  "/email-templates": "Email Templates",
  "/workflow-report": "Workflow Usage Report",
};

const subtitles = {
  "/": "Manage your Zoho CRM operations",
  "/accounts": "Configure Zoho CRM accounts",
  "/email-stats": "View email analytics and performance",
  "/single-contact": "Create individual contacts and send emails",
  "/bulk-contacts": "Import multiple contacts and send bulk emails",
  "/email-templates": "View and manage email templates",
  "/workflow-report": "Track workflow rule execution and performance",
};

export default function Header() {
  const [location] = useLocation();
  
  const title = titles[location as keyof typeof titles] || "Zoho CRM Manager";
  const subtitle = subtitles[location as keyof typeof subtitles] || "Manage your operations";

  return (
    <div className="bg-card border-b border-border px-8 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-muted px-3 py-2 rounded-lg">
            <div className="w-2 h-2 bg-primary rounded-full"></div>
            <span className="text-sm font-medium">Connected</span>
          </div>
        </div>
      </div>
    </div>
  );
}