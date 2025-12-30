import { Users, Mail, TrendingUp, UserCheck, UserPlus, UserRoundPlus, BarChart3 } from "lucide-react";
import { Link } from "wouter";
import StatCard from "@/components/ui/stat-card";
import { useAccounts } from "@/hooks/use-accounts";

export default function Dashboard() {
  const { data: accounts = [] } = useAccounts();

  return (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Accounts"
          value={accounts.length}
          description="Connected accounts"
          icon={<Users className="text-xl" />}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
        />
        
        <StatCard
          title="Emails"
          value="0"
          description="Emails sent today"
          icon={<Mail className="text-xl" />}
          iconBg="bg-primary/10"
          iconColor="text-primary"
        />
        
        <StatCard
          title="Success Rate"
          value="94%"
          description="Email delivery rate"
          icon={<TrendingUp className="text-xl" />}
          iconBg="bg-yellow-100"
          iconColor="text-yellow-600"
        />
        
        <StatCard
          title="Contacts"
          value="0"
          description="Total contacts"
          icon={<UserCheck className="text-xl" />}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
        />
      </div>

      {/* Quick Actions */}
      <div className="form-card">
        <h3 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/single-contact">
            <div className="quick-action-card" data-testid="quick-action-single-contact">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <UserPlus className="text-primary" />
              </div>
              <div className="text-left">
                <div className="font-medium text-foreground">Add Contact</div>
                <div className="text-sm text-muted-foreground">Create single contact</div>
              </div>
            </div>
          </Link>
          
          <Link href="/bulk-contacts">
            <div className="quick-action-card" data-testid="quick-action-bulk-contacts">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <UserRoundPlus className="text-blue-600" />
              </div>
              <div className="text-left">
                <div className="font-medium text-foreground">Bulk Import</div>
                <div className="text-sm text-muted-foreground">Import multiple contacts</div>
              </div>
            </div>
          </Link>
          
          <Link href="/email-stats">
            <div className="quick-action-card" data-testid="quick-action-email-stats">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="text-yellow-600" />
              </div>
              <div className="text-left">
                <div className="font-medium text-foreground">View Stats</div>
                <div className="text-sm text-muted-foreground">Email analytics</div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
