import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAccounts } from "@/hooks/use-accounts";
import { apiRequest } from "@/lib/queryClient";
import bulkContactsState, { initialFormData } from "@/lib/bulkContactsState";
import { getZohoFields } from "@/lib/api";
import { Rocket, StopCircle, Mail, Circle, X, Filter, Download, RefreshCw, Eye, Pause, Play, Plus, Save } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export default function BulkContacts() {
  const { data: accounts = [] } = useAccounts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [allFormsData, setAllFormsData] = useState(bulkContactsState.getState());

  // User Selection State
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userFirstName, setUserFirstName] = useState<string>("");

  // State for Dynamic Fields
  const [availableFields, setAvailableFields] = useState<any[]>([]);
  const [selectedFieldToAdd, setSelectedFieldToAdd] = useState<string>("");
  const [visibleCustomFields, setVisibleCustomFields] = useState<string[]>([]);
  const [showCustomOnly, setShowCustomOnly] = useState(true); // Default to true

  useEffect(() => {
    bulkContactsState.subscribe(setAllFormsData);
    return () => bulkContactsState.unsubscribe(setAllFormsData);
  }, []);

  const [modalContent, setModalContent] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isPollingActive, setIsPollingActive] = useState(false);
  
  const [timerStates, setTimerStates] = useState<Record<string, { elapsedSeconds: number; isRunning: boolean }>>({});
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: jobStatuses = {} } = useQuery({
    queryKey: ['/api/jobs/status'],
    refetchInterval: isPollingActive ? 1000 : false,
  });
  
  const { data: fromAddresses = [], isLoading: isLoadingFromAddresses } = useQuery({
    queryKey: ['/api/zoho/from_addresses', selectedAccountId],
    enabled: !!selectedAccountId,
  });

  const { data: zohoFieldsData, isLoading: isLoadingFields } = useQuery({
    queryKey: ['/api/zoho/fields', selectedAccountId],
    queryFn: () => getZohoFields(selectedAccountId),
    enabled: !!selectedAccountId,
  });

  const { data: users = [], refetch: refetchUsers, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['/api/zoho/users', selectedAccountId],
    enabled: !!selectedAccountId,
  });

  // Auto-select first user when users list loads or changes
  useEffect(() => {
    if (Array.isArray(users) && users.length > 0 && !selectedUserId) {
      const firstUser = users[0];
      setSelectedUserId(firstUser.id);
      setUserFirstName(firstUser.first_name || "");
    }
  }, [users, selectedUserId]);

  // Re-run this effect whenever zohoFieldsData OR showCustomOnly changes
  useEffect(() => {
    if (zohoFieldsData && zohoFieldsData.fields) {
      const ignoredFields = ['Last_Name', 'Email', 'id', 'Created_Time', 'Modified_Time'];
      
      const filtered = zohoFieldsData.fields.filter((f: any) => {
        // Must not be ignored
        if (ignoredFields.includes(f.api_name)) return false;
        // Must be creatable
        if (!f.view_type?.create) return false;
        // Check custom flag if enabled
        if (showCustomOnly && !f.custom_field) return false;
        
        return true;
      });
      
      setAvailableFields(filtered);
    }
  }, [zohoFieldsData, showCustomOnly]);

  const currentJob = useMemo(() => jobStatuses[selectedAccountId] || null, [jobStatuses, selectedAccountId]);
  
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id.toString());
    }
  }, [accounts, selectedAccountId]);
  
  useEffect(() => {
    if (fromAddresses.length > 0 && selectedAccountId) {
      bulkContactsState.setFromEmail(selectedAccountId, fromAddresses[0].email);
    }
  }, [fromAddresses, selectedAccountId]);

  // Updated Polling Logic to wait for 'Pending' items even if job is completed
  useEffect(() => {
    const isAnyJobActive = Object.values(jobStatuses).some((job: any) => {
        if (job.status === 'processing') return true;
        // If job is completed, check if there are any pending live checks
        if (job.status === 'completed' && job.results && Array.isArray(job.results)) {
            return job.results.some((r: any) => r.liveStatus === 'Pending');
        }
        return false;
    });

    setIsPollingActive(isAnyJobActive);

    setTimerStates(prevStates => {
      const newStates = { ...prevStates };
      let somethingChanged = false;
      for (const accountId in jobStatuses) {
        const job = jobStatuses[accountId];
        const currentState = newStates[accountId] || { elapsedSeconds: 0, isRunning: false };
        // Sync timer running state with the job processing status
        if (job.status === 'processing' && !currentState.isRunning) {
          newStates[accountId] = { ...currentState, isRunning: true };
          somethingChanged = true;
        } else if (job.status !== 'processing' && currentState.isRunning) {
          newStates[accountId] = { ...currentState, isRunning: false };
          somethingChanged = true;
        }
      }
      return somethingChanged ? newStates : prevStates;
    });
  }, [jobStatuses]);
  
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimerStates(prev => {
        const newStates = { ...prev };
        let hasChanges = false;
        for (const accountId in newStates) {
          if (newStates[accountId].isRunning) {
            newStates[accountId] = { ...newStates[accountId], elapsedSeconds: newStates[accountId].elapsedSeconds + 1 };
            hasChanges = true;
          }
        }
        return hasChanges ? newStates : prev;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const elapsedTime = useMemo(() => {
    const seconds = timerStates[selectedAccountId]?.elapsedSeconds || 0;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }, [timerStates, selectedAccountId]);

  const isJobRunning = currentJob?.status === 'processing' || currentJob?.status === 'paused';
  const formData = allFormsData[selectedAccountId] || initialFormData;
  
  const handleFormChange = (field: keyof typeof initialFormData, value: any) => {
    bulkContactsState.updateFormData(selectedAccountId, field, value);
  };

  const handleAddCustomField = () => {
    if (!selectedFieldToAdd) return;
    if (!visibleCustomFields.includes(selectedFieldToAdd)) {
      setVisibleCustomFields([...visibleCustomFields, selectedFieldToAdd]);
    }
    setSelectedFieldToAdd("");
  };

  const handleRemoveCustomField = (apiName: string) => {
    setVisibleCustomFields(visibleCustomFields.filter(f => f !== apiName));
    bulkContactsState.updateCustomField(selectedAccountId, apiName, undefined);
  };

  const handleCustomFieldChange = (apiName: string, value: any) => {
    bulkContactsState.updateCustomField(selectedAccountId, apiName, value);
  };

  const updateUserMutation = useMutation({
    mutationFn: async ({ accountId, userId, firstName }: { accountId: string, userId: string, firstName: string }) => {
      const response = await apiRequest('PUT', `/api/zoho/users/${accountId}/${userId}`, { first_name: firstName });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "User updated successfully!" });
      refetchUsers();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: `Failed to update user: ${error.message}`, variant: "destructive" });
    },
  });

  // New function to handle account changes properly
  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    setSelectedUserId(""); // Reset user selection
    setUserFirstName(""); // Reset user name
  };

  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId);
    const user = (users as any[]).find((u) => u.id === userId);
    if (user) {
      setUserFirstName(user.first_name || "");
    }
  };

  const handleUpdateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAccountId && selectedUserId && userFirstName) {
      updateUserMutation.mutate({ accountId: selectedAccountId, userId: selectedUserId, firstName: userFirstName });
    }
  };

  const handleStartProcess = async () => {
    const emailList = formData.emails.split('\n').map(e => e.trim()).filter(Boolean);
    if (emailList.length === 0) {
      toast({ title: "No emails entered", variant: "destructive" });
      return;
    }

    const { emails: _emails, ...restOfFormData } = formData;
    
    setTimerStates(prev => ({
        ...prev,
        [selectedAccountId]: { elapsedSeconds: 0, isRunning: true }
    }));
    
    // Get the current user name if available for email sending
    const currentUser = (users as any[]).find(u => u.id === selectedUserId);
    const fromUserName = currentUser ? currentUser.first_name : undefined;

    await apiRequest('POST', `/api/jobs/start/${selectedAccountId}`, {
      emails: emailList,
      ...restOfFormData,
      fromAddresses: fromAddresses.map((addr: any) => ({
          ...addr,
          user_name: fromUserName || addr.user_name // Use updated name if available
      })),
    });
    
    await queryClient.invalidateQueries({ queryKey: ['/api/jobs/status'] });
    toast({ title: "Job Started", description: `Bulk process for account ${selectedAccountId} has begun.` });
  };
  
  const handleEndJob = async () => {
    await apiRequest('POST', `/api/jobs/stop/${selectedAccountId}`, {});
    await queryClient.invalidateQueries({ queryKey: ['/api/jobs/status'] });
    toast({ title: "Job Stopped", description: `Bulk process for account ${selectedAccountId} has been stopped.` });
  };

  const handlePauseJob = async () => {
    await apiRequest('POST', `/api/jobs/pause/${selectedAccountId}`, {});
    await queryClient.invalidateQueries({ queryKey: ['/api/jobs/status'] });
    toast({ title: "Job Paused" });
  };

  const handleResumeJob = async () => {
    await apiRequest('POST', `/api/jobs/resume/${selectedAccountId}`, {});
    await queryClient.invalidateQueries({ queryKey: ['/api/jobs/status'] });
    toast({ title: "Job Resumed" });
  };

  const filteredResults = useMemo(() => {
    if (!currentJob?.results) return [];
    const resultsWithStatus = currentJob.results.map((result: any) => {
      const isDuplicate = result.response?.contact?.data?.[0]?.code === 'DUPLICATE_DATA';
      const isSuccess = result.contactStatus === 'Success' && !isDuplicate && result.emailStatus === 'Success';
      return { ...result, isSuccess, isDuplicate };
    });
    if (filterStatus === 'all') return resultsWithStatus;
    return resultsWithStatus.filter((result: any) => filterStatus === 'success' ? result.isSuccess : !result.isSuccess);
  }, [currentJob, filterStatus]);

  // Simplified and Fixed Counter Logic
  const { successCount, failCount } = useMemo(() => {
    if (!currentJob?.results) return { successCount: 0, failCount: 0 };
    
    return currentJob.results.reduce(
        (acc: { successCount: number; failCount: number }, result: any) => {
            const isContactSuccess = result.contactStatus === 'Success' || (result.response?.contact?.data?.[0]?.code === 'DUPLICATE_DATA');
            
            if (isContactSuccess) {
                if (result.emailStatus === 'Success' || result.emailStatus === 'Skipped' || result.liveStatus === 'Sent') {
                    acc.successCount++;
                } else {
                    acc.failCount++;
                }
            } else {
                acc.failCount++;
            }
            return acc;
        }, 
        { successCount: 0, failCount: 0 }
    );
  }, [currentJob?.results]);

  const handleExport = () => { 
    if (filteredResults.length === 0) {
        toast({ title: "No results to export", variant: "destructive" });
        return;
    }
    const emailsToExport = filteredResults.map((result: any) => result.email).join('\n');
    const blob = new Blob([emailsToExport], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `exported_emails_${new Date().toISOString()}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export successful!", description: `Exported ${filteredResults.length} emails.`});
  };

  const emailCount = formData.emails.split('\n').filter(Boolean).length;
  const progressPercentage = currentJob?.total > 0 ? ((currentJob?.processed || 0) / currentJob.total) * 100 : 0;

  return (
    <div className="space-y-8">
      {/* Settings & User Manager Card with Header Stats */}
      <div className="form-card">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b pb-4">
            <h3 className="text-lg font-semibold text-foreground">Settings & User Manager</h3>
            
            {/* Stats Counter - Moved to Header */}
            {selectedAccountId && (
                <div className="flex items-center gap-3 text-sm bg-muted/30 px-3 py-1.5 rounded-md border border-border/50 mt-2 md:mt-0">
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Time</span>
                        <span className="font-mono font-medium">{elapsedTime}</span>
                    </div>
                    <div className="h-3 w-px bg-border"></div>
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Success</span>
                        <span className="font-bold text-green-600">{successCount}</span>
                    </div>
                    <div className="h-3 w-px bg-border"></div>
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Fail</span>
                        <span className="font-bold text-red-600">{failCount}</span>
                    </div>
                </div>
            )}
        </div>

        <form onSubmit={handleUpdateUser} className="mb-4 pb-4">
            <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                    <Label htmlFor="single-account-select" className="mb-2 block">Select Account</Label>
                    <Select value={selectedAccountId} onValueChange={handleAccountChange}>
                        <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
                        <SelectContent>
                            {accounts.map((account) => (<SelectItem key={account.id} value={account.id.toString()}>{account.name}</SelectItem>))}
                        </SelectContent>
                    </Select>
                </div>
                
                <div className="flex-1 w-full flex gap-2">
                    <div className="flex-1">
                        <Label htmlFor="single-user-select" className="mb-2 block">Select User</Label>
                        <Select value={selectedUserId} onValueChange={handleUserChange} disabled={!selectedAccountId || isLoadingUsers}>
                            <SelectTrigger><SelectValue placeholder={isLoadingUsers ? "Loading..." : "Choose user"} /></SelectTrigger>
                            <SelectContent>
                            {(users as any[]).map((user: any) => (<SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button type="button" variant="outline" size="icon" className="mt-8" onClick={() => refetchUsers()} disabled={!selectedAccountId}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex-1 w-full">
                    <Label htmlFor="single-first-name" className="mb-2 block">First Name</Label>
                    <div className="flex gap-2">
                         <Input id="single-first-name" value={userFirstName} onChange={(e) => setUserFirstName(e.target.value)} required />
                         <Button type="submit" disabled={updateUserMutation.isPending}>
                            {updateUserMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </div>
        </form>
      </div>

      <div className="form-card">
        <h3 className="text-lg font-semibold text-foreground mb-4">Bulk Contact & Email</h3>
        
        {/* Dynamic Field Selector */}
        <div className="mb-6 p-4 border rounded-lg bg-muted/20">
            <h4 className="text-sm font-medium mb-3">Add Custom Fields</h4>
            
            {/* Checkbox to toggle custom fields */}
            <div className="flex items-center space-x-2 mb-3">
              <Checkbox 
                id="show-custom-only" 
                checked={showCustomOnly} 
                onCheckedChange={(checked) => setShowCustomOnly(checked === true)} 
              />
              <Label htmlFor="show-custom-only" className="text-xs text-muted-foreground">
                Show only custom fields
              </Label>
            </div>

            <div className="flex gap-2">
                <Select value={selectedFieldToAdd} onValueChange={setSelectedFieldToAdd} disabled={isLoadingFields || isJobRunning}>
                    <SelectTrigger className="flex-1">
                        <SelectValue placeholder={isLoadingFields ? "Loading fields..." : "Select a field to add..."} />
                    </SelectTrigger>
                    <SelectContent>
                        {availableFields
                            .filter(f => !visibleCustomFields.includes(f.api_name))
                            .map((field: any) => (
                                <SelectItem key={field.api_name} value={field.api_name}>
                                    {field.display_label} {field.custom_field ? "(Custom)" : ""}
                                </SelectItem>
                            ))
                        }
                    </SelectContent>
                </Select>
                <Button onClick={handleAddCustomField} disabled={!selectedFieldToAdd || isJobRunning} type="button" variant="secondary">
                    <Plus className="w-4 h-4 mr-2" /> Add
                </Button>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label>Recipient Last Name</Label>
              <Input value={formData.lastName} onChange={e => handleFormChange("lastName", e.target.value)} disabled={isJobRunning} />
            </div>

            {/* Dynamic Custom Fields Render Area */}
            {visibleCustomFields.map(apiName => {
                const fieldDef = zohoFieldsData?.fields?.find((f: any) => f.api_name === apiName);
                if (!fieldDef) return null;

                const currentValue = formData.customFields?.[apiName] || "";

                return (
                    <div key={apiName} className="relative p-3 border rounded-md bg-background">
                        <div className="flex justify-between items-center mb-1.5">
                            <Label>{fieldDef.display_label}</Label>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 w-6 p-0" 
                                onClick={() => handleRemoveCustomField(apiName)}
                                disabled={isJobRunning}
                            >
                                <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                            </Button>
                        </div>
                        
                        {fieldDef.data_type === 'picklist' ? (
                            <Select 
                                value={currentValue} 
                                onValueChange={(val) => handleCustomFieldChange(apiName, val)}
                                disabled={isJobRunning}
                            >
                                <SelectTrigger><SelectValue placeholder={`Select ${fieldDef.display_label}`} /></SelectTrigger>
                                <SelectContent>
                                    {fieldDef.pick_list_values?.map((opt: any) => (
                                        <SelectItem key={opt.display_value} value={opt.actual_value}>
                                            {opt.display_value}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : fieldDef.data_type === 'boolean' ? (
                            <div className="flex items-center space-x-2">
                                <Checkbox 
                                    checked={currentValue === true} 
                                    onCheckedChange={(val) => handleCustomFieldChange(apiName, val)}
                                    disabled={isJobRunning} 
                                />
                                <span className="text-sm text-muted-foreground">Yes</span>
                            </div>
                        ) : (
                            <Input 
                                type={fieldDef.data_type === 'integer' || fieldDef.data_type === 'double' ? "number" : "text"}
                                value={currentValue}
                                onChange={(e) => handleCustomFieldChange(apiName, e.target.value)}
                                disabled={isJobRunning}
                            />
                        )}
                    </div>
                );
            })}

            <div className="border-t pt-4 mt-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="send-email" checked={formData.sendEmail} onCheckedChange={checked => handleFormChange("sendEmail", checked)} />
                        <Label htmlFor="send-email">Send Email</Label>
                    </div>

                    {/* Live Status Check Checkbox */}
                     <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="check-status" 
                            checked={formData.checkStatus} 
                            onCheckedChange={checked => handleFormChange("checkStatus", checked)} 
                        />
                        <Label htmlFor="check-status">Live Status Check</Label>
                    </div>
                </div>

                {formData.sendEmail && (
                <>
                    <div className="mb-4">
                    <Label>From Address</Label>
                    <Select 
                        value={formData.fromEmail} 
                        onValueChange={value => handleFormChange("fromEmail", value)}
                        disabled={isJobRunning || isLoadingFromAddresses}
                    >
                        <SelectTrigger><SelectValue placeholder={isLoadingFromAddresses ? "Loading..." : "Choose from address"} /></SelectTrigger>
                        <SelectContent>
                        {(fromAddresses as any[]).map(address => <SelectItem key={address.email} value={address.email}>{address.email}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    </div>
                    <div className="mb-4">
                    <Label>Subject</Label>
                    <Input value={formData.subject} onChange={e => handleFormChange("subject", e.target.value)} disabled={isJobRunning} />
                    </div>
                </>
                )}
                <div>
                <Label>Delay between actions (seconds)</Label>
                <Input type="number" value={formData.delay} onChange={e => handleFormChange("delay", parseInt(e.target.value) || 0)} min="0" disabled={isJobRunning} />
                </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Recipient Emails ({emailCount} emails)</Label>
              <Textarea 
                rows={8}
                value={formData.emails}
                onChange={e => handleFormChange("emails", e.target.value)}
                placeholder="email1@example.com&#10;email2@example.com"
                disabled={isJobRunning}
              />
            </div>
            {formData.sendEmail && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="single-content">Content</Label>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline" size="sm" disabled={!formData.content}>
                        <Eye className="w-4 h-4 mr-2" /> Preview
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
                      <DialogHeader><DialogTitle>Email Content Preview</DialogTitle></DialogHeader>
                      <div className="border rounded-lg p-4 bg-white">
                        <div dangerouslySetInnerHTML={{ __html: formData.content }} className="prose max-w-none" />
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <Textarea 
                  rows={6}
                  value={formData.content}
                  onChange={e => handleFormChange("content", e.target.value)}
                  disabled={isJobRunning}
                />
              </div>
            )}
             <div className="flex space-x-2 pt-4">
              {!isJobRunning ? (
                <Button onClick={handleStartProcess} className="w-full" disabled={!selectedAccountId || isLoadingFromAddresses}>
                  <Rocket className="w-4 h-4 mr-2" /> Start Bulk Process
                </Button>
              ) : currentJob?.status === 'processing' ? (
                <>
                  <Button onClick={handlePauseJob} variant="outline" className="w-full">
                    <Pause className="w-4 h-4 mr-2" /> Pause
                  </Button>
                  <Button onClick={handleEndJob} variant="destructive" className="w-full">
                    <StopCircle className="w-4 h-4 mr-2" /> End Job
                  </Button>
                </>
              ) : currentJob?.status === 'paused' ? (
                 <>
                  <Button onClick={handleResumeJob} className="w-full">
                    <Play className="w-4 h-4 mr-2" /> Resume
                  </Button>
                  <Button onClick={handleEndJob} variant="destructive" className="w-full">
                    <StopCircle className="w-4 h-4 mr-2" /> End Job
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      
      {currentJob && (
        <div className="form-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">Results</h3>
            <div className="flex items-center space-x-2">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[180px]"><Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Filter by Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={handleExport}>
                  <Download className="w-4 h-4 mr-2" /> Export to TXT
                </Button>
            </div>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <Progress value={progressPercentage} className="w-full h-2" />
            <div className="flex items-center justify-end text-sm font-medium text-muted-foreground whitespace-nowrap w-48">
              <span>{currentJob.processed || 0} / {currentJob.total || 0}</span>
              {currentJob.status === 'processing' && currentJob.countdown > 0 && (
                <span className="ml-2">(Next in {currentJob.countdown}s)</span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 w-12">No.</th>
                  <th className="text-left p-2">Email</th>
                  <th className="text-center p-2">Contact Status</th>
                  <th className="text-center p-2">Email Status</th>
                  <th className="text-center p-2">Live Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.slice().reverse().map((result: any, index: number) => {
                  const isContactSuccess = result.contactStatus === 'Success';
                  
                  // --- 1. Contact Status Logic ---
                  const contactStatusText = result.isDuplicate ? 'Duplicate' : result.contactStatus;
                  const contactStatusColor = isContactSuccess ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600';

                  // --- 2. Email Status Logic ---
                  // Shows 'Skipped' if sending was disabled, or the original success/fail status
                  let emailStatusText = result.emailStatus;
                  let emailStatusColor = 'bg-red-500 hover:bg-red-600';
                  
                  if (emailStatusText === 'Success') {
                      emailStatusColor = 'bg-green-500 hover:bg-green-600';
                  } else if (emailStatusText === 'Skipped') {
                      emailStatusColor = 'bg-yellow-500 hover:bg-yellow-600';
                  }

                  // --- 3. Live Status Logic ---
                  let liveStatusText = "Skipped";
                  let liveStatusColor = "bg-yellow-500 hover:bg-yellow-600";

                  if (formData.checkStatus) {
                      if (result.liveStatus && result.liveStatus !== 'Pending') {
                          liveStatusText = result.liveStatus;
                          // Color mapping for Live Status
                          if (liveStatusText === 'Sent') {
                              liveStatusColor = "bg-green-500 hover:bg-green-600";
                          } else if (liveStatusText === 'Bounced' || liveStatusText === 'Failed') {
                              liveStatusColor = "bg-red-500 hover:bg-red-600";
                          } else if (liveStatusText === 'Checking...') {
                              liveStatusColor = "bg-blue-500 hover:bg-blue-600";
                          } else {
                              liveStatusColor = "bg-gray-500 hover:bg-gray-600";
                          }
                      } else if (result.contactStatus !== 'Success' && !result.isDuplicate) {
                           liveStatusText = "Failed";
                           liveStatusColor = "bg-red-500 hover:bg-red-600";
                      } else {
                          liveStatusText = "Checking..."; 
                          liveStatusColor = "bg-blue-500 hover:bg-blue-600";
                      }
                  }

                  return (
                    <tr key={index} className="border-b">
                      <td className="p-2">{filteredResults.length - index}</td>
                      <td className="p-2">{result.email}</td>
                      
                      {/* Contact Status */}
                      <td className="p-2 text-center">
                        <button onClick={() => setModalContent(result.response.contact)}>
                          <Badge className={contactStatusColor}>{contactStatusText}</Badge>
                        </button>
                      </td>

                      {/* Email Status (Action) */}
                      <td className="p-2 text-center">
                        <button onClick={() => setModalContent(result.response.email)}>
                          <Badge className={emailStatusColor}>{emailStatusText}</Badge>
                        </button>
                      </td>

                      {/* Live Status (Background Check) */}
                      <td className="p-2 text-center">
                        <button onClick={() => setModalContent(result.response?.live)}>
                          <Badge className={liveStatusColor}>{liveStatusText}</Badge>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={!!modalContent} onOpenChange={(isOpen) => !isOpen && setModalContent(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>API Response Details</DialogTitle>
          </DialogHeader>
          <pre className="bg-muted border rounded-lg p-4 text-sm overflow-auto flex-1">
            {JSON.stringify(modalContent, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}