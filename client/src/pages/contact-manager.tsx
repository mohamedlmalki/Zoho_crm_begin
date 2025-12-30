import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccounts } from "@/hooks/use-accounts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Trash2, Loader2, ListFilter, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface BatchStatus {
  id: number;
  range: string;
  count: number;
  status: 'pending' | 'processing' | 'success' | 'failed';
  error?: string;
}

export default function ContactManager() {
  const { data: accounts = [] } = useAccounts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  
  // Batch Processing State
  const [isDeleting, setIsDeleting] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [batchStatuses, setBatchStatuses] = useState<BatchStatus[]>([]);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id.toString());
    }
  }, [accounts, selectedAccountId]);

  const { data: contacts = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/zoho/contacts', selectedAccountId],
    enabled: !!selectedAccountId,
  });

  const deleteBatchMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return apiRequest('DELETE', `/api/zoho/contacts/${selectedAccountId}`, { ids });
    },
  });
  
  const handleAccountChange = (accountId: string) => {
    setSelectedContacts([]);
    setSelectedAccountId(accountId);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allContactIds = contacts.map((c: any) => c.id);
      setSelectedContacts(allContactIds);
    } else {
      setSelectedContacts([]);
    }
  };

  const handleSelectContact = (id: string, checked: boolean) => {
    setSelectedContacts(prev => 
      checked ? [...prev, id] : prev.filter(contactId => contactId !== id)
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedContacts.length === 0) {
      toast({ title: "No contacts selected", description: "Please select at least one contact to delete." });
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedContacts.length} contacts?`)) {
      return;
    }

    // Initialize Batch State
    setIsDeleting(true);
    setShowProgress(true);
    setCompletedCount(0);
    
    const BATCH_SIZE = 100;
    const totalContacts = selectedContacts.length;
    const batches: string[][] = [];
    const initialStatuses: BatchStatus[] = [];

    // Create Batches and Initial Statuses
    for (let i = 0; i < totalContacts; i += BATCH_SIZE) {
      const chunk = selectedContacts.slice(i, i + BATCH_SIZE);
      batches.push(chunk);
      initialStatuses.push({
        id: i / BATCH_SIZE + 1,
        range: `${i + 1} - ${Math.min(i + BATCH_SIZE, totalContacts)}`,
        count: chunk.length,
        status: 'pending'
      });
    }
    setBatchStatuses(initialStatuses);

    // Process Batches
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      // Update Status to Processing
      setBatchStatuses(prev => prev.map((b, idx) => 
        idx === i ? { ...b, status: 'processing' } : b
      ));

      try {
        await deleteBatchMutation.mutateAsync(batch);
        
        // Update Status to Success
        setBatchStatuses(prev => prev.map((b, idx) => 
          idx === i ? { ...b, status: 'success' } : b
        ));
      } catch (error: any) {
        console.error(`Failed to delete batch ${i + 1}`, error);
        
        // Update Status to Failed
        setBatchStatuses(prev => prev.map((b, idx) => 
          idx === i ? { ...b, status: 'failed', error: error.message } : b
        ));
      }
      
      setCompletedCount(prev => prev + 1);
    }

    setIsDeleting(false);
    setSelectedContacts([]);
    queryClient.invalidateQueries({ queryKey: ['/api/zoho/contacts', selectedAccountId] });
    
    // Keep dialog open for a moment to let user see result, or let them close it manually
    toast({ title: "Process Completed", description: "Batch deletion finished." });
  };

  const progressPercentage = batchStatuses.length > 0 
    ? (completedCount / batchStatuses.length) * 100 
    : 0;
  
  return (
    <div className="space-y-8">
      <div className="form-card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-foreground">Contact Manager</h3>
          <div className="flex items-center space-x-4">
            <Label htmlFor="contact-manager-account-select">Account:</Label>
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
            <Button onClick={() => refetch()} disabled={isLoading || isDeleting || !selectedAccountId} variant="outline" size="sm">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-2 hidden sm:block">Refresh</span>
            </Button>
          </div>
        </div>
        
        {isLoading && selectedAccountId ? (
          <div className="text-center py-8"><Loader2 className="w-8 h-8 text-primary mx-auto mb-4 animate-spin" /><p>Loading contacts...</p></div>
        ) : !selectedAccountId ? (
          <p className="text-center text-muted-foreground py-8">Please select a Zoho account.</p>
        ) : contacts.length > 0 ? (
          <>
            <div className="flex justify-end gap-2 mb-4">
              <Button 
                onClick={handleDeleteSelected} 
                variant="destructive" 
                disabled={isDeleting || selectedContacts.length === 0}
              >
                <Trash2 className="w-4 h-4 mr-2" /> 
                Delete Selected ({selectedContacts.length})
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 w-12 text-center">
                      <Checkbox
                        checked={selectedContacts.length === contacts.length && contacts.length > 0}
                        onCheckedChange={(checked: boolean) => handleSelectAll(checked)}
                        disabled={isDeleting}
                      />
                    </th>
                    <th className="text-left p-2">Full Name</th>
                    <th className="text-left p-2">Email</th>
                    <th className="text-left p-2">Contact ID</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact: any) => (
                    <tr key={contact.id} className="border-b">
                      <td className="p-2 text-center">
                        <Checkbox
                          checked={selectedContacts.includes(contact.id)}
                          onCheckedChange={(checked: boolean) => handleSelectContact(contact.id, checked)}
                          disabled={isDeleting}
                        />
                      </td>
                      <td className="p-2">{contact.Full_Name || 'N/A'}</td>
                      <td className="p-2">{contact.Email || 'N/A'}</td>
                      <td className="p-2 font-mono text-xs">{contact.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-8"><ListFilter className="w-12 h-12 text-muted-foreground mx-auto mb-4" /><p>No contacts found.</p></div>
        )}
      </div>

      {/* Batch Progress Modal */}
      <Dialog open={showProgress} onOpenChange={(open) => !isDeleting && setShowProgress(open)}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Bulk Delete Progress</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Total Progress</span>
                <span>{Math.round(progressPercentage)}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>

            <div className="border rounded-md flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-3 text-left font-medium">Batch</th>
                    <th className="p-3 text-left font-medium">Range</th>
                    <th className="p-3 text-center font-medium">Count</th>
                    <th className="p-3 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {batchStatuses.map((batch) => (
                    <tr key={batch.id} className="border-t">
                      <td className="p-3 font-medium">#{batch.id}</td>
                      <td className="p-3 text-muted-foreground">{batch.range}</td>
                      <td className="p-3 text-center">{batch.count}</td>
                      <td className="p-3 text-center">
                        {batch.status === 'pending' && (
                          <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">
                            <Clock className="w-3 h-3 mr-1" /> Pending
                          </Badge>
                        )}
                        {batch.status === 'processing' && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 animate-pulse">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processing
                          </Badge>
                        )}
                        {batch.status === 'success' && (
                          <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
                          </Badge>
                        )}
                        {batch.status === 'failed' && (
                          <div className="flex flex-col items-center">
                            <Badge variant="destructive" className="mb-1">
                              <XCircle className="w-3 h-3 mr-1" /> Failed
                            </Badge>
                            <span className="text-xs text-red-500 max-w-[150px] truncate" title={batch.error}>
                              {batch.error}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="flex justify-end pt-2">
              <Button onClick={() => setShowProgress(false)} disabled={isDeleting}>
                {isDeleting ? 'Processing...' : 'Close'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}