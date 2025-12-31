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
import { Rocket, StopCircle, Plus, X, Loader2, RefreshCw, Save, Download, Filter, Pause, Play, Eye } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function BulkContactsBigin() {
  const { data: accounts = [] } = useAccounts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [allFormsData, setAllFormsData] = useState(bulkContactsState.getState());

  // Show only Bigin accounts
  const validAccounts = useMemo(() => accounts.filter((acc: any) => acc.supports_bigin === true), [accounts]);

  // States
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userFirstName, setUserFirstName] = useState<string>("");
  const [availableFields, setAvailableFields] = useState<any[]>([]);
  const [selectedFieldToAdd, setSelectedFieldToAdd] = useState<string>("");
  const [visibleCustomFields, setVisibleCustomFields] = useState<string[]>([]);
  const [showCustomOnly, setShowCustomOnly] = useState(true);
  const [modalContent, setModalContent] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isPolling, setIsPolling] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  useEffect(() => {
    bulkContactsState.subscribe(setAllFormsData);
    return () => bulkContactsState.unsubscribe(setAllFormsData);
  }, []);

  useEffect(() => {
    if (validAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(validAccounts[0].id.toString());
    }
  }, [validAccounts, selectedAccountId]);

  // --- JOB STATUS (Poll every 500ms when active) ---
  const { data: jobStatuses = {} } = useQuery({
    queryKey: ['/api/jobs/status'],
    refetchInterval: 500, // Fast polling
  });

  // Find Current Job (Robust Matching)
  const currentJob = useMemo(() => {
    if (!selectedAccountId) return null;
    return jobStatuses[selectedAccountId] || jobStatuses[String(selectedAccountId)] || jobStatuses[Number(selectedAccountId)];
  }, [jobStatuses, selectedAccountId]);

  // Timer Logic
  useEffect(() => {
    if (currentJob?.status === 'processing') {
      setIsPolling(true);
      const interval = setInterval(() => setElapsedTime(p => p + 1), 1000);
      return () => clearInterval(interval);
    } else if (currentJob?.status === 'processing' && !isPolling) {
       setElapsedTime(0); // Reset on new job
    } else {
        setIsPolling(false);
    }
  }, [currentJob?.status]);

  const formattedTime = useMemo(() => {
    const mins = Math.floor(elapsedTime / 60).toString().padStart(2, '0');
    const secs = (elapsedTime % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }, [elapsedTime]);

  // --- API FETCHERS ---
  const { data: fromAddresses = [] } = useQuery({
    queryKey: ['/api/bigin/from_addresses', selectedAccountId],
    queryFn: async () => {
        if (!selectedAccountId) return [];
        try {
            const res = await apiRequest('GET', `/api/bigin/from_addresses/${selectedAccountId}`);
            return await res.json();
        } catch { return []; }
    },
    enabled: !!selectedAccountId
  });

  const { data: users = [], refetch: refetchUsers } = useQuery({
    queryKey: ['/api/bigin/users', selectedAccountId],
    queryFn: async () => {
        if (!selectedAccountId) return [];
        try {
            const res = await apiRequest('GET', `/api/bigin/users/${selectedAccountId}`);
            return await res.json();
        } catch { return []; }
    },
    enabled: !!selectedAccountId
  });

  const { data: zohoFieldsData } = useQuery({
    queryKey: ['/api/bigin/fields', selectedAccountId],
    queryFn: async () => {
        if (!selectedAccountId) return null;
        try {
            const res = await apiRequest('GET', `/api/bigin/fields/${selectedAccountId}`);
            return await res.json();
        } catch { return null; }
    },
    enabled: !!selectedAccountId
  });

  // --- AUTO SELECTORS ---
  useEffect(() => {
    if (fromAddresses.length > 0 && selectedAccountId) {
      bulkContactsState.setFromEmail(selectedAccountId, fromAddresses[0].email);
    }
  }, [fromAddresses, selectedAccountId]);

  useEffect(() => {
    if (Array.isArray(users) && users.length > 0 && !selectedUserId) {
      const first = users[0];
      setSelectedUserId(first.id);
      setUserFirstName(first.first_name || "");
    }
  }, [users, selectedUserId]);

  const updateUserMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest('PUT', `/api/bigin/users/${data.accountId}/${data.userId}`, { first_name: data.firstName });
    },
    onSuccess: () => {
        toast({ title: "Updated", description: "User name updated." });
        refetchUsers();
    }
  });

  // --- FORM HANDLERS ---
  const formData = allFormsData[selectedAccountId] || initialFormData;
  const handleFormChange = (f: string, v: any) => bulkContactsState.updateFormData(selectedAccountId, f, v);
  const handleCustomFieldChange = (f: string, v: any) => bulkContactsState.updateCustomField(selectedAccountId, f, v);

  useEffect(() => {
    if (zohoFieldsData?.fields) {
        const ignored = ['Last_Name', 'Email', 'id', 'Created_Time', 'Modified_Time'];
        setAvailableFields(zohoFieldsData.fields.filter((f: any) => 
            !ignored.includes(f.api_name) && f.view_type?.create && (!showCustomOnly || f.custom_field)
        ));
    }
  }, [zohoFieldsData, showCustomOnly]);

  const startJob = async () => {
    setElapsedTime(0);
    const emails = formData.emails.split('\n').map((e:string) => e.trim()).filter(Boolean);
    if (!emails.length) return toast({ title: "No Emails", variant: "destructive" });

    // Use current input name for FROM name
    const fromUser = users.find((u:any) => u.id === selectedUserId);
    const senderName = userFirstName || fromUser?.first_name;

    await apiRequest('POST', `/api/jobs/start/${selectedAccountId}`, {
        emails,
        platform: 'bigin',
        ...formData,
        fromAddresses: fromAddresses.map((a:any) => ({ ...a, user_name: senderName }))
    });
    queryClient.invalidateQueries({ queryKey: ['/api/jobs/status'] });
    toast({ title: "Job Started" });
  };

  const controlJob = async (action: string) => {
      await apiRequest('POST', `/api/jobs/${action}/${selectedAccountId}`, {});
      queryClient.invalidateQueries({ queryKey: ['/api/jobs/status'] });
  };

  const handleExport = () => {
      if (!currentJob?.results) return;
      const text = currentJob.results.map((r:any) => r.email).join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'export.txt'; a.click();
  };

  // --- CALCULATED RESULTS ---
  const results = useMemo(() => {
      if (!currentJob?.results) return [];
      const res = [...currentJob.results].reverse();
      if (filterStatus === 'all') return res;
      return res.filter((r:any) => filterStatus === 'success' ? (r.contactStatus === 'Success') : (r.contactStatus !== 'Success'));
  }, [currentJob, filterStatus]);

  const stats = useMemo(() => {
      if (!currentJob?.results) return { success: 0, fail: 0 };
      const success = currentJob.results.filter((r:any) => r.contactStatus === 'Success' && (r.emailStatus === 'Success' || r.emailStatus === 'Skipped')).length;
      return { success, fail: currentJob.results.length - success };
  }, [currentJob]);

  return (
    <div className="space-y-8">
      {/* 1. TOP CARD: SETTINGS */}
      <div className="border rounded-lg p-6 bg-card shadow-sm">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2"><span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Bigin</span> Settings</h3>
            {currentJob && (
                <div className="flex items-center gap-3 text-sm bg-muted/30 px-3 py-1.5 rounded-md border">
                    <span className="font-mono">{formattedTime}</span> | <span className="text-green-600 font-bold">{stats.success}</span> | <span className="text-red-600 font-bold">{stats.fail}</span>
                </div>
            )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
            <div>
                <Label>Account</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                    <SelectContent>{validAccounts.map((a:any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div>
                <Label>User</Label>
                <Select value={selectedUserId} onValueChange={(id) => { setSelectedUserId(id); setUserFirstName(users.find((u:any)=>u.id===id)?.first_name || ""); }}>
                    <SelectTrigger><SelectValue placeholder="Select User" /></SelectTrigger>
                    <SelectContent>{users.map((u:any) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div className="flex gap-2">
                <Input value={userFirstName} onChange={(e) => setUserFirstName(e.target.value)} placeholder="Sender Name" />
                <Button onClick={() => updateUserMutation.mutate({ accountId: selectedAccountId, userId: selectedUserId, firstName: userFirstName })}><Save className="w-4 h-4" /></Button>
            </div>
        </div>
      </div>

      {/* 2. MIDDLE CARD: FORM */}
      <div className="border rounded-lg p-6 bg-card shadow-sm">
         <div className="mb-4 flex gap-2 items-center">
            <Checkbox checked={showCustomOnly} onCheckedChange={(c)=>setShowCustomOnly(!!c)} /> <span className="text-sm">Custom Fields Only</span>
            <Select value={selectedFieldToAdd} onValueChange={setSelectedFieldToAdd}><SelectTrigger className="w-48"><SelectValue placeholder="Add Field" /></SelectTrigger>
                <SelectContent>{availableFields.filter(f=>!visibleCustomFields.includes(f.api_name)).map((f:any)=><SelectItem key={f.api_name} value={f.api_name}>{f.display_label}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="secondary" onClick={()=>{if(selectedFieldToAdd) {setVisibleCustomFields([...visibleCustomFields, selectedFieldToAdd]); setSelectedFieldToAdd("");}}}><Plus className="w-4 h-4" /></Button>
         </div>

         <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
                <Input placeholder="Last Name" value={formData.lastName} onChange={(e) => handleFormChange("lastName", e.target.value)} />
                {visibleCustomFields.map(field => (
                    <div key={field} className="flex gap-2 items-center">
                        <Label className="w-1/3">{field}</Label>
                        <Input value={formData.customFields?.[field]||""} onChange={(e) => handleCustomFieldChange(field, e.target.value)} />
                        <X className="w-4 h-4 cursor-pointer" onClick={() => setVisibleCustomFields(visibleCustomFields.filter(f=>f!==field))} />
                    </div>
                ))}
                <div className="flex justify-between items-center bg-muted/20 p-2 rounded">
                    <div className="flex items-center gap-2"><Checkbox checked={formData.sendEmail} onCheckedChange={(c)=>handleFormChange("sendEmail", !!c)} /><Label>Send Email</Label></div>
                    <div className="flex items-center gap-2"><Checkbox checked={formData.checkStatus} onCheckedChange={(c)=>handleFormChange("checkStatus", !!c)} /><Label>Live Check</Label></div>
                </div>
                {formData.sendEmail && (
                    <>
                        <Select value={formData.fromEmail} onValueChange={(v)=>handleFormChange("fromEmail", v)}><SelectTrigger><SelectValue placeholder="From Address" /></SelectTrigger><SelectContent>{fromAddresses.map((a:any)=><SelectItem key={a.email} value={a.email}>{a.email}</SelectItem>)}</SelectContent></Select>
                        <Input placeholder="Subject" value={formData.subject} onChange={(e)=>handleFormChange("subject", e.target.value)} />
                    </>
                )}
                <Input type="number" placeholder="Delay (sec)" value={formData.delay} onChange={(e)=>handleFormChange("delay", +e.target.value)} />
            </div>
            <div className="space-y-4 flex flex-col">
                <Textarea className="flex-1" placeholder="Emails..." value={formData.emails} onChange={(e)=>handleFormChange("emails", e.target.value)} />
                {formData.sendEmail && <Textarea rows={4} placeholder="Content HTML..." value={formData.content} onChange={(e)=>handleFormChange("content", e.target.value)} />}
                
                <div className="flex gap-2 mt-auto">
                    {currentJob?.status === 'processing' ? (
                        <>
                            <Button className="flex-1" variant="outline" onClick={()=>controlJob('pause')}><Pause className="mr-2 w-4 h-4"/>Pause</Button>
                            <Button className="flex-1" variant="destructive" onClick={()=>controlJob('stop')}><StopCircle className="mr-2 w-4 h-4"/>Stop</Button>
                        </>
                    ) : currentJob?.status === 'paused' ? (
                        <Button className="flex-1" onClick={()=>controlJob('resume')}><Play className="mr-2 w-4 h-4"/>Resume</Button>
                    ) : (
                        <Button className="flex-1" onClick={startJob} disabled={!selectedAccountId}><Rocket className="mr-2 w-4 h-4"/>Start</Button>
                    )}
                </div>
            </div>
         </div>
      </div>

      {/* 3. RESULTS TABLE */}
      {currentJob && (
        <div className="border rounded-lg p-6 bg-card shadow-sm">
            <div className="flex justify-between mb-4">
                <h3 className="font-bold">Results ({currentJob.platform})</h3>
                <div className="flex gap-2">
                    <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="success">Success</SelectItem></SelectContent></Select>
                    <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4" /></Button>
                </div>
            </div>
            <Progress value={(currentJob.processed / currentJob.total) * 100} className="mb-4 h-2" />
            <div className="overflow-auto max-h-96">
                <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0"><tr><th className="p-2 text-left">Email</th><th className="p-2">Contact</th><th className="p-2">Email</th><th className="p-2">Live</th></tr></thead>
                    <tbody>
                        {results.map((r:any, i:number) => (
                            <tr key={i} className="border-b">
                                <td className="p-2">{r.email}</td>
                                <td className="p-2 text-center"><Badge variant={r.contactStatus==='Success'?'default':'destructive'} onClick={()=>setModalContent(r.response.contact)} className="cursor-pointer">{r.isDuplicate?'Duplicate':r.contactStatus}</Badge></td>
                                <td className="p-2 text-center"><Badge variant={r.emailStatus==='Success'?'default':'secondary'} onClick={()=>setModalContent(r.response.email)} className="cursor-pointer">{r.emailStatus}</Badge></td>
                                <td className="p-2 text-center"><Badge variant="outline" onClick={()=>setModalContent(r.response.live)} className="cursor-pointer">{r.liveStatus}</Badge></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      <Dialog open={!!modalContent} onOpenChange={()=>setModalContent(null)}>
        <DialogContent><DialogHeader><DialogTitle>Details</DialogTitle></DialogHeader>
        <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-96">{JSON.stringify(modalContent, null, 2)}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}