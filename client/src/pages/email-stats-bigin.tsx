import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/hooks/use-accounts";
import { Mail, MailOpen, MousePointer, AlertTriangle, RefreshCw, Download, Filter, Loader2, Copy, XCircle, CheckCircle, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import StatCard from "@/components/ui/stat-card";
import { Progress } from "@/components/ui/progress";

export default function EmailStatsBigin() {
  const { data: accounts = [] } = useAccounts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // --- FILTER: BIGIN ACCOUNTS ONLY ---
  const validAccounts = useMemo(() => accounts.filter((acc: any) => acc.supports_bigin === true), [accounts]);

  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    return sessionStorage.getItem('emailStatsBigin_selectedAccount') || "";
  });

  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [filterText, setFilterText] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [progress, setProgress] = useState(0);

  // Validate Selection
  useEffect(() => {
    if (validAccounts.length > 0) {
      const isValid = validAccounts.find((a: any) => a.id.toString() === selectedAccountId);
      if (!selectedAccountId || !isValid) {
        const firstId = validAccounts[0].id.toString();
        setSelectedAccountId(firstId);
        sessionStorage.setItem('emailStatsBigin_selectedAccount', firstId);
      }
    }
  }, [validAccounts, selectedAccountId]);

  // Fetch Stats (Bigin Endpoint)
  const { data: contactStats = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/bigin/all-contact-stats', selectedAccountId],
    enabled: !!selectedAccountId,
    staleTime: Infinity,
  });

  // Fetch Users (Bigin Endpoint)
  const { data: users = [] } = useQuery({
    queryKey: ['/api/bigin/users', selectedAccountId],
    enabled: !!selectedAccountId,
  });

  // Progress Bar Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const storageKey = `emailStatsBigin_startTime_${selectedAccountId}`;

    if (isLoading) {
      let startTime = parseInt(sessionStorage.getItem(storageKey) || '0');
      if (!startTime) {
        startTime = Date.now();
        sessionStorage.setItem(storageKey, startTime.toString());
      }

      const updateProgress = () => {
        const elapsed = Date.now() - startTime;
        let p = 0;
        if (elapsed < 3000) p = (elapsed / 3000) * 30; 
        else if (elapsed < 10000) p = 30 + ((elapsed - 3000) / 7000) * 30; 
        else p = 60 + ((elapsed - 10000) / 30000) * 30; 
        setProgress(Math.min(p, 90));
      };

      updateProgress();
      interval = setInterval(updateProgress, 500);

    } else {
      setProgress(100);
      if (selectedAccountId) sessionStorage.removeItem(storageKey);
    }
    return () => clearInterval(interval);
  }, [isLoading, selectedAccountId]);

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    setSelectedUserId("all");
    sessionStorage.setItem('emailStatsBigin_selectedAccount', accountId);
    sessionStorage.removeItem(`emailStatsBigin_startTime_${accountId}`);
    setProgress(0);
  };

  // Logic to process contacts and count stats (Same logic, new data source)
  const processedContacts = React.useMemo(() => {
    const rawContacts = Array.isArray(contactStats) ? contactStats : [];
    
    const emailCounts = new Map<string, number>();
    rawContacts.forEach((c: any) => {
        if (!selectedUserId || selectedUserId === "all" || c.Owner?.id === selectedUserId) {
            if (c.Email && c.Email !== 'N/A') {
                const email = c.Email.trim().toLowerCase();
                emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
            }
        }
    });

    let totalSent = 0, totalOpened = 0, totalClicked = 0, totalBounced = 0, totalDuplicates = 0, totalDelivered = 0, totalUnsent = 0;
    
    const contacts = rawContacts.map((contact: any) => {
      if (selectedUserId && selectedUserId !== "all" && contact.Owner?.id !== selectedUserId) return null;

      let hasSent = false, hasOpened = false, hasClicked = false, hasBounced = false;
      
      if (contact.emails && contact.emails.length > 0) {
        hasSent = true;
        contact.emails.forEach((email: any) => {
          // Bigin sometimes returns status as array, sometimes string
          let statusList = [];
          if (Array.isArray(email.status)) statusList = email.status;
          else if (email.status) statusList = [{ type: email.status }]; // Normalize to array

          let emailHasClicked = false, emailHasOpened = false;
          
          statusList.forEach((status: any) => {
            const type = (status.type || status).toLowerCase();
            if (type === 'clicked') emailHasClicked = true;
            if (type === 'opened') emailHasOpened = true;
            if (type === 'bounced') hasBounced = true;
          });

          if (emailHasClicked) hasClicked = true;
          else if (emailHasOpened) hasOpened = true;
        });
      }

      let isDuplicate = false;
      if (contact.Email && contact.Email !== 'N/A') {
          const email = contact.Email.trim().toLowerCase();
          if ((emailCounts.get(email) || 0) > 1) isDuplicate = true;
      }

      const isDelivered = hasSent && !hasBounced;

      if (hasSent) totalSent++;
      else totalUnsent++;

      if (hasOpened) totalOpened++;
      if (hasClicked) totalClicked++;
      if (hasBounced) totalBounced++;
      if (isDuplicate) totalDuplicates++;
      if (isDelivered) totalDelivered++;
      
      return { ...contact, hasSent, hasOpened, hasClicked, hasBounced, isDuplicate, isDelivered, hasUnsent: !hasSent };
    }).filter(Boolean);

    return { contacts, totalSent, totalOpened, totalClicked, totalBounced, totalDuplicates, totalDelivered, totalUnsent };
  }, [contactStats, selectedUserId]);

  const filteredContacts = React.useMemo(() => {
    return processedContacts.contacts.filter((contact: any) => {
      if (!contact) return false;

      const matchesText = !filterText || 
        (contact.Full_Name && contact.Full_Name.toLowerCase().includes(filterText.toLowerCase())) ||
        (contact.Email && contact.Email.toLowerCase().includes(filterText.toLowerCase()));
      
      const matchesStatus = filterStatus === 'all' || 
        (filterStatus === 'sent' && contact.hasSent) ||
        (filterStatus === 'unsent' && contact.hasUnsent) ||
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
    a.download = `bigin-email-list.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export successful", description: `Exported ${emails.split('\n').length} emails.` });
  };

  const handleRefresh = () => {
    sessionStorage.removeItem(`emailStatsBigin_startTime_${selectedAccountId}`);
    setProgress(0);
    refetch();
  };

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
          <h3 className="text-lg font-semibold">Bigin Email Statistics</h3>
          <div className="flex items-center space-x-4">
            
            {/* Account Selector */}
            <div className="flex flex-col space-y-1">
                <Label className="text-xs">Account</Label>
                <Select value={selectedAccountId} onValueChange={handleAccountChange}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>
                    {validAccounts.map((account: any) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                        {account.name}
                    </SelectItem>
                    ))}
                </SelectContent>
                </Select>
            </div>

            {/* User Selector */}
            <div className="flex flex-col space-y-1">
                <Label className="text-xs">Filter by User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="w-48"><SelectValue placeholder="All Users" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {(users as any[]).map((user: any) => (
                    <SelectItem key={user.id} value={user.id}>
                        {user.full_name || user.last_name}
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
                  Analyzing Bigin data...
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2 w-full transition-all duration-500" />
              <p className="text-xs text-muted-foreground text-center pt-2">
                Fetching contacts and email history...
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-4">
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

              <StatCardWrapper status="unsent">
                <StatCard title="Unsent" value={processedContacts.totalUnsent} icon={<Ban />} iconBg="bg-gray-100" iconColor="text-gray-600" description="Not Sent" />
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
                    <SelectItem value="unsent">Unsent</SelectItem>
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
                      <th className="text-left p-2">Owner</th>
                      <th className="text-center p-2">Sent</th>
                      <th className="text-center p-2">Opened</th>
                      <th className="text-center p-2">Clicked</th>
                      <th className="text-center p-2">Bounced</th>
                      <th className="text-center p-2">Unsent</th>
                      <th className="text-center p-2">Duplicated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.map((contact: any, index: number) => (
                      <tr key={contact.contact_id || index} className="border-b hover:bg-muted/30">
                        <td className="p-2 text-left text-muted-foreground font-mono text-xs">{index + 1}</td>
                        <td className="p-2">{contact.Full_Name || 'N/A'}</td>
                        <td className="p-2">{contact.Email || 'N/A'}</td>
                        <td className="p-2 text-muted-foreground text-xs">{contact.Owner?.name || '-'}</td>
                        <td className="p-2 text-center">{contact.hasSent ? 'Yes' : 'No'}</td>
                        <td className="p-2 text-center">{contact.hasOpened ? 'Yes' : 'No'}</td>
                        <td className="p-2 text-center">{contact.hasClicked ? 'Yes' : 'No'}</td>
                        <td className="p-2 text-center">{contact.hasBounced ? 'Yes' : 'No'}</td>
                        <td className="p-2 text-center font-medium text-gray-500">
                            {contact.hasUnsent ? 'Yes' : 'No'}
                        </td>
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