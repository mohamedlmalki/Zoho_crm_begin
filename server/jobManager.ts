import { storage } from "./storage";
import axios from "axios";
import { log } from "./vite";

const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com';

// --- GLOBAL STORAGE (Prevents data loss on reload) ---
declare global {
  var jobStorage: Map<string, any>;
}

if (!global.jobStorage) {
  global.jobStorage = new Map();
}

async function getAccessToken(account: any): Promise<string> {
  // (Simplified for brevity, standard token fetch logic)
  const { refresh_token, client_id, client_secret, id } = account;
  try {
    const response = await axios.post(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, null, {
      params: { refresh_token, client_id, client_secret, grant_type: 'refresh_token' }
    });
    return response.data.access_token;
  } catch (error: any) {
    log(`Auth Error ${id}: ${error.message}`, 'auth-error');
    throw new Error('Auth Failed');
  }
}

class JobManager {
  private static instance: JobManager;
  // Use the global storage instead of a private property
  private get jobs() { return global.jobStorage; }
  
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private countdownIntervals: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {}

  public static getInstance(): JobManager {
    if (!JobManager.instance) {
      JobManager.instance = new JobManager();
    }
    return JobManager.instance;
  }

  public startJob(accountId: string | number, emails: string[], delay: number, formData: any, platform: 'crm' | 'bigin' = 'crm') {
    const id = String(accountId);
    
    // Reset if exists
    this.clearTimers(id);

    const newJob = {
      accountId: id,
      emails,
      results: [],
      status: 'processing',
      currentIndex: 0,
      totalEmails: emails.length,
      delay,
      formData,
      platform,
      countdown: 0,
    };
    
    this.jobs.set(id, newJob);
    log(`Job STARTED for ${id} (${emails.length} emails)`, 'job-manager');
    this.processEmail(id);
  }

  public stopJob(accountId: string | number) {
    const id = String(accountId);
    this.clearTimers(id);
    if (this.jobs.has(id)) {
      const job = this.jobs.get(id);
      job.status = 'stopped';
      this.jobs.set(id, job);
    }
  }

  public pauseJob(accountId: string | number) {
    const id = String(accountId);
    this.clearTimers(id);
    if (this.jobs.has(id)) {
      const job = this.jobs.get(id);
      if (job.status === 'processing') {
        job.status = 'paused';
        this.jobs.set(id, job);
      }
    }
  }

  public resumeJob(accountId: string | number) {
    const id = String(accountId);
    if (this.jobs.has(id)) {
      const job = this.jobs.get(id);
      if (job.status === 'paused') {
        job.status = 'processing';
        this.jobs.set(id, job);
        this.scheduleNext(id);
      }
    }
  }

  public getStatus() {
    const statusReport: any = {};
    this.jobs.forEach((job, id) => {
      statusReport[id] = job;
    });
    return statusReport;
  }
  
  private clearTimers(accountId: string) {
    if (this.timers.has(accountId)) {
      clearTimeout(this.timers.get(accountId)!);
      this.timers.delete(accountId);
    }
    if (this.countdownIntervals.has(accountId)) {
      clearInterval(this.countdownIntervals.get(accountId)!);
      this.countdownIntervals.delete(accountId);
    }
  }

  private scheduleNext(accountId: string) {
    const job = this.jobs.get(accountId);
    if (!job || job.status !== 'processing') return;

    if (job.currentIndex >= job.totalEmails) {
      job.status = 'completed';
      this.jobs.set(accountId, job);
      this.clearTimers(accountId);
      log(`Job COMPLETED for ${accountId}`, 'job-manager');
      return;
    }

    job.countdown = job.delay;
    this.countdownIntervals.set(accountId, setInterval(() => {
        const currentJob = this.jobs.get(accountId);
        if (currentJob && currentJob.countdown > 0) {
            currentJob.countdown--;
            this.jobs.set(accountId, currentJob);
        }
    }, 1000));

    const timer = setTimeout(() => {
        this.clearTimers(accountId);
        this.processEmail(accountId);
    }, job.delay * 1000);
    this.timers.set(accountId, timer);
  }

  private async processEmail(accountId: string) {
    const job = this.jobs.get(accountId);
    if (!job || job.status !== 'processing') return;

    const email = job.emails[job.currentIndex];
    const { formData, platform } = job;
    
    // Correct API Selection
    const baseUrl = platform === 'bigin' 
      ? 'https://www.zohoapis.com/bigin/v2' 
      : 'https://www.zohoapis.com/crm/v2';

    let contactStatus = 'Failed';
    let emailStatus = 'Skipped';
    let contactResponse: any = {};
    let emailResponse: any = {};
    let contactId: string | null = null;

    try {
      const account = await storage.getAccount(parseInt(accountId));
      if (!account) throw new Error("Account DB Record Not Found");
      
      const accessToken = await getAccessToken(account);
      const fromAddress = formData.fromAddresses.find((addr:any) => addr.email === formData.fromEmail);

      // 1. Create Contact
      try {
        const contactPayload = { Last_Name: formData.lastName, Email: email, ...formData.customFields };
        const res = await axios.post(`${baseUrl}/Contacts`, { data: [contactPayload] }, {
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
        });
        contactResponse = res.data;
        const details = res.data.data?.[0];
        if (details?.status === 'success' || details?.code === 'DUPLICATE_DATA') {
            contactStatus = 'Success';
            contactId = details.details.id;
        }
      } catch(e: any) {
         contactResponse = e.response?.data || { error: e.message };
      }

      // 2. Send Email
      if (contactId && formData.sendEmail && fromAddress) {
        try {
            const emailData = { 
                data: [{ 
                    from: { user_name: fromAddress.user_name, email: fromAddress.email }, 
                    to: [{ user_name: formData.lastName, email }], 
                    subject: formData.subject, 
                    content: formData.content 
                }] 
            };
            const res = await axios.post(`${baseUrl}/Contacts/${contactId}/actions/send_mail`, emailData, {
              headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
            });
            emailResponse = res.data;
            if (res.data.data?.[0]?.status === 'success') emailStatus = 'Success';
            else emailStatus = 'Failed';
        } catch(e: any) {
            emailStatus = 'Failed';
            emailResponse = e.response?.data || { error: e.message };
        }
      }

    } catch (criticalError: any) {
      log(`Critical Error ${accountId}: ${criticalError.message}`, 'job-error');
      contactResponse = { fatal_error: criticalError.message };
    } finally {
      const resultItem = { 
          email, contactStatus, emailStatus, 
          liveStatus: formData.checkStatus ? 'Pending' : 'Skipped',
          response: { contact: contactResponse, email: emailResponse },
          isDuplicate: contactResponse?.data?.[0]?.code === 'DUPLICATE_DATA'
      };
      
      job.results.push(resultItem);
      
      // Background Check
      if (formData.checkStatus && contactId) {
          this.runBackgroundCheck(accountId, contactId, resultItem, baseUrl);
      }

      job.currentIndex++;
      this.jobs.set(accountId, job);
      this.scheduleNext(accountId);
    }
  }

  private async runBackgroundCheck(accountId: string, contactId: string, item: any, baseUrl: string) {
      setTimeout(async () => {
        try {
            const account = await storage.getAccount(parseInt(accountId));
            const token = await getAccessToken(account);
            const res = await axios.get(`${baseUrl}/Contacts/${contactId}/Emails`, {
                headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
            });
            item.response.live = res.data;
            const status = res.data.email_related_list?.[0]?.status?.[0]?.type;
            item.liveStatus = status === 'sent' ? 'Sent' : status === 'bounced' ? 'Bounced' : (status || 'No Status');
        } catch (e) {
            item.liveStatus = 'Check Failed';
        }
      }, 4000);
  }
}

export default JobManager.getInstance();