import { storage } from "./storage";
import axios from "axios";
import { log } from "./vite";

const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com';
const accessTokenCache: Record<string, { token: string; expires_at: number }> = {};
const tokenRefreshLocks: Record<string, Promise<string>> = {};

declare global {
  var jobStorage: Map<string, any>;
}

if (!global.jobStorage) {
  global.jobStorage = new Map();
}

async function getAccessToken(account: any): Promise<string> {
  const { refresh_token, client_id, client_secret, id } = account;
  const cachedToken = accessTokenCache[id];
  if (cachedToken && cachedToken.expires_at > Date.now()) return cachedToken.token;
  if (tokenRefreshLocks[id]) return await tokenRefreshLocks[id];

  const refreshPromise = (async () => {
    try {
      const response = await axios.post(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, null, {
        params: { refresh_token, client_id, client_secret, grant_type: 'refresh_token' }
      });
      accessTokenCache[id] = {
        token: response.data.access_token,
        expires_at: Date.now() + (response.data.expires_in * 1000) - 60000
      };
      return response.data.access_token;
    } catch (error: any) {
      throw new Error('Invalid refresh token or other Zoho API error.');
    } finally {
      delete tokenRefreshLocks[id];
    }
  })();

  tokenRefreshLocks[id] = refreshPromise;
  return await refreshPromise;
}

interface Job {
  accountId: string;
  emails: string[];
  results: any[];
  status: 'processing' | 'paused' | 'stopped' | 'completed' | 'failed';
  currentIndex: number;
  totalEmails: number;
  delay: number;
  formData: any;
  error?: string;
  countdown: number;
  platform: 'crm' | 'bigin'; 
}

class JobManager {
  private static instance: JobManager;
  private get jobs() { return global.jobStorage; }
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private countdownIntervals: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {}

  public static getInstance(): JobManager {
    if (!JobManager.instance) JobManager.instance = new JobManager();
    return JobManager.instance;
  }

  private getJobKey(accountId: string, platform: 'crm' | 'bigin'): string {
      return `${platform}-${accountId}`;
  }

  public startJob(accountId: string, emails: string[], delay: number, formData: any, platform: 'crm' | 'bigin' = 'crm') {
    const jobKey = this.getJobKey(String(accountId), platform);

    if (this.jobs.has(jobKey) && this.jobs.get(jobKey)?.status === 'processing') return;

    const newJob: Job = {
      accountId: String(accountId),
      emails,
      results: [],
      status: 'processing',
      currentIndex: 0,
      totalEmails: emails.length,
      delay,
      formData,
      countdown: 0,
      platform 
    };
    this.jobs.set(jobKey, newJob);
    this.processEmail(jobKey);
  }

  public stopJob(accountId: string, platform: 'crm' | 'bigin' = 'crm') {
    const jobKey = this.getJobKey(String(accountId), platform);
    this.clearTimers(jobKey);
    if (this.jobs.has(jobKey)) {
      const job = this.jobs.get(jobKey)!;
      job.status = 'stopped';
      this.jobs.set(jobKey, job);
    }
  }

  public pauseJob(accountId: string, platform: 'crm' | 'bigin' = 'crm') {
    const jobKey = this.getJobKey(String(accountId), platform);
    this.clearTimers(jobKey);
    if (this.jobs.has(jobKey)) {
      const job = this.jobs.get(jobKey)!;
      if (job.status === 'processing') {
        job.status = 'paused';
        this.jobs.set(jobKey, job);
      }
    }
  }

  public resumeJob(accountId: string, platform: 'crm' | 'bigin' = 'crm') {
    const jobKey = this.getJobKey(String(accountId), platform);
    if (this.jobs.has(jobKey)) {
      const job = this.jobs.get(jobKey)!;
      if (job.status === 'paused') {
        job.status = 'processing';
        this.jobs.set(jobKey, job);
        this.scheduleNext(jobKey);
      }
    }
  }

  public getStatus() {
    const statusReport: any = {};
    this.jobs.forEach((job, key) => {
      statusReport[key] = {
        status: job.status,
        processed: job.currentIndex,
        total: job.totalEmails,
        results: job.results,
        error: job.error,
        countdown: job.countdown,
        platform: job.platform
      };
    });
    return statusReport;
  }
  
  private clearTimers(jobKey: string) {
    if (this.timers.has(jobKey)) {
      clearTimeout(this.timers.get(jobKey)!);
      this.timers.delete(jobKey);
    }
    if (this.countdownIntervals.has(jobKey)) {
      clearInterval(this.countdownIntervals.get(jobKey)!);
      this.countdownIntervals.delete(jobKey);
    }
  }

  private scheduleNext(jobKey: string) {
    const job = this.jobs.get(jobKey);
    if (!job || job.status !== 'processing') return;

    if (job.currentIndex >= job.totalEmails) {
      job.status = 'completed';
      this.jobs.set(jobKey, job);
      this.clearTimers(jobKey);
      return;
    }

    job.countdown = job.delay;
    this.countdownIntervals.set(jobKey, setInterval(() => {
        const currentJob = this.jobs.get(jobKey);
        if (currentJob && currentJob.countdown > 0) {
            currentJob.countdown--;
            this.jobs.set(jobKey, currentJob);
        }
    }, 1000));

    const timer = setTimeout(() => {
        this.clearTimers(jobKey);
        this.processEmail(jobKey);
    }, job.delay * 1000);
    this.timers.set(jobKey, timer);
  }

  private async processEmail(jobKey: string) {
    const job = this.jobs.get(jobKey);
    if (!job || job.status !== 'processing') return;

    const email = job.emails[job.currentIndex];
    const { formData, accountId } = job;
    
    // --- SMART URL SELECTION ---
    const apiBase = job.platform === 'bigin' 
        ? 'https://www.zohoapis.com/bigin/v2' 
        : 'https://www.zohoapis.com/crm/v2';

    let contactStatus: 'Success' | 'Failed' = 'Failed';
    let emailStatus: 'Success' | 'Failed' | 'Skipped' = 'Skipped';
    let contactResponsePayload: any = {};
    let emailResponsePayload: any = {};
    let contactId: string | null = null;

    try {
      const account = await storage.getAccount(parseInt(accountId));
      if (!account) throw new Error(`Account ${accountId} not found.`);
      
      const accessToken = await getAccessToken(account);
      const fromAddress = formData.fromAddresses?.find((addr:any) => addr.email === formData.fromEmail);
      if (formData.sendEmail && !fromAddress) throw new Error("From address not found");

      // 1. Create Contact
      try {
        const contactData = { data: [{ Last_Name: formData.lastName, Email: email, ...formData.customFields }] };
        const contactResponse = await axios.post(`${apiBase}/Contacts`, contactData, {
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
        });
        contactResponsePayload = contactResponse.data;

        if (contactResponse.data.data[0].status === 'success' || contactResponse.data.data[0].code === 'DUPLICATE_DATA') {
            contactStatus = 'Success';
            contactId = contactResponse.data.data[0].details.id;
        }
      } catch(contactError: any) {
         contactResponsePayload = contactError.response ? contactError.response.data : { message: contactError.message };
      }

      // 2. Send Email
      if (contactId && formData.sendEmail) {
        try {
            const emailData = { data: [{ from: { user_name: fromAddress.user_name, email: fromAddress.email }, to: [{ user_name: formData.lastName, email }], subject: formData.subject, content: formData.content, mail_format: "html" }] };
            const emailResponse = await axios.post(`${apiBase}/Contacts/${contactId}/actions/send_mail`, emailData, {
              headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' }
            });
            emailResponsePayload = emailResponse.data;
            emailStatus = (emailResponse.data.data[0].status === 'success') ? 'Success' : 'Failed';
        } catch(emailError: any) {
            emailStatus = 'Failed';
            emailResponsePayload = emailError.response ? emailError.response.data : { message: emailError.message };
        }
      } else if (!formData.sendEmail) {
        emailStatus = 'Skipped';
        emailResponsePayload = { message: "Skipped by user." };
      }

    } catch (criticalError: any) {
      log(`Error in job ${jobKey}: ${criticalError.message}`, 'job-manager-error');
      job.status = 'failed';
      job.error = criticalError.message;
    } finally {
      const initialLiveStatus = formData.checkStatus ? 'Pending' : 'Skipped';
      const resultItem: any = { 
          email, contactStatus, emailStatus, liveStatus: initialLiveStatus,
          response: { contact: contactResponsePayload, email: emailResponsePayload, live: null } 
      };
      
      job.results.push(resultItem);
      
      // --- LIVE CHECK ---
      if (formData.checkStatus && contactId) {
          const checkApiBase = apiBase; 
          (async (idToMonitor, itemToUpdate) => {
            try {
              await new Promise(resolve => setTimeout(resolve, (formData.checkDelay || 10) * 1000));
              const account = await storage.getAccount(parseInt(accountId));
              if (!account) return;
              const token = await getAccessToken(account);

              const response = await axios.get(`${checkApiBase}/Contacts/${idToMonitor}/Emails`, {
                headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
              });
              
              itemToUpdate.response.live = response.data;
              
              // --- BIGIN FIX: Look for 'Emails', 'email_related_list', or 'data' ---
              const emails = response.data.Emails || response.data.email_related_list || response.data.data;
              
              if (emails && emails.length > 0) {
                const latest = emails[0];
                let type = 'Unknown';
                // Check if status is array (Bigin) or string
                if (Array.isArray(latest.status) && latest.status.length > 0) type = latest.status[0].type;
                else if (typeof latest.status === 'string') type = latest.status;

                if (type.toLowerCase() === 'sent') itemToUpdate.liveStatus = "Sent";
                else if (type.toLowerCase() === 'bounced') itemToUpdate.liveStatus = "Bounced";
                else itemToUpdate.liveStatus = type;
              } else {
                 itemToUpdate.liveStatus = "Not Found";
              }
            } catch (err: any) {
              itemToUpdate.liveStatus = "Failed Check";
              itemToUpdate.response.live = { error: err.message };
            }
          })(contactId, resultItem);
      }

      job.currentIndex++;
      this.jobs.set(jobKey, job);
      this.scheduleNext(jobKey);
    }
  }
}

export default JobManager.getInstance();