import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import Dashboard from "@/pages/dashboard";
import Accounts from "@/pages/accounts";
import EmailStats from "@/pages/email-stats";
import ContactManager from "@/pages/contact-manager";
import SingleContact from "@/pages/single-contact";
import BulkContacts from "@/pages/bulk-contacts";
import EmailTemplates from "@/pages/email-templates";
import WorkflowReport from "@/pages/workflow-report";
import NotFound from "@/pages/not-found";
// Import Bigin Pages
import BiginTest from "@/pages/bigin-test";
import BulkContactsBigin from "@/pages/bulk-contacts-bigin";

function Router() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header />
        <main className="p-8">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/accounts" component={Accounts} />
            <Route path="/email-stats" component={EmailStats} />
            <Route path="/contact-manager" component={ContactManager} />
            <Route path="/single-contact" component={SingleContact} />
            <Route path="/bulk-contacts" component={BulkContacts} />
            <Route path="/email-templates" component={EmailTemplates} />
            <Route path="/workflow-report" component={WorkflowReport} />
            
            {/* Bigin Routes */}
            <Route path="/bigin-test" component={BiginTest} />
            <Route path="/bulk-contacts-bigin" component={BulkContactsBigin} />
            
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;