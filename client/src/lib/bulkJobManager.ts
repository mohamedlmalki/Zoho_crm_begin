import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface BulkResult {
  email: string;
  contactStatus: string;
  emailStatus: string;
  response: any;
}

export interface AccountState {
  name?: string;
  bulkFormData: {
    fromEmail: string;
    lastName: string;
    emails: string;
    subject: string;
    content: string;
  };
  delay: number;
  emailsToProcess: string[];
  results: BulkResult[];
  isProcessing: boolean;
  isPaused: boolean;
  currentEmailIndex: number;
  countdown: number;
  showResults: boolean;
  filterStatus: string;
  fromAddresses: any[];
}

class BulkJobManager {
  private static instance: BulkJobManager;
  private accountStates: Record<string, AccountState> = {};
  private subscribers: Array<(states: Record<string, AccountState>) => void> = [];
  private processRefs: Record<string, NodeJS.Timeout | null> = {};

  private constructor() {}

  public static getInstance(): BulkJobManager {
    if (!BulkJobManager.instance) {
      BulkJobManager.instance = new BulkJobManager();
    }
    return BulkJobManager.instance;
  }

  public subscribe(callback: (states: Record<string, AccountState>) => void) {
    this.subscribers.push(callback);
    callback(this.accountStates);
  }

  public unsubscribe(callback: (states: Record<string, AccountState>) => void) {
    this.subscribers = this.subscribers.filter(cb => cb !== callback);
  }

  private notify() {
    this.subscribers.forEach(cb => cb({ ...this.accountStates }));
  }
  
  public getAllStates = () => {
    return this.accountStates;
  }

  public getAccountState(accountId: string): AccountState {
    return this.accountStates[accountId] || this.getInitialState();
  }

  public ensureAccountState(accountId: string) {
    if (!this.accountStates[accountId]) {
      this.accountStates[accountId] = this.getInitialState();
      this.notify();
    }
  }

  public updateAccountState(accountId: string, updater: (state: AccountState) => AccountState) {
    this.accountStates[accountId] = updater(this.getAccountState(accountId));
    this.notify();
  }

  private getInitialState(fromEmail: string = ""): AccountState {
    return {
      bulkFormData: { fromEmail, lastName: "", emails: "", subject: "", content: "" },
      delay: 5,
      emailsToProcess: [],
      results: [],
      isProcessing: false,
      isPaused: false,
      currentEmailIndex: 0,
      countdown: 0,
      showResults: false,
      filterStatus: "all",
      fromAddresses: [],
    };
  }

  public startJob(accountId: string, state: AccountState) {
    const emails = state.bulkFormData.emails.split('\n').map(email => email.trim()).filter(Boolean);
    if (emails.length === 0) {
      toast({ title: "Error", description: "Please enter at least one email.", variant: "destructive" });
      return;
    }
    
    this.updateAccountState(accountId, () => ({
      ...state,
      results: [],
      showResults: true,
      emailsToProcess: emails,
      currentEmailIndex: 0,
      isProcessing: true,
      isPaused: false,
    }));
    this.scheduleNextEmail(accountId);
  }

  public pauseJob(accountId: string) {
    this.updateAccountState(accountId, state => ({ ...state, isPaused: true }));
    if (this.processRefs[accountId]) {
      clearTimeout(this.processRefs[accountId]!);
      this.processRefs[accountId] = null;
    }
  }

  public resumeJob(accountId: string) {
    this.updateAccountState(accountId, state => ({ ...state, isPaused: false }));
    this.scheduleNextEmail(accountId);
  }

  public stopJob(accountId: string) {
      if (this.processRefs[accountId]) {
          clearTimeout(this.processRefs[accountId]!);
          this.processRefs[accountId] = null;
      }
      this.updateAccountState(accountId, state => ({
          ...state,
          isProcessing: false,
          isPaused: false,
      }));
      toast({ title: "Job Ended", description: `Bulk process for account ${accountId} has been stopped.` });
  }

  public clearAllJobs() {
    Object.keys(this.processRefs).forEach(accountId => {
      if (this.processRefs[accountId]) {
        clearTimeout(this.processRefs[accountId]!);
        this.processRefs[accountId] = null;
      }
    });
  }


  private scheduleNextEmail(accountId: string) {
    const state = this.getAccountState(accountId);
    if (!state.isProcessing || state.isPaused) return;

    if (state.currentEmailIndex >= state.emailsToProcess.length) {
      toast({ title: "Bulk Process Complete", description: `Processed all emails for account ${accountId}.` });
      this.updateAccountState(accountId, s => ({ ...s, isProcessing: false }));
      return;
    }
    
    const delay = state.currentEmailIndex === 0 ? 0 : state.delay * 1000;
    
    this.processRefs[accountId] = setTimeout(() => {
      this.processEmail(accountId);
    }, delay);
  }

  private async processEmail(accountId: string) {
    let state = this.getAccountState(accountId);
    const email = state.emailsToProcess[state.currentEmailIndex];
    const fromAddress = state.fromAddresses.find(addr => addr.email === state.bulkFormData.fromEmail);

    if (!fromAddress) {
        toast({ title: "Error", description: `From address for account ${accountId} became unavailable. Ending job.`, variant: "destructive" });
        this.stopJob(accountId);
        return;
    }

    try {
        const contactData = { data: [{ Last_Name: state.bulkFormData.lastName, Email: email }] };
        const emailData = { data: [{ from: { user_name: fromAddress.user_name, email: fromAddress.email }, to: [{ user_name: state.bulkFormData.lastName, email }], subject: state.bulkFormData.subject, content: state.bulkFormData.content, mail_format: "html" }] };
        const result = await apiRequest('POST', `/api/zoho/contact-and-email/${accountId}`, { contactData, emailData }).then(res => res.json());
        
        this.updateAccountState(accountId, s => ({ 
            ...s, 
            results: [...s.results, { email, contactStatus: 'Success', emailStatus: 'Success', response: result }],
            currentEmailIndex: s.currentEmailIndex + 1
        }));
    } catch (error) {
        this.updateAccountState(accountId, s => ({ 
            ...s, 
            results: [...s.results, { email, contactStatus: 'Failed', emailStatus: 'Failed', response: { error: (error as Error).message } }],
            currentEmailIndex: s.currentEmailIndex + 1
        }));
    } finally {
        this.scheduleNextEmail(accountId);
    }
  }
}

export default BulkJobManager.getInstance();