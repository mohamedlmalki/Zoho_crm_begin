import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAccounts } from "@/hooks/use-accounts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAccessToken } from "@/lib/api";
import { Edit, Trash2, Wifi, Download, Plus, KeyRound, Eye, Copy } from "lucide-react";

interface Account {
  id: number;
  name: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

export default function Accounts() {
  const { data: accounts = [], isLoading } = useAccounts();
  const { toast } = useToast();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Auto-select first account when accounts load
  React.useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id.toString());
    }
  }, [accounts, selectedAccountId]);

  // Reset access token when account changes
  React.useEffect(() => {
    setAccessToken(null);
  }, [selectedAccountId]);

  const [formData, setFormData] = useState({
    name: "",
    client_id: "",
    client_secret: "",
    refresh_token: ""
  });

  // Get leads query
  const { data: leadsData, refetch: refetchLeads, isLoading: isLoadingLeads } = useQuery({
    queryKey: ['/api/zoho/leads', selectedAccountId],
    enabled: false,
  });

  // Create/Update account mutation
  const saveAccountMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: number }) => {
      // Validate connection first
      const validationResponse = await apiRequest('POST', '/api/accounts/validate', {
        client_id: data.client_id,
        client_secret: data.client_secret,
        refresh_token: data.refresh_token
      });

      const validationResult = await validationResponse.json();
      if (!validationResult.connected) {
        throw new Error(validationResult.error);
      }

      if (data.id) {
        return apiRequest('PUT', `/api/accounts/${data.id}`, data);
      } else {
        return apiRequest('POST', '/api/accounts', data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
      resetForm();
      toast({ title: "Success", description: "Account saved successfully!" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: `Failed to save account: ${error.message}`,
        variant: "destructive" 
      });
    },
  });

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounts'] });
      setSelectedAccountId("");
      toast({ title: "Success", description: "Account deleted successfully!" });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to delete account",
        variant: "destructive" 
      });
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const account = accounts.find(acc => acc.id.toString() === accountId);
      if (!account) throw new Error('Account not found');
      
      const response = await apiRequest('POST', '/api/accounts/validate', {
        client_id: account.client_id,
        client_secret: account.client_secret,
        refresh_token: account.refresh_token
      });
      
      return response.json();
    },
    onSuccess: (result) => {
      if (result.connected) {
        toast({ title: "Success", description: "Connection to Zoho CRM is successful!" });
      } else {
        toast({ 
          title: "Connection Failed", 
          description: result.error,
          variant: "destructive" 
        });
      }
    },
  });

  // Fetch Access Token Mutation
  const fetchAccessTokenMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const data = await getAccessToken(accountId);
      return data.access_token;
    },
    onSuccess: (token) => {
      setAccessToken(token);
      toast({ title: "Success", description: "Access token retrieved successfully." });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to fetch access token: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setFormData({ name: "", client_id: "", client_secret: "", refresh_token: "" });
    setEditingAccount(null);
  };

  const handleEdit = () => {
    const account = accounts.find(acc => acc.id.toString() === selectedAccountId);
    if (account) {
      setEditingAccount(account);
      setFormData({
        name: account.name,
        client_id: account.client_id,
        client_secret: account.client_secret,
        refresh_token: account.refresh_token
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveAccountMutation.mutate(editingAccount ? { ...formData, id: editingAccount.id } : formData);
  };

  const handleDelete = () => {
    const account = accounts.find(acc => acc.id.toString() === selectedAccountId);
    if (account && confirm(`Are you sure you want to delete account: ${account.name}?`)) {
      deleteAccountMutation.mutate(account.id);
    }
  };

  const handleGenerateToken = () => {
    if (!formData.client_id || !formData.client_secret) {
      toast({
        title: "Missing Credentials",
        description: "Please enter a Client ID and Client Secret before generating a token.",
        variant: "destructive",
      });
      return;
    }
    const url = `/api/zoho/generate-auth-url?client_id=${encodeURIComponent(formData.client_id)}&client_secret=${encodeURIComponent(formData.client_secret)}`;
    window.open(url, '_blank');
  };

  const handleCopyAccessToken = () => {
    if (accessToken) {
      navigator.clipboard.writeText(accessToken);
      toast({ title: "Copied", description: "Access token copied to clipboard." });
    }
  };


  if (isLoading) {
    return <div className="loading-spinner">Loading accounts...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Account List */}
        <div className="form-card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground">Zoho Accounts</h3>
            <Button onClick={resetForm} data-testid="button-new-account">
              <Plus className="w-4 h-4 mr-2" />
              New Account
            </Button>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <Label htmlFor="account-select" className="text-sm font-medium text-foreground">
                Select Account:
              </Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="flex-1" data-testid="select-account">
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex space-x-3 flex-wrap gap-y-2">
              <Button 
                variant="outline" 
                onClick={handleEdit}
                disabled={!selectedAccountId}
                data-testid="button-edit-account"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button 
                variant="outline"
                onClick={handleDelete}
                disabled={!selectedAccountId}
                data-testid="button-delete-account"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
              <Button 
                variant="outline"
                onClick={() => testConnectionMutation.mutate(selectedAccountId)}
                disabled={!selectedAccountId || testConnectionMutation.isPending}
                data-testid="button-test-connection"
              >
                <Wifi className="w-4 h-4 mr-2" />
                Test Connection
              </Button>
            </div>

            {selectedAccountId && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Current Access Token</Label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => fetchAccessTokenMutation.mutate(selectedAccountId)}
                    disabled={fetchAccessTokenMutation.isPending}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    {fetchAccessTokenMutation.isPending ? "Fetching..." : "View Token"}
                  </Button>
                </div>
                {accessToken && (
                  <div className="relative group">
                    <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto whitespace-pre-wrap break-all border border-border">
                      {accessToken}
                    </pre>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={handleCopyAccessToken}
                      title="Copy Token"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Add/Edit Account Form */}
        <div className="form-card">
          <h3 className="text-lg font-semibold text-foreground mb-6">Account Details</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="account-name">Account Name</Label>
              <Input 
                id="account-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                data-testid="input-account-name"
              />
            </div>
            <div>
              <Label htmlFor="client-id">Client ID</Label>
              <Input 
                id="client-id"
                value={formData.client_id}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                required
                data-testid="input-client-id"
              />
            </div>
            <div>
              <Label htmlFor="client-secret">Client Secret</Label>
              <Input 
                id="client-secret"
                value={formData.client_secret}
                onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                required
                data-testid="input-client-secret"
              />
            </div>
            <div>
              <Label htmlFor="refresh-token">Refresh Token</Label>
              <div className="flex items-center space-x-2">
                <Input 
                  id="refresh-token"
                  value={formData.refresh_token}
                  onChange={(e) => setFormData({ ...formData, refresh_token: e.target.value })}
                  required
                  data-testid="input-refresh-token"
                />
                <Button type="button" variant="outline" onClick={handleGenerateToken}>
                  <KeyRound className="w-4 h-4 mr-2" />
                  Generate
                </Button>
              </div>
            </div>
            <div className="flex space-x-3 pt-4">
              <Button 
                type="submit" 
                disabled={saveAccountMutation.isPending}
                data-testid="button-submit-account"
              >
                {editingAccount ? "Save Changes" : "Add Account"}
              </Button>
              {editingAccount && (
                <Button type="button" variant="outline" onClick={resetForm} data-testid="button-cancel-edit">
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* CRM Data Section */}
      <div className="form-card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-foreground">Zoho CRM Data</h3>
          <Button 
            onClick={() => refetchLeads()}
            disabled={!selectedAccountId || isLoadingLeads}
            data-testid="button-get-leads"
          >
            <Download className="w-4 h-4 mr-2" />
            Get Leads
          </Button>
        </div>
        <pre 
          className="bg-muted border border-border rounded-lg p-4 text-sm overflow-auto max-h-80"
          data-testid="leads-output"
        >
          {isLoadingLeads ? 'Fetching leads...' : (leadsData ? JSON.stringify(leadsData, null, 2) : 'No data')}
        </pre>
      </div>
    </div>
  );
}