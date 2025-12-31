import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAccounts } from "@/hooks/use-accounts";
import { apiRequest } from "@/lib/queryClient";
import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function BiginTest() {
  const { data: accounts = [] } = useAccounts();
  const { toast } = useToast();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [testResult, setTestResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Auto-select first account
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id.toString());
    }
  }, [accounts, selectedAccountId]);

  const handleTestConnection = async () => {
    if (!selectedAccountId) return;
    setIsLoading(true);
    setTestResult(null);

    try {
      const response = await apiRequest('GET', `/api/bigin/users/${selectedAccountId}`);
      const data = await response.json();
      setTestResult({ success: true, data });
      toast({ title: "Success", description: "Connected to Zoho Bigin successfully!" });
    } catch (error: any) {
      setTestResult({ success: false, error: error.message || "Unknown error occurred" });
      toast({ title: "Connection Failed", description: "Could not connect to Bigin. Did you re-authenticate?", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Zoho Bigin Integration Test</h2>
          <p className="text-muted-foreground mt-1">Verify that your Zoho Auth Token has the correct Bigin permissions.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Connection Check</CardTitle>
            <CardDescription>Select an account to test the Bigin API connection.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <Alert className="bg-blue-50 border-blue-200">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-800">Authentication Required</AlertTitle>
                <AlertDescription className="text-blue-700">
                  If this test fails, please go to the <b>Account Manager</b> and click "Connect" again for this account to update permissions.
                </AlertDescription>
              </Alert>

            <div className="space-y-2">
              <label className="text-sm font-medium">Select Account</label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose account" />
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

            <Button 
              className="w-full" 
              onClick={handleTestConnection} 
              disabled={isLoading || !selectedAccountId}
            >
              {isLoading ? "Testing Connection..." : "Test Bigin Connection"}
            </Button>
          </CardContent>
        </Card>

        {testResult && (
          <Card className={testResult.success ? "border-green-200 bg-green-50/30" : "border-red-200 bg-red-50/30"}>
             <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    {testResult.success ? (
                        <>
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                            <span className="text-green-700">Connection Successful</span>
                        </>
                    ) : (
                        <>
                            <AlertCircle className="h-5 w-5 text-red-600" />
                            <span className="text-red-700">Connection Failed</span>
                        </>
                    )}
                </CardTitle>
             </CardHeader>
             <CardContent>
                {testResult.success ? (
                    <div className="space-y-2">
                        <p className="text-sm text-green-800">Successfully fetched Users from Bigin API V2.</p>
                        <div className="bg-white p-3 rounded border text-xs font-mono h-48 overflow-auto">
                            {JSON.stringify(testResult.data, null, 2)}
                        </div>
                    </div>
                ) : (
                     <div className="space-y-2">
                        <p className="text-sm text-red-800">Error Details:</p>
                        <div className="bg-white p-3 rounded border border-red-200 text-xs font-mono text-red-600">
                            {JSON.stringify(testResult.error, null, 2)}
                        </div>
                    </div>
                )}
             </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}