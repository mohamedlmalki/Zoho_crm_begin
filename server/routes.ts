import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import axios from "axios";
import { log } from "./vite";
import jobManager from "./jobManager";
import { randomUUID } from "crypto";

const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com';
const accessTokenCache: Record<string, { token: string; expires_at: number }> = {};
const tokenRefreshLocks: Record<string, Promise<string>> = {};

// Helper function to generate a simple HTML page for the OAuth callback
const generateCallbackHTML = (title: string, content: string) => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      body { font-family: 'Inter', sans-serif; }
      .copy-btn:active { transform: scale(0.95); }
    </style>
  </head>
  <body class="bg-gray-100 flex items-center justify-center min-h-screen">
    <div class="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
      ${content}
    </div>
  </body>
  </html>
`;

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

async function fetchAllContacts(accessToken: string) {
    // Use a Map to automatically handle duplicates by ID
    const contactsMap = new Map();
    let page = 1;
    let moreRecords = true;

    while (moreRecords) {
        try {
            const response = await axios.get('https://www.zohoapis.com/crm/v2/Contacts', {
                params: { page: page, per_page: 200 },
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
            });

            if (response.data && response.data.data) {
                // Add each contact to the Map using ID as the key
                response.data.data.forEach((contact: any) => {
                    contactsMap.set(contact.id, contact);
                });
            }
            
            moreRecords = (response.data.info && response.data.info.more_records) || false;
            page++;
        } catch (error) {
            console.error("Error fetching page " + page, error);
            moreRecords = false; // Stop on error
        }
    }
    
    // Convert Map values back to an array
    return Array.from(contactsMap.values());
}

async function fetchAllContactStats(accessToken: string, allContacts: any[]) {
    const statsPromises = allContacts.map(async (contact) => {
        try {
            const statsResponse = await axios.get(`https://www.zohoapis.com/crm/v2/Contacts/${contact.id}/Emails`, {
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
            });
            return {
                contact_id: contact.id,
                Full_Name: contact.Full_Name,
                Email: contact.Email,
                Owner: contact.Owner, // <--- ADD THIS LINE
                emails: statsResponse.data.email_related_list || []
            };
        } catch (error) {
            return {
                contact_id: contact.id,
                Full_Name: contact.Full_Name,
                Email: contact.Email,
                Owner: contact.Owner, // <--- ADD THIS LINE HERE TOO
                emails: []
            };
        }
    });
    return Promise.all(statsPromises);
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // --- New OAuth Token Generation Routes ---

  app.get('/api/zoho/generate-auth-url', (req, res) => {
    const { client_id, client_secret } = req.query;

    if (!client_id || !client_secret) {
      return res.status(400).send('Client ID and Client Secret are required.');
    }

    const state = Buffer.from(JSON.stringify({ clientId: client_id, clientSecret: client_secret })).toString('base64');
    
    const redirectUri = `${req.protocol}://${req.get('host')}/api/zoho/oauth-callback`;
    
    // Scopes needed for the app
    const ZOHO_SCOPE = 'ZohoCRM.modules.ALL,ZohoCRM.send_mail.all.CREATE,ZohoCRM.settings.emails.READ,ZohoCRM.modules.emails.READ,ZohoCRM.users.ALL,ZohoCRM.templates.email.READ,ZohoCRM.settings.fields.READ,ZohoCRM.settings.automation_actions.ALL,ZohoCRM.settings.workflow_rules.ALL';

    const authUrl = new URL(`${ZOHO_ACCOUNTS_URL}/oauth/v2/auth`);
    authUrl.searchParams.append('scope', ZOHO_SCOPE);
    authUrl.searchParams.append('client_id', client_id as string);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('state', state);

    res.redirect(authUrl.toString());
  });

  app.get('/api/zoho/oauth-callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
      const errorHtml = generateCallbackHTML(
        'Error',
        `<h1 class="text-2xl font-bold text-red-600 mb-4">Authorization Failed</h1><p class="text-gray-700">Zoho returned an error: ${error}</p>`
      );
      return res.status(400).send(errorHtml);
    }

    if (!code || !state) {
      const errorHtml = generateCallbackHTML(
        'Error',
        `<h1 class="text-2xl font-bold text-red-600 mb-4">Invalid Request</h1><p class="text-gray-700">Missing authorization code or state from Zoho.</p>`
      );
      return res.status(400).send(errorHtml);
    }

    try {
      const decodedState = JSON.parse(Buffer.from(state as string, 'base64').toString('utf-8'));
      const { clientId, clientSecret } = decodedState;
      const redirectUri = `${req.protocol}://${req.get('host')}/api/zoho/oauth-callback`;

      const response = await axios.post(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, null, {
        params: {
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        },
      });

      const refreshToken = response.data.refresh_token;
      
      const successHtml = generateCallbackHTML(
        'Token Generated',
        `
        <h1 class="text-2xl font-bold text-green-600 mb-4">Refresh Token Generated!</h1>
        <p class="text-gray-600 mb-4">Copy the token below and paste it into the 'Refresh Token' field in the application.</p>
        <div class="bg-gray-100 p-4 rounded-md border border-gray-300 break-all text-left mb-4">
          <code id="refreshToken">${refreshToken}</code>
        </div>
        <button id="copyBtn" class="copy-btn bg-blue-500 text-white px-6 py-2 rounded-md hover:bg-blue-600 transition-colors">Copy Token</button>
        <p id="copyMsg" class="text-green-500 mt-2 h-4"></p>
        <script>
          document.getElementById('copyBtn').addEventListener('click', () => {
            const token = document.getElementById('refreshToken').innerText;
            const textArea = document.createElement('textarea');
            textArea.value = token;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            const msg = document.getElementById('copyMsg');
            msg.innerText = 'Copied to clipboard!';
            setTimeout(() => { msg.innerText = ''; }, 2000);
          });
        </script>
        `
      );
      res.send(successHtml);
    } catch (err: any) {
      log(`OAuth callback error: ${err.message}`, 'auth-error');
      const errorHtml = generateCallbackHTML(
        'Error',
        `<h1 class="text-2xl font-bold text-red-600 mb-4">Failed to Get Token</h1><p class="text-gray-700">${err.response?.data?.error || err.message}</p>`
      );
      res.status(500).send(errorHtml);
    }
  });

  // --- Metadata Endpoint (Using V8) ---
  app.get('/api/zoho/fields/:accountId', async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const { module } = req.query; 

      const account = await storage.getAccount(accountId);
      if (!account) return res.status(404).json({ error: 'Account not found.' });

      const accessToken = await getAccessToken(account);
      
      const response = await axios.get('https://www.zohoapis.com/crm/v8/settings/fields', {
        params: { module: module || 'Contacts' },
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
      });

      res.json(response.data);
    } catch (error: any) {
      log(`Failed to fetch fields for account ${req.params.accountId}: ${error.message}`, 'api-error');
      res.status(500).json({ 
        error: 'Failed to fetch fields', 
        details: error.response ? error.response.data : error.message 
      });
    }
  });

  // --- Job Management Endpoints ---
  app.post('/api/jobs/start/:accountId', (req, res) => {
    const { accountId } = req.params;
    const { emails, delay, ...formData } = req.body;
    jobManager.startJob(accountId, emails, delay, formData);
    res.status(202).json({ message: 'Job started' });
  });

  app.post('/api/jobs/stop/:accountId', (req, res) => {
    const { accountId } = req.params;
    jobManager.stopJob(accountId);
    res.status(200).json({ message: 'Job stopped' });
  });
  
  app.post('/api/jobs/pause/:accountId', (req, res) => {
    const { accountId } = req.params;
    jobManager.pauseJob(accountId);
    res.status(200).json({ message: 'Job paused' });
  });

  app.post('/api/jobs/resume/:accountId', (req, res) => {
    const { accountId } = req.params;
    jobManager.resumeJob(accountId);
    res.status(200).json({ message: 'Job resumed' });
  });

  app.get('/api/jobs/status', (req, res) => {
    res.json(jobManager.getStatus());
  });

  // --- Account Management ---
  app.get('/api/accounts', async (req, res) => {
    const accounts = await storage.getAllAccounts();
    res.json(accounts);
  });
  
  app.get('/api/accounts/:id/token', async (req, res) => {
    try {
      const accountId = parseInt(req.params.id);
      const account = await storage.getAccount(accountId);
      
      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      const accessToken = await getAccessToken(account);
      res.json({ access_token: accessToken });
    } catch (error: any) {
      log(`Failed to get access token for account ${req.params.id}: ${error.message}`, 'auth-error');
      res.status(500).json({ error: 'Failed to retrieve access token', details: error.message });
    }
  });

  app.post('/api/accounts', async (req, res) => {
    const newAccount = req.body;
    const account = await storage.createAccount(newAccount);
    res.status(201).json(account);
  });
  
  app.put('/api/accounts/:id', async (req, res) => {
    try {
      const accountId = parseInt(req.params.id);
      const updatedData = req.body;
      const account = await storage.updateAccount(accountId, updatedData);
      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update account' });
    }
  });

  app.delete('/api/accounts/:id', async (req, res) => {
    try {
      const accountId = parseInt(req.params.id);
      const deleted = await storage.deleteAccount(accountId);
      if (!deleted) {
        return res.status(404).json({ error: 'Account not found' });
      }
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete account' });
    }
  });
  
  app.post('/api/accounts/validate', async (req, res) => {
    const { client_id, client_secret, refresh_token } = req.body;
    if (!client_id || !client_secret || !refresh_token) {
      return res.status(400).json({ error: 'All credentials are required.' });
    }

    try {
      await getAccessToken({ client_id, client_secret, refresh_token, id: `validation-${randomUUID()}` });
      return res.json({ connected: true });
    } catch (error: any) {
      return res.status(200).json({ connected: false, error: error.message });
    }
  });
  
  // --- Zoho API Endpoints ---
  app.post('/api/zoho/contact-and-email/:accountId', async (req, res) => {
    const accountId = parseInt(req.params.accountId);
    let contactResult: any = { success: false, data: null };
    let emailResult: any = { success: false, data: null };

    try {
      const { contactData, emailData } = req.body;
      const account = await storage.getAccount(accountId);
      if (!account) throw new Error('Account not found');
      
      const accessToken = await getAccessToken(account);

      try {
        const contactResponse = await axios.post('https://www.zohoapis.com/crm/v2/Contacts', contactData, {
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
        });
        contactResult = { success: true, data: contactResponse.data };
        
        const newContactId = contactResponse.data.data[0].details.id;
        
        try {
            const emailResponse = await axios.post(`https://www.zohoapis.com/crm/v2/Contacts/${newContactId}/actions/send_mail`, emailData, {
              headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' }
            });
            emailResult = { success: true, data: emailResponse.data };
        } catch (emailError: any) {
            emailResult = { success: false, data: emailError.response?.data || { message: emailError.message } };
        }
      } catch (contactError: any) {
        contactResult = { success: false, data: contactError.response?.data || { message: contactError.message } };
      }
      res.status(200).json({ contact: contactResult, email: emailResult });
    } catch (error: any) {
      res.status(500).json({ 
          contact: { success: false, data: { message: error.message } },
          email: { success: false, data: { message: "Not attempted due to critical error." } }
      });
    }
  });

  app.get('/api/zoho/users/:accountId', async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const account = await storage.getAccount(accountId);
      if (!account) return res.status(404).json({ error: 'Account not found.' });
      
      const accessToken = await getAccessToken(account);
      const response = await axios.get('https://www.zohoapis.com/crm/v2/users?type=AllUsers', {
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
      });
      res.json(response.data.users);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch users', details: error.message });
    }
  });

  app.put('/api/zoho/users/:accountId/:userId', async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const userId = req.params.userId;
      const { first_name } = req.body;

      const account = await storage.getAccount(accountId);
      if (!account) return res.status(404).json({ error: 'Account not found.' });
      if (!first_name) return res.status(400).json({ error: 'First name is a required field.' });
      
      const accessToken = await getAccessToken(account);

      const updateData = {
        users: [{ id: userId, first_name: first_name }]
      };

      const response = await axios.put(`https://www.zohoapis.com/crm/v2/users/${userId}`, updateData, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      res.json(response.data);
    } catch (error: any) {
      log(`Failed to update user ${req.params.userId} for account ${req.params.accountId}`, 'api-error');
      res.status(500).json({ 
        error: 'Failed to update user in Zoho CRM',
        details: error.response ? error.response.data : error.message 
      });
    }
  });

  app.get('/api/zoho/from_addresses/:accountId', async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const account = await storage.getAccount(accountId);
      if (!account) return res.status(404).json({ error: 'Account not found.' });

      const accessToken = await getAccessToken(account);
      const response = await axios.get('https://www.zohoapis.com/crm/v2/settings/emails/actions/from_addresses', {
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
      });
      res.json(response.data.from_addresses);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch from addresses', details: error.message });
    }
  });

  app.get('/api/zoho/all-contact-stats/:accountId', async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const account = await storage.getAccount(accountId);
      if (!account) return res.status(404).json({ error: 'Account not found.' });
      
      const accessToken = await getAccessToken(account);
      const allContacts = await fetchAllContacts(accessToken);
      const allStats = await fetchAllContactStats(accessToken, allContacts);
      res.json(allStats);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch contact stats', details: error.message });
    }
  });

  app.get('/api/zoho/contacts/:accountId', async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const account = await storage.getAccount(accountId);
      if (!account) return res.status(404).json({ error: 'Account not found.' });
      
      const accessToken = await getAccessToken(account);
      const allContacts = await fetchAllContacts(accessToken);
      res.json(allContacts);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch contacts', details: error.message });
    }
  });
  
  app.get('/api/zoho/email-templates/:accountId', async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const { module } = req.query;

      const account = await storage.getAccount(accountId);
      if (!account) return res.status(404).json({ error: 'Account not found.' });

      const accessToken = await getAccessToken(account);
      const response = await axios.get('https://www.zohoapis.com/crm/v8/settings/email_templates', {
        params: { module },
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
      });
      res.json(response.data.email_templates);
    } catch (error: any) {
      log(`Failed to fetch email templates for account ${req.params.accountId}: ${error.response?.data?.message || error.message}`, 'api-error');
      res.status(500).json({ 
        error: 'Failed to fetch email templates from Zoho', 
        details: error.response ? error.response.data : error.message 
      });
    }
  });
  
  app.get('/api/zoho/email-templates/:accountId/:templateId', async (req, res) => {
    try {
      const { accountId, templateId } = req.params;

      const account = await storage.getAccount(parseInt(accountId));
      if (!account) return res.status(404).json({ error: 'Account not found.' });

      const accessToken = await getAccessToken(account);
      const response = await axios.get(`https://www.zohoapis.com/crm/v8/settings/email_templates/${templateId}`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
      });
      res.json(response.data.email_templates[0]);
    } catch (error: any) {
      log(`Failed to fetch email template for account ${req.params.accountId}: ${error.response?.data?.message || error.message}`, 'api-error');
      res.status(500).json({ 
        error: 'Failed to fetch email template from Zoho', 
        details: error.response ? error.response.data : error.message 
      });
    }
  });
  
  app.get('/api/zoho/leads/:accountId', async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const account = await storage.getAccount(accountId);
      if (!account) return res.status(404).json({ error: 'Account not found.' });

      const accessToken = await getAccessToken(account);
      const response = await axios.get('https://www.zohoapis.com/crm/v2/Leads', {
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch leads', details: error.message });
    }
  });


  app.delete('/api/zoho/contacts/:accountId', async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const contactIds: string[] = req.body.ids;
      if (!contactIds || contactIds.length === 0) {
        return res.status(400).json({ error: 'No contact IDs provided for deletion.' });
      }

      const account = await storage.getAccount(accountId);
      if (!account) return res.status(404).json({ error: 'Account not found.' });
      
      const accessToken = await getAccessToken(account);
      const contactIdsString = contactIds.join(',');

      const response = await axios.delete('https://www.zohoapis.com/crm/v2/Contacts', {
        params: { ids: contactIdsString },
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete contacts', details: error.message });
    }
  });

 // 1. Get All Workflow Rules
  app.get('/api/zoho/workflow-rules/:accountId', async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const { module } = req.query;

      const account = await storage.getAccount(accountId);
      if (!account) return res.status(404).json({ error: 'Account not found.' });

      const accessToken = await getAccessToken(account);
      
      const response = await axios.get('https://www.zohoapis.com/crm/v8/settings/automation/workflow_rules', {
        params: { module },
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
      });

      res.json(response.data);
    } catch (error: any) {
      log(`Failed to fetch workflow rules for account ${req.params.accountId}: ${error.message}`, 'api-error');
      res.status(500).json({ 
        error: 'Failed to fetch workflow rules', 
        details: error.response ? error.response.data : error.message 
      });
    }
  });

  // 2. Get Specific Workflow Rule
  app.get('/api/zoho/workflow-rules/:accountId/:ruleId', async (req, res) => {
    try {
      const { accountId, ruleId } = req.params;

      const account = await storage.getAccount(parseInt(accountId));
      if (!account) return res.status(404).json({ error: 'Account not found.' });

      const accessToken = await getAccessToken(account);
      
      const response = await axios.get(`https://www.zohoapis.com/crm/v8/settings/automation/workflow_rules/${ruleId}`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
      });

      res.json(response.data);
    } catch (error: any) {
      log(`Failed to fetch workflow rule details for account ${req.params.accountId}: ${error.message}`, 'api-error');
      res.status(500).json({ 
        error: 'Failed to fetch workflow rule details', 
        details: error.response ? error.response.data : error.message 
      });
    }
  });

  // 3. Get Workflow Rule Usage Report
  app.get('/api/zoho/workflow-rules/:accountId/:ruleId/usage', async (req, res) => {
    try {
      const { accountId, ruleId } = req.params;
      const { executed_from, executed_till } = req.query;

      if (!executed_from || !executed_till) {
        return res.status(400).json({ error: 'executed_from and executed_till are required parameters.' });
      }

      const account = await storage.getAccount(parseInt(accountId));
      if (!account) return res.status(404).json({ error: 'Account not found.' });

      const accessToken = await getAccessToken(account);
      
      const response = await axios.get(`https://www.zohoapis.com/crm/v8/settings/automation/workflow_rules/${ruleId}/actions/usage`, {
        params: { executed_from, executed_till },
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
      });

      res.json(response.data);
    } catch (error: any) {
      log(`Failed to fetch workflow usage for account ${req.params.accountId}: ${error.message}`, 'api-error');
      res.status(500).json({ 
        error: 'Failed to fetch workflow usage', 
        details: error.response ? error.response.data : error.message 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}