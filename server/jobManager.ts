import { storage } from "./storage";
import axios from "axios";
import { log } from "./vite";

const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com';
const accessTokenCache: Record<string, { token: string; expires_at: number }> = {};
const tokenRefreshLocks: Record<string, Promise<string>> = {};

async function getAccessToken(account: any): Promise<string> {
  const { refresh_token, client_id, client_secret, id } = account;
  
  const cachedToken = accessTokenCache[id];
  if (cachedToken && cachedToken.expires_at > Date.now()) {
    return cachedToken.token;
  }

  if (tokenRefreshLocks[id]) {
    return await tokenRefreshLocks[id];
  }

  const refreshPromise = (async () => {
    try {
      const response = await axios.post(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, null, {
        params: { refresh_token, client_id, client_secret, grant_type: 'refresh_token' }
      });
      const newAccessToken = response.data.access_token;
      const expiresInMs = response.data.expires_in * 1000;
      accessTokenCache[id] = {
        token: newAccessToken,
        expires_at: Date.now() + expiresInMs - 60000
      };
      return newAccessToken;
    } catch (error: any) {
      log(`Failed to get access token for account ${id}: ${error.message}`, 'auth-error');
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
  platform: 'crm' | 'bigin'; // <--- NEW FIELD
  error?: string;
  countdown: number;
}

class JobManager {
  private static instance: JobManager;
  private jobs: Map<string, Job> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private countdownIntervals: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {}

  public static getInstance(): JobManager {
    if (!JobManager.instance) {
      JobManager.instance = new JobManager();
    }
    return JobManager.instance;
  }

  // Updated to accept platform
  public startJob(accountId: string, emails: string[], delay: number, formData: any, platform: 'crm' | 'bigin' = 'crm') {
    if (this.jobs.has(accountId) && this.jobs.get(accountId)?.status === 'processing') {
      return;
    }

    const newJob: Job = {
      accountId,
      emails,
      results: [],
      status: 'processing',
      currentIndex: 0,
      totalEmails: emails.length,
      delay,
      formData,
      platform, // <--- Store it
      countdown: 0,
    };
    this.jobs.set(accountId, newJob);
    this.processEmail(accountId);
  }

  public stopJob(accountId: string) {
    this.clearTimers(accountId);
    if (this.jobs.has(accountId)) {
      const job = this.jobs.get(accountId)!;
      job.status = 'stopped';
      this.jobs.set(accountId, job);
    }
  }

  public pauseJob(accountId: string) {
    this.clearTimers(accountId);
    if (this.jobs.has(accountId)) {
      const job = this.jobs.get(accountId)!;
      if (job.status === 'processing') {
        job.status = 'paused';
        this.jobs.set(accountId, job);
      }
    }
  }

  public resumeJob(accountId: string) {
    if (this.jobs.has(accountId)) {
      const job = this.jobs.get(accountId)!;
      if (job.status === 'paused') {
        job.status = 'processing';
        this.jobs.set(accountId, job);
        this.scheduleNext(accountId);
      }
    }
  }

  public getStatus() {
    const statusReport: any = {};
    this.jobs.forEach((job, accountId) => {
      statusReport[accountId] = {
        status: job.status,
        processed: job.currentIndex,
        total: job.totalEmails,
        results: job.results,
        error: job.error,
        countdown: job.countdown,
        platform: job.platform // <--- Useful for UI to know
      };
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
      log(`Job for account ${accountId} completed.`, 'job-manager');
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
    
    // --- 1. DETERMINE BASE URL ---
    const baseUrl = platform === 'bigin' 
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
      const fromAddress = formData.fromAddresses.find((addr:any) => addr.email === formData.fromEmail);
      if (formData.sendEmail && !fromAddress) throw new Error("From address not found");

      // --- Step 1: Create or Find Contact ---
      try {
        const contactPayload = {
          Last_Name: formData.lastName,
          Email: email,
          ...formData.customFields 
        };

        const contactData = { data: [contactPayload] };
        
        // Use dynamic URL
        const contactResponse = await axios.post(`${baseUrl}/Contacts`, contactData, {
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
        });
        contactResponsePayload = contactResponse.data;

        if (contactResponse.data.data[0].status === 'success') {
            contactStatus = 'Success';
            contactId = contactResponse.data.data[0].details.id;
        } else if (contactResponse.data.data[0].code === 'DUPLICATE_DATA') {
            contactStatus = 'Success';
            contactId = contactResponse.data.data[0].details.id;
        }

      } catch(contactError: any) {
         contactResponsePayload = contactError.response ? contactError.response.data : { message: contactError.message };
      }

      // --- Step 2: Send Email if Contact Exists and sendEmail is true ---
      if (contactId && formData.sendEmail) {
        try {
            const emailData = { data: [{ from: { user_name: fromAddress.user_name, email: fromAddress.email }, to: [{ user_name: formData.lastName, email }], subject: formData.subject, content: formData.content, mail_format: "html" }] };
            
            // Use dynamic URL
            const emailResponse = await axios.post(`${baseUrl}/Contacts/${contactId}/actions/send_mail`, emailData, {
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
                'Content-Type': 'application/json'
              }
            });
            emailResponsePayload = emailResponse.data;
            if (emailResponse.data.data[0].status === 'success') {
                emailStatus = 'Success';
            } else {
                emailStatus = 'Failed';
            }
        } catch(emailError: any) {
            emailStatus = 'Failed';
            emailResponsePayload = emailError.response ? emailError.response.data : { message: emailError.message };
        }
      } else if (!formData.sendEmail) {
        emailStatus = 'Skipped';
        emailResponsePayload = { message: "Email sending was skipped by user." };
      } else {
        emailStatus = 'Failed';
        emailResponsePayload = { message: "Email not sent because contact creation failed." };
      }

    } catch (criticalError: any) {
      log(`Critical error in job for account ${accountId}: ${criticalError.message}`, 'job-manager-error');
      job.status = 'failed';
      job.error = criticalError.message;
      contactResponsePayload = { message: criticalError.message };
      emailResponsePayload = { message: criticalError.message };
    } finally {
      const initialLiveStatus = formData.checkStatus ? 'Pending' : 'Skipped';
      
      const resultItem: any = { 
          email, 
          contactStatus, 
          emailStatus, 
          liveStatus: initialLiveStatus,
          response: { contact: contactResponsePayload, email: emailResponsePayload, live: null } 
      };
      job.results.push(resultItem);
      
      // --- BACKGROUND STATUS CHECK ---
      if (formData.checkStatus && contactId) {
          (async (idToMonitor, itemToUpdate) => {
            try {
              // Wait 3 seconds
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              const account = await storage.getAccount(parseInt(accountId));
              if (!account) return;
              const token = await getAccessToken(account);

              // Use dynamic URL
              const response = await axios.get(`${baseUrl}/Contacts/${idToMonitor}/Emails`, {
                headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
              });
              
              itemToUpdate.response.live = response.data;

              const emails = response.data.email_related_list;
              if (emails && emails.length > 0) {
                const latestEmail = emails[0];
                if (latestEmail.status && latestEmail.status.length > 0) {
                    const statusType = latestEmail.status[0].type;
                    if (statusType === 'sent') {
                        itemToUpdate.liveStatus = "Sent";
                    } else if (statusType === 'bounced') {
                         itemToUpdate.liveStatus = "Bounced";
                    } else {
                        itemToUpdate.liveStatus = statusType;
                    }
                } else {
                    itemToUpdate.liveStatus = "No Status";
                }
              } else {
                 itemToUpdate.liveStatus = "Not Found";
              }
            } catch (err: any) {
              console.log(`Background check failed for ${idToMonitor}`, err);
              itemToUpdate.liveStatus = "Failed Check";
              itemToUpdate.response.live = { error: err.message };
            }
          })(contactId, resultItem);
      }

      job.currentIndex++;
      this.jobs.set(accountId, job);
      this.scheduleNext(accountId);
    }
  }
}

export default JobManager.getInstance();