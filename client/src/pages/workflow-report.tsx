import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccounts } from "@/hooks/use-accounts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw, Activity, Calendar as CalendarIcon, Mail, CheckCircle2, XCircle, MousePointer2, Eye, Send } from "lucide-react";
import { getWorkflowRules, getWorkflowUsage } from "@/lib/api";
import { format, subDays } from "date-fns";

const modules = [
  "Leads", "Accounts", "Contacts", "Deals", "Tasks", "Events", "Calls",
  "Products", "Quotes", "Sales_Orders", "Purchase_Orders", "Invoices", 
  "Campaigns", "Cases", "Solutions"
];

export default function WorkflowReport() {
  const { data: accounts = [] } = useAccounts();
  
  // --- FILTER CRM ACCOUNTS ---
  const validAccounts = useMemo(() => accounts.filter((acc: any) => acc.supports_crm !== false), [accounts]);

  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedModule, setSelectedModule] = useState<string>("Leads");
  const [selectedRule, setSelectedRule] = useState<any>(null);
  const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);
  
  // Date range for usage report (default: last 30 days)
  const [dateRange, setDateRange] = useState({
    from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    if (validAccounts.length > 0) {
        const isValid = validAccounts.find((a: any) => a.id.toString() === selectedAccountId);
        if (!selectedAccountId || !isValid) {
            setSelectedAccountId(validAccounts[0].id.toString());
        }
    }
  }, [validAccounts, selectedAccountId]);

  // Fetch All Workflow Rules
  const { data: workflowData, isLoading, refetch } = useQuery({
    queryKey: ['workflow-rules', selectedAccountId, selectedModule],
    queryFn: () => getWorkflowRules(selectedAccountId, selectedModule),
    enabled: !!selectedAccountId,
  });

  // Fetch Usage Report for Selected Rule
  const { data: usageData, isLoading: isLoadingUsage, refetch: refetchUsage } = useQuery({
    queryKey: ['workflow-usage', selectedAccountId, selectedRule?.id, dateRange.from, dateRange.to],
    queryFn: () => getWorkflowUsage(selectedAccountId, selectedRule.id, dateRange.from, dateRange.to),
    enabled: !!selectedRule && isUsageModalOpen,
  });

  const handleViewUsage = (rule: any) => {
    setSelectedRule(rule);
    setIsUsageModalOpen(true);
  };

  return (
    <div className="space-y-8">
      {/* Filter Section */}
      <div className="form-card">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <Label className="mb-2 block">Account</Label>
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
              <SelectContent>
                {validAccounts.map((account: any) => (
                  <SelectItem key={account.id} value={account.id.toString()}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1 w-full">
            <Label className="mb-2 block">Module</Label>
            <Select value={selectedModule} onValueChange={setSelectedModule}>
              <SelectTrigger><SelectValue placeholder="Select Module" /></SelectTrigger>
              <SelectContent>
                {modules.map((mod) => (
                  <SelectItem key={mod} value={mod}>{mod.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={() => refetch()} disabled={isLoading || !selectedAccountId} variant="outline" size="icon">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Workflow Rules List */}
      <div className="form-card">
        <h3 className="text-lg font-semibold mb-4">Workflow Rules</h3>
        
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-primary mx-auto animate-spin mb-2" />
            <p className="text-muted-foreground">Loading workflows...</p>
          </div>
        ) : !workflowData?.workflow_rules?.length ? (
          <div className="text-center py-12 text-muted-foreground">
            No workflow rules found for this module.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Trigger</th>
                  <th className="p-3 font-medium">Last Modified</th>
                  <th className="p-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workflowData.workflow_rules.map((rule: any) => (
                  <tr key={rule.id} className="border-b hover:bg-muted/50">
                    <td className="p-3 font-medium">{rule.name}</td>
                    <td className="p-3">
                      <Badge variant={rule.status.active ? "default" : "secondary"}>
                        {rule.status.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground capitalize">
                      {rule.execute_when?.type?.replace(/_/g, ' ') || '-'}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {rule.modified_time ? new Date(rule.modified_time).toLocaleDateString() : '-'}
                    </td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => handleViewUsage(rule)}>
                        <Activity className="w-3 h-3 mr-2" /> Report
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Usage Report Dialog */}
      <Dialog open={isUsageModalOpen} onOpenChange={setIsUsageModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Usage Report: {selectedRule?.name}
              </div>
              <Button variant="ghost" size="icon" onClick={() => refetchUsage()} disabled={isLoadingUsage}>
                <RefreshCw className={`h-4 w-4 ${isLoadingUsage ? "animate-spin" : ""}`} />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Date Filter */}
            <div className="flex items-end gap-4 bg-muted/30 p-4 rounded-lg border">
              <div className="flex-1">
                <Label className="text-xs mb-1.5 block">From Date</Label>
                <Input 
                  type="date" 
                  value={dateRange.from} 
                  onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs mb-1.5 block">To Date</Label>
                <Input 
                  type="date" 
                  value={dateRange.to} 
                  onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                />
              </div>
              <Button onClick={() => refetchUsage()} disabled={isLoadingUsage}>
                {isLoadingUsage ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
              </Button>
            </div>

            {isLoadingUsage ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-primary mx-auto animate-spin" />
                <p className="text-sm text-muted-foreground mt-2">Fetching usage data...</p>
              </div>
            ) : usageData?.workflow_rules?.[0] ? (
              <div className="space-y-6">
                {/* Overall Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Triggers</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{usageData.workflow_rules[0].trigger_count || 0}</div>
                    </CardContent>
                   </Card>
                </div>

                {/* Detailed Action Stats */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Action Breakdown</h4>
                  {usageData.workflow_rules[0].conditions?.map((condition: any, idx: number) => (
                    <div key={condition.id || idx} className="mb-6 border rounded-lg overflow-hidden">
                      <div className="bg-muted/50 px-4 py-2 border-b flex justify-between items-center">
                        <span className="font-medium text-sm">Condition #{idx + 1}</span>
                        <Badge variant="outline">Matched: {condition.usage_count}</Badge>
                      </div>
                      
                      {/* Instant Actions */}
                      {condition.instant_actions?.actions?.length > 0 && (
                        <div className="p-4">
                          <h5 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Instant Actions</h5>
                          <div className="space-y-3">
                            {condition.instant_actions.actions.map((action: any) => (
                              <ActionDetailsCard key={action.id} action={action} />
                            ))}
                          </div>
                        </div>
                      )}

                       {/* Scheduled Actions */}
                       {condition.scheduled_actions?.length > 0 && (
                        <div className="p-4 border-t">
                          <h5 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">Scheduled Actions</h5>
                          {condition.scheduled_actions.map((group: any) => (
                            <div key={group.id} className="space-y-3">
                               {group.actions?.map((action: any) => (
                                  <ActionDetailsCard key={action.id} action={action} isDelayed />
                               ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No usage data available for this period.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper Component for Action Details
function ActionDetailsCard({ action, isDelayed }: { action: any, isDelayed?: boolean }) {
    const details = action.related_details || {};

    return (
        <div className="text-sm bg-background p-3 rounded border">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    {isDelayed && <Badge variant="outline" className="text-[10px]">Delayed</Badge>}
                    <Badge variant="secondary" className="text-[10px]">{action.type}</Badge>
                    <span className="font-medium">{action.name}</span>
                </div>
                <div className="flex gap-4 text-xs">
                    <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="font-semibold">{action.success_count}</span>
                    </div>
                    <div className="flex items-center gap-1 text-red-600">
                        <XCircle className="w-3 h-3" />
                        <span className="font-semibold">{action.failure_count}</span>
                    </div>
                </div>
            </div>

            {/* Email specific metrics grid */}
            {action.type === 'email_notifications' && details.sent !== undefined && (
                <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mt-3 pt-3 border-t text-xs text-muted-foreground">
                    <div className="flex flex-col items-center bg-muted/20 p-1.5 rounded">
                        <span className="font-bold text-foreground">{details.sent || 0}</span>
                        <span className="text-[10px] mt-0.5">Sent</span>
                    </div>
                    <div className="flex flex-col items-center bg-muted/20 p-1.5 rounded">
                        <span className="font-bold text-foreground">{details.delivered || 0}</span>
                        <span className="text-[10px] mt-0.5">Delivered</span>
                    </div>
                    <div className="flex flex-col items-center bg-green-50 p-1.5 rounded">
                        <span className="font-bold text-green-700">{details.opened || 0}</span>
                        <span className="text-[10px] mt-0.5">Opened</span>
                    </div>
                     <div className="flex flex-col items-center bg-blue-50 p-1.5 rounded">
                        <span className="font-bold text-blue-700">{details.clicked || 0}</span>
                        <span className="text-[10px] mt-0.5">Clicked</span>
                    </div>
                    <div className="flex flex-col items-center bg-yellow-50 p-1.5 rounded">
                        <span className="font-bold text-yellow-700">{details.unopened || 0}</span>
                        <span className="text-[10px] mt-0.5">Unopened</span>
                    </div>
                    <div className="flex flex-col items-center bg-red-50 p-1.5 rounded">
                        <span className="font-bold text-red-700">{details.bounced || 0}</span>
                        <span className="text-[10px] mt-0.5">Bounced</span>
                    </div>
                    <div className="flex flex-col items-center bg-orange-50 p-1.5 rounded">
                        <span className="font-bold text-orange-700">{details.unsent || 0}</span>
                        <span className="text-[10px] mt-0.5">Unsent</span>
                    </div>
                     <div className="flex flex-col items-center bg-gray-50 p-1.5 rounded">
                        <span className="font-bold text-gray-700">{details.sent_percentage || 0}%</span>
                        <span className="text-[10px] mt-0.5">Rate</span>
                    </div>
                </div>
            )}
        </div>
    );
}