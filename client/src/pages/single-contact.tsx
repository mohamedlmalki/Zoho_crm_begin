import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { RefreshCw, Send, Trash2, Eye, X, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getZohoFields } from "@/lib/api";

const initialResultState = { status: null, data: "" };

export default function SingleContact() {
  const { data: accounts = [] } = useAccounts();
  const { toast } = useToast();
  
  // --- FILTER CRM ACCOUNTS ---
  const validAccounts = useMemo(() => accounts.filter((acc: any) => acc.supports_crm !== false), [accounts]);

  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userFirstName, setUserFirstName] = useState<string>("");

  const [contactResult, setContactResult] = useState(initialResultState);
  const [emailResult, setEmailResult] = useState(initialResultState);

  // Form State
  const [formData, setFormData] = useState({
    fromEmail: "",
    lastName: "",
    email: "",
    subject: "",
    content: "",
    customFields: {} as Record<string, any>
  });

  // Custom Fields State
  const [availableFields, setAvailableFields] = useState<any[]>([]);
  const [selectedFieldToAdd, setSelectedFieldToAdd] = useState<string>("");
  const [visibleCustomFields, setVisibleCustomFields] = useState<string[]>([]);
  const [showCustomOnly, setShowCustomOnly] = useState(true);

  const { data: users = [], refetch: refetchUsers, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['/api/zoho/users', selectedAccountId],
    enabled: !!selectedAccountId,
  });

  const { data: fromAddresses = [], isLoading: isLoadingFromAddresses } = useQuery({
    queryKey: ['/api/zoho/from_addresses', selectedAccountId],
    enabled: !!selectedAccountId,
  });

  // Fetch Fields for Single Page
  const { data: zohoFieldsData, isLoading: isLoadingFields } = useQuery({
    queryKey: ['/api/zoho/fields', selectedAccountId],
    queryFn: () => getZohoFields(selectedAccountId),
    enabled: !!selectedAccountId,
  });

  useEffect(() => {
    if (zohoFieldsData && zohoFieldsData.fields) {
      const ignoredFields = ['Last_Name', 'Email', 'id', 'Created_Time', 'Modified_Time'];
      
      const filtered = zohoFieldsData.fields.filter((f: any) => {
        if (ignoredFields.includes(f.api_name)) return false;
        if (!f.view_type?.create) return false;
        if (showCustomOnly && !f.custom_field) return false;
        return true;
      });
      
      setAvailableFields(filtered);
    }
  }, [zohoFieldsData, showCustomOnly]);

  // --- UPDATED SELECTION LOGIC ---
  useEffect(() => {
    if (validAccounts.length > 0) {
        const isValid = validAccounts.find((a: any) => a.id.toString() === selectedAccountId);
        if (!selectedAccountId || !isValid) {
            setSelectedAccountId(validAccounts[0].id.toString());
        }
    }
  }, [validAccounts, selectedAccountId]);
  
  useEffect(() => {
    if (fromAddresses.length > 0) {
      const currentEmailIsValid = fromAddresses.some((addr: any) => addr.email === formData.fromEmail);
      if (!currentEmailIsValid) {
        setFormData(prev => ({ ...prev, fromEmail: fromAddresses[0].email }));
      }
    }
  }, [fromAddresses, formData.fromEmail]);

  useEffect(() => {
    if (Array.isArray(users) && users.length > 0 && !selectedUserId) {
      const firstUser = users[0];
      setSelectedUserId(firstUser.id);
      setUserFirstName(firstUser.first_name || "");
    }
  }, [users, selectedUserId]);

  const handleClearForm = () => {
    setFormData({ fromEmail: fromAddresses[0]?.email || "", lastName: "", email: "", subject: "", content: "", customFields: {} });
    setVisibleCustomFields([]);
    setContactResult(initialResultState);
    setEmailResult(initialResultState);
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

  const createContactAndEmailMutation = useMutation({
    mutationFn: async (data: typeof formData & { accountId: string, fromUserName: string }) => {
      const contactData = { 
        data: [{ 
          Last_Name: data.lastName, 
          Email: data.email,
          ...data.customFields 
        }] 
      };
      
      const emailData = { 
        data: [{ 
          from: { user_name: data.fromUserName, email: data.fromEmail }, 
          to: [{ user_name: data.lastName, email: data.email }], 
          subject: data.subject, 
          content: data.content, 
          mail_format: "html" 
        }] 
      };
      
      const response = await apiRequest('POST', `/api/zoho/contact-and-email/${data.accountId}`, { contactData, emailData });
      return response.json();
    },
    onSuccess: (result) => {
      const contactResData = result.contact.data;
      const isContactSuccess = result.contact.success && contactResData?.data?.[0]?.status === 'success';
      setContactResult({
        status: isContactSuccess ? 'Success' : 'Fail',
        data: JSON.stringify(contactResData, null, 2),
      });

      const emailResData = result.email.data;
      const isEmailSuccess = result.email.success && emailResData?.data?.[0]?.status === 'success';
      setEmailResult({
        status: isEmailSuccess ? 'Success' : 'Fail',
        data: JSON.stringify(emailResData, null, 2),
      });

      if (isContactSuccess && isEmailSuccess) {
        toast({ title: "Success", description: "Contact created and email sent!" });
      } else {
        toast({ title: "Action Required", description: "One or more steps failed. Please check responses.", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Network Error", description: error.message, variant: "destructive" });
      setContactResult({ status: 'Fail', data: error.message });
      setEmailResult({ status: 'Fail', data: "Request failed to send." });
    },
  });

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    setSelectedUserId("");
    setUserFirstName("");
    setFormData(prev => ({ ...prev, fromEmail: "" }));
    setContactResult(initialResultState);
    setEmailResult(initialResultState);
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

  const handleCreateContactAndEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const fromAddress = fromAddresses.find((addr: any) => addr.email === formData.fromEmail);
    if (!fromAddress) {
      toast({ title: "Error", description: "Please select a valid from address", variant: "destructive" });
      return;
    }
    createContactAndEmailMutation.mutate({ ...formData, accountId: selectedAccountId, fromUserName: fromAddress.user_name });
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
    const newCustomFields = { ...formData.customFields };
    delete newCustomFields[apiName];
    setFormData({ ...formData, customFields: newCustomFields });
  };

  const handleCustomFieldChange = (apiName: string, value: any) => {
    setFormData({
      ...formData,
      customFields: {
        ...formData.customFields,
        [apiName]: value
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="form-card">
          <h3 className="text-lg font-semibold text-foreground mb-6">User Manager</h3>
          <form onSubmit={handleUpdateUser} className="space-y-4">
            <div>
              <Label htmlFor="single-account-select">Select Account</Label>
              <Select value={selectedAccountId} onValueChange={handleAccountChange}>
                <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>
                  {validAccounts.map((account: any) => (<SelectItem key={account.id} value={account.id.toString()}>{account.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex space-x-2">
              <div className="flex-1">
                <Label htmlFor="single-user-select">Select User</Label>
                <Select value={selectedUserId} onValueChange={handleUserChange} disabled={!selectedAccountId || isLoadingUsers}>
                  <SelectTrigger><SelectValue placeholder={isLoadingUsers ? "Loading..." : "Choose user"} /></SelectTrigger>
                  <SelectContent>
                    {(users as any[]).map((user: any) => (<SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" size="icon" onClick={() => refetchUsers()} disabled={!selectedAccountId}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="single-first-name">First Name</Label>
              <Input id="single-first-name" value={userFirstName} onChange={(e) => setUserFirstName(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={updateUserMutation.isPending}>
              {updateUserMutation.isPending ? "Updating..." : "Update User"}
            </Button>
          </form>
        </div>
        <div className="form-card">
          <h3 className="text-lg font-semibold text-foreground mb-6">Create Contact and Send Email</h3>
          
          {/* Dynamic Field Selector */}
          <div className="mb-6 p-4 border rounded-lg bg-muted/20">
            <h4 className="text-sm font-medium mb-3">Add Custom Fields</h4>
            <div className="flex items-center space-x-2 mb-3">
              <Checkbox id="show-custom-only" checked={showCustomOnly} onCheckedChange={(checked) => setShowCustomOnly(checked === true)} />
              <Label htmlFor="show-custom-only" className="text-xs text-muted-foreground">Show only custom fields</Label>
            </div>
            <div className="flex gap-2">
                <Select value={selectedFieldToAdd} onValueChange={setSelectedFieldToAdd} disabled={isLoadingFields}>
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
                <Button onClick={handleAddCustomField} disabled={!selectedFieldToAdd} type="button" variant="secondary">
                    <Plus className="w-4 h-4 mr-2" /> Add
                </Button>
            </div>
          </div>

          <form onSubmit={handleCreateContactAndEmail} className="space-y-4">
            <div>
              <Label>From Address</Label>
              <Select value={formData.fromEmail} onValueChange={(value) => setFormData({ ...formData, fromEmail: value })} required disabled={isLoadingFromAddresses}>
                <SelectTrigger><SelectValue placeholder={isLoadingFromAddresses ? "Loading..." : "Choose from address"} /></SelectTrigger>
                <SelectContent>
                  {(fromAddresses as any[]).map((address: any) => (<SelectItem key={address.email} value={address.email}>{address.email}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Recipient Last Name</Label>
              <Input value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} required />
            </div>
            <div>
              <Label>Recipient Email</Label>
              <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
            </div>

            {visibleCustomFields.map(apiName => {
                const fieldDef = zohoFieldsData?.fields?.find((f: any) => f.api_name === apiName);
                if (!fieldDef) return null;
                const currentValue = formData.customFields[apiName] || "";

                return (
                    <div key={apiName} className="relative p-3 border rounded-md bg-background">
                        <div className="flex justify-between items-center mb-1.5">
                            <Label>{fieldDef.display_label}</Label>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleRemoveCustomField(apiName)} type="button">
                                <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                            </Button>
                        </div>
                        {fieldDef.data_type === 'picklist' ? (
                            <Select value={currentValue} onValueChange={(val) => handleCustomFieldChange(apiName, val)}>
                                <SelectTrigger><SelectValue placeholder={`Select ${fieldDef.display_label}`} /></SelectTrigger>
                                <SelectContent>{fieldDef.pick_list_values?.map((opt: any) => (<SelectItem key={opt.display_value} value={opt.actual_value}>{opt.display_value}</SelectItem>))}</SelectContent>
                            </Select>
                        ) : fieldDef.data_type === 'boolean' ? (
                            <div className="flex items-center space-x-2">
                                <Checkbox checked={currentValue} onCheckedChange={(val) => handleCustomFieldChange(apiName, val)} />
                                <span className="text-sm text-muted-foreground">Yes</span>
                            </div>
                        ) : (
                            <Input type={fieldDef.data_type === 'integer' || fieldDef.data_type === 'double' ? "number" : "text"} value={currentValue} onChange={(e) => handleCustomFieldChange(apiName, e.target.value)} />
                        )}
                    </div>
                );
            })}

            <div>
              <Label>Subject</Label>
              <Input value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} required />
            </div>
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
              <Textarea rows={4} value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} required />
            </div>
            <div className="flex space-x-2">
              <Button type="submit" className="flex-1" disabled={createContactAndEmailMutation.isPending}>
                <Send className="w-4 h-4 mr-2" />
                {createContactAndEmailMutation.isPending ? "Processing..." : "Create & Send"}
              </Button>
              <Button type="button" variant="outline" onClick={handleClearForm}>
                <Trash2 className="w-4 h-4 mr-2" /> Clear
              </Button>
            </div>
          </form>
        </div>
      </div>

      <hr />

      <h2 className="text-xl font-bold">Responses</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="form-card">
          <div className="flex items-center gap-4 mb-4">
            <h3 className="text-lg font-semibold">Contact Creation Response</h3>
            {contactResult.status && <Badge className={cn(contactResult.status === 'Success' ? 'bg-green-500' : 'bg-red-500')}>{contactResult.status}</Badge>}
          </div>
          <Textarea value={contactResult.data} readOnly rows={8} className="font-mono text-sm bg-muted" placeholder="Contact creation response will appear here..." />
        </div>
        <div className="form-card">
          <div className="flex items-center gap-4 mb-4">
            <h3 className="text-lg font-semibold">Email Send Response</h3>
            {emailResult.status && <Badge className={cn(emailResult.status === 'Success' ? 'bg-green-500' : 'bg-red-500')}>{emailResult.status}</Badge>}
          </div>
          <Textarea value={emailResult.data} readOnly rows={8} className="font-mono text-sm bg-muted" placeholder="Email send response will appear here..." />
        </div>
      </div>
    </div>
  );
}