import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/hooks/use-accounts";
import { Mail, MailOpen, MousePointer, AlertTriangle, RefreshCw, Download, Filter, Loader2, Copy, XCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import StatCard from "@/components/ui/stat-card";
import { Progress } from "@/components/ui/progress";

export default function EmailStats() {
  const { data: accounts = [] } = useAccounts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Initialize from sessionStorage
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    return sessionStorage.getItem('emailStats_selectedAccount') || "";
  });

  const [selectedUserId, setSelectedUserId] = useState<string>("all"); // New User State
  const [filterText, setFilterText] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      const firstId = accounts[0].id.toString();
      setSelectedAccountId(firstId);
      sessionStorage.setItem('emailStats_selectedAccount', firstId);
    }
  }, [accounts, selectedAccountId]);

  // Fetch Stats
  const { data: contactStats = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/zoho/all-contact-stats', selectedAccountId],
    enabled: !!selectedAccountId,
    staleTime: Infinity,
  });

  // Fetch Users for Dropdown
  const { data: users = [] } = useQuery({
    queryKey: ['/api/zoho/users', selectedAccountId],
    enabled: !!selectedAccountId,
  });

  // Persistent Progress Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const storageKey = `emailStats_startTime_${selectedAccountId}`;

    if (isLoading) {
      let startTime = parseInt(sessionStorage.getItem(storageKey) || '0');
      if (!startTime) {
        startTime = Date.now();
        sessionStorage.setItem(storageKey, startTime.toString());
      }

      const updateProgress = () => {
        const elapsed = Date.now() - startTime;
        let p = 0;
        if (elapsed < 5000) {
            p = (elapsed / 5000) * 30; 
        } else if (elapsed < 15000) {
            p = 30 + ((elapsed - 5000) / 10000) * 30; 
        } else {
            p = 60 + ((elapsed - 15000) / 60000) * 30; 
        }
        setProgress(Math.min(p, 90));
      };

      updateProgress();
      interval = setInterval(updateProgress, 500);

    } else {
      setProgress(100);
      if (selectedAccountId) {
        sessionStorage.removeItem(storageKey);
      }
    }
    return () => clearInterval(interval);
  }, [isLoading, selectedAccountId]);

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    setSelectedUserId("all"); // Reset user filter on account change
    sessionStorage.setItem('emailStats_selectedAccount', accountId);
    sessionStorage.removeItem(`emailStats_startTime_${accountId}`);
    setProgress(0);
  };

  // Logic to process contacts and count stats
  const processedContacts = React.useMemo(() => {
    // 1. Filter by Selected User FIRST (before calculating counts)
    const rawContacts = Array.isArray(contactStats) ? contactStats : [];
    
    // 2. Calculate Email Frequencies to identify duplicates
    const emailCounts = new Map<string, number>();
    rawContacts.forEach((c: any) => {
        // Only count emails for duplicates if they belong to the selected user (or all)
        if (!selectedUserId || selectedUserId === "all" || c.Owner?.id === selectedUserId) {
            if (c.Email && c.Email !== 'N/A') {
                const email = c.Email.trim().toLowerCase();
                emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
            }
        }
    });

    let totalSent = 0, totalOpened = 0, totalClicked = 0, totalBounced = 0, totalDuplicates = 0, totalDelivered = 0;
    
    const contacts = rawContacts.map((contact: any) => {
      // Skip processing if not the selected user
      if (selectedUserId && selectedUserId !== "all" && contact.Owner?.id !== selectedUserId) {
          return null; 
      }

      let hasSent = false, hasOpened = false, hasClicked = false, hasBounced = false;
      
      // Check Email Statuses
      if (contact.emails && contact.emails.length > 0) {
        hasSent = true;
        contact.emails.forEach((email: any) => {
          if (email.status) {
            let emailHasClicked = false, emailHasOpened = false;
            email.status.forEach((status: any) => {
              if (status.type === 'clicked') emailHasClicked = true;
              if (status.type === 'opened') emailHasOpened = true;
              if (status.type === 'bounced') hasBounced = true;
            });
            if (emailHasClicked) hasClicked = true;
            else if (emailHasOpened) hasOpened = true;
          }
        });
      }

      // Check Duplicate Status
      let isDuplicate = false;
      if (contact.Email && contact.Email !== 'N/A') {
          const email = contact.Email.trim().toLowerCase();
          if ((emailCounts.get(email) || 0) > 1) {
              isDuplicate = true;
          }
      }

      // Calculate Delivered: Sent AND NOT Bounced
      const isDelivered = hasSent && !hasBounced;

      if (hasSent) totalSent++;
      if (hasOpened) totalOpened++;
      if (hasClicked) totalClicked++;
      if (hasBounced) totalBounced++;
      if (isDuplicate) totalDuplicates++;
      if (isDelivered) totalDelivered++;
      
      return { ...contact, hasSent, hasOpened, hasClicked, hasBounced, isDuplicate, isDelivered };
    }).filter(Boolean); // Remove nulls

    return { contacts, totalSent, totalOpened, totalClicked, totalBounced, totalDuplicates, totalDelivered };
  }, [contactStats, selectedUserId]); // Re-run when user selection changes

  const filteredContacts = React.useMemo(() => {
    return processedContacts.contacts.filter((contact: any) => {
      if (!contact) return false;

      const matchesText = !filterText || 
        (contact.Full_Name && contact.Full_Name.toLowerCase().includes(filterText.toLowerCase())) ||
        (contact.Email && contact.Email.toLowerCase().includes(filterText.toLowerCase()));
      
      const matchesStatus = filterStatus === 'all' || 
        (filterStatus === 'sent' && contact.hasSent) ||
        (filterStatus === 'delivered' && contact.isDelivered) ||
        (filterStatus === 'opened' && contact.hasOpened) ||
        (filterStatus === 'clicked' && contact.hasClicked) ||
        (filterStatus === 'bounced' && contact.hasBounced) ||
        (filterStatus === 'duplicated' && contact.isDuplicate);

      return matchesText && matchesStatus;
    });
  }, [processedContacts.contacts, filterText, filterStatus]);


  const handleExportEmails = () => {
    const emails = filteredContacts
      .filter((contact: any) => contact.Email && contact.Email !== 'N/A')
      .map((contact: any) => contact.Email)
      .join('\n');

    if (!emails) {
      toast({ title: "No emails to export", variant: "destructive" });
      return;
    }

    const blob = new Blob([emails], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-list.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export successful", description: `Exported ${emails.split('\n').length} emails.` });
  };

  const handleRefresh = () => {
    sessionStorage.removeItem(`emailStats_startTime_${selectedAccountId}`);
    setProgress(0);
    refetch();
  };

  // Helper to make cards clickable
  const StatCardWrapper = ({ status, children }: { status: string, children: React.ReactNode }) => (
    <div 
      className={`cursor-pointer transition-transform hover:scale-105 ${filterStatus === status ? 'ring-2 ring-primary rounded-xl' : ''}`}
      onClick={() => setFilterStatus(status === filterStatus ? 'all' : status)}
    >
      {children}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="form-card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Email Statistics</h3>
          <div className="flex items-center space-x-4">
            
            {/* Account Selector */}
            <div className="flex flex-col space-y-1">
                <Label htmlFor="stats-account-select" className="text-xs">Account</Label>
                <Select value={selectedAccountId} onValueChange={handleAccountChange}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>
                    {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                        {account.name}
                    </SelectItem>
                    ))}
                </SelectContent>
                </Select>
            </div>

            {/* User Selector */}
            <div className="flex flex-col space-y-1">
                <Label htmlFor="stats-user-select" className="text-xs">Filter by User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="w-48"><SelectValue placeholder="All Users" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {(users as any[]).map((user: any) => (
                    <SelectItem key={user.id} value={user.id}>
                        {user.full_name}
                    </SelectItem>
                    ))}
                </SelectContent>
                </Select>
            </div>

            <Button onClick={handleRefresh} disabled={isLoading || !selectedAccountId} variant="outline" size="sm" className="mt-5">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="w-full max-w-md space-y-3">
              <div className="flex justify-between text-sm font-medium text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing account data...
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2 w-full transition-all duration-500" />
              <p className="text-xs text-muted-foreground text-center pt-2">
                This process runs in the background. You can navigate away and come back.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCardWrapper status="sent">
                <StatCard title="Sent" value={processedContacts.totalSent} icon={<Mail />} iconBg="bg-blue-100" iconColor="text-blue-600" description="Attempts" />
              </StatCardWrapper>

              <StatCardWrapper status="delivered">
                <StatCard title="Delivered" value={processedContacts.totalDelivered} icon={<CheckCircle />} iconBg="bg-teal-100" iconColor="text-teal-600" description="Successful" />
              </StatCardWrapper>
              
              <StatCardWrapper status="opened">
                <StatCard title="Opened" value={processedContacts.totalOpened} icon={<MailOpen />} iconBg="bg-green-100" iconColor="text-green-600" description="Total opened" />
              </StatCardWrapper>
              
              <StatCardWrapper status="clicked">
                <StatCard title="Clicked" value={processedContacts.totalClicked} icon={<MousePointer />} iconBg="bg-purple-100" iconColor="text-purple-600" description="Total clicked" />
              </StatCardWrapper>
              
              <StatCardWrapper status="bounced">
                <StatCard title="Bounced" value={processedContacts.totalBounced} icon={<AlertTriangle />} iconBg="bg-red-100" iconColor="text-red-600" description="Total bounced" />
              </StatCardWrapper>

              <StatCardWrapper status="duplicated">
                <StatCard title="Duplicated" value={processedContacts.totalDuplicates} icon={<Copy />} iconBg="bg-orange-100" iconColor="text-orange-600" description="Duplicates" />
              </StatCardWrapper>
            </div>

            <div className="form-card mt-8">
               <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold">Contact Details</h3>
                <div className="flex items-center gap-2">
                    {filterStatus !== 'all' && (
                        <Button variant="ghost" size="sm" onClick={() => setFilterStatus('all')} className="text-muted-foreground">
                            Clear Filter ({filterStatus}) <XCircle className="ml-2 w-4 h-4" />
                        </Button>
                    )}
                    <Button onClick={handleExportEmails} variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />Export Emails</Button>
                </div>
              </div>
              <div className="flex gap-4 mb-6">
                <Input placeholder="Search by name or email..." value={filterText} onChange={(e) => setFilterText(e.target.value)} />
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="sent">Sent (Attempts)</SelectItem>
                    <SelectItem value="delivered">Delivered (Success)</SelectItem>
                    <SelectItem value="opened">Opened</SelectItem>
                    <SelectItem value="clicked">Clicked</SelectItem>
                    <SelectItem value="bounced">Bounced</SelectItem>
                    <SelectItem value="duplicated">Duplicated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 w-12 text-muted-foreground">#</th>
                      <th className="text-left p-2">Contact Name</th>
                      <th className="text-left p-2">Email</th>
                      <th className="text-left p-2">Owner</th> {/* Added Owner Column */}
                      <th className="text-center p-2">Sent</th>
                      <th className="text-center p-2">Opened</th>
                      <th className="text-center p-2">Clicked</th>
                      <th className="text-center p-2">Bounced</th>
                      <th className="text-center p-2">Duplicated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.map((contact: any, index: number) => (
                      <tr key={contact.contact_id || index} className="border-b hover:bg-muted/30">
                        <td className="p-2 text-left text-muted-foreground font-mono text-xs">{index + 1}</td>
                        <td className="p-2">{contact.Full_Name || 'N/A'}</td>
                        <td className="p-2">{contact.Email || 'N/A'}</td>
                        <td className="p-2 text-muted-foreground text-xs">{contact.Owner?.name || '-'}</td> {/* Display Owner Name */}
                        <td className="p-2 text-center">{contact.hasSent ? 'Yes' : 'No'}</td>
                        <td className="p-2 text-center">{contact.hasOpened ? 'Yes' : 'No'}</td>
                        <td className="p-2 text-center">{contact.hasClicked ? 'Yes' : 'No'}</td>
                        <td className="p-2 text-center">{contact.hasBounced ? 'Yes' : 'No'}</td>
                        <td className={`p-2 text-center font-medium ${contact.isDuplicate ? 'text-orange-600 bg-orange-50 rounded' : 'text-muted-foreground'}`}>
                            {contact.isDuplicate ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}