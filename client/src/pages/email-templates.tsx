import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAccounts } from "@/hooks/use-accounts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const modules = [
  "Leads", "Accounts", "Contacts", "Deals", "Tasks", "Events", "Calls",
  "Products", "Price Books", "Quotes", "Sales Orders", "Purchase Orders",
  "Invoices", "Campaigns", "Vendors", "Cases", "Solutions"
];

export default function EmailTemplates() {
  const { data: accounts = [] } = useAccounts();
  const { toast } = useToast();
  
  // --- FILTER CRM ACCOUNTS ---
  const validAccounts = useMemo(() => accounts.filter((acc: any) => acc.supports_crm !== false), [accounts]);

  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedModule, setSelectedModule] = useState<string>("Contacts");
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (validAccounts.length > 0) {
        const isValid = validAccounts.find((a: any) => a.id.toString() === selectedAccountId);
        if (!selectedAccountId || !isValid) {
            setSelectedAccountId(validAccounts[0].id.toString());
        }
    }
  }, [validAccounts, selectedAccountId]);

  const { data: templates = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/zoho/email-templates', selectedAccountId, selectedModule],
    queryFn: async ({ queryKey }) => {
      const [_url, accountId, module] = queryKey;
      const response = await fetch(`/api/zoho/email-templates/${accountId}?module=${module}`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
    enabled: !!selectedAccountId && !!selectedModule,
  });

  const { mutate: fetchTemplateDetails, isPending: isFetchingDetails } = useMutation({
    mutationFn: async (templateId: string) => {
        const response = await apiRequest('GET', `/api/zoho/email-templates/${selectedAccountId}/${templateId}`);
        return response.json();
    },
    onSuccess: (data) => {
        setSelectedTemplate(data);
        setIsModalOpen(true);
    },
    onError: (error) => {
        toast({
            title: "Error fetching template details",
            description: error.message,
            variant: "destructive"
        });
    }
  });

  const handleRowClick = (templateId: string) => {
    fetchTemplateDetails(templateId);
  };

  return (
    <div className="space-y-8">
      <div className="form-card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Email Templates</h3>
          <div className="flex items-center space-x-4">
            <Label>Account:</Label>
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Choose account" /></SelectTrigger>
              <SelectContent>
                {validAccounts.map((account: any) => (
                  <SelectItem key={account.id} value={account.id.toString()}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label>Module:</Label>
            <Select value={selectedModule} onValueChange={setSelectedModule}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Choose module" /></SelectTrigger>
              <SelectContent>
                {modules.map((module) => (
                  <SelectItem key={module} value={module}>
                    {module}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => refetch()} disabled={isLoading || !selectedAccountId} variant="outline" size="sm">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        
        {isLoading ? (
          <div className="text-center py-8"><Loader2 className="w-8 h-8 text-primary mx-auto animate-spin" /><p>Loading templates...</p></div>
        ) : templates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Subject</th>
                  <th className="text-center p-2">Sent</th>
                  <th className="text-center p-2">Delivered</th>
                  <th className="text-center p-2">Opened</th>
                  <th className="text-center p-2">Clicked</th>
                  <th className="text-center p-2">Bounced</th>
                  <th className="text-left p-2">Last Used</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template: any) => (
                  <tr key={template.id} className="border-b hover:bg-muted cursor-pointer" onClick={() => handleRowClick(template.id)}>
                    <td className="p-2 font-medium">{template.name}</td>
                    <td className="p-2">{template.subject}</td>
                    <td className="p-2 text-center">{template.last_version_statistics.sent}</td>
                    <td className="p-2 text-center">{template.last_version_statistics.delivered}</td>
                    <td className="p-2 text-center">{template.last_version_statistics.opened}</td>
                    <td className="p-2 text-center">{template.last_version_statistics.clicked}</td>
                    <td className="p-2 text-center">{template.last_version_statistics.bounced}</td>
                    <td className="p-2">{template.last_usage_time ? new Date(template.last_usage_time).toLocaleString() : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center py-8">No templates found for the selected module.</p>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.name}</DialogTitle>
          </DialogHeader>
          {isFetchingDetails ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold">Subject</h4>
                  <p>{selectedTemplate?.subject}</p>
                </div>
                <div>
                  <h4 className="font-semibold">Content</h4>
                  <div className="border rounded-lg p-4 mt-2">
                    <div dangerouslySetInnerHTML={{ __html: selectedTemplate?.content }} className="prose max-w-none" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}