export async function validateZohoConnection(credentials: {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}) {
  const response = await fetch('/api/accounts/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });
  
  return response.json();
}

export async function getZohoLeads(accountId: number) {
  const response = await fetch(`/api/zoho/leads/${accountId}`);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error);
  }
  return response.json();
}

export async function getZohoUsers(accountId: number) {
  const response = await fetch(`/api/zoho/users/${accountId}`);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error);
  }
  return response.json();
}

export async function getFromAddresses(accountId: number) {
  const response = await fetch(`/api/zoho/from_addresses/${accountId}`);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error);
  }
  return response.json();
}

export async function updateZohoUser(accountId: number, userId: string, firstName: string) {
  const response = await fetch(`/api/zoho/users/${accountId}/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: firstName })
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error);
  }
  
  return response.json();
}

export async function createContactAndSendEmail(accountId: number, data: {
  contactData: any;
  emailData: any;
}) {
  const response = await fetch(`/api/zoho/contact-and-email/${accountId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error);
  }
  
  return response.json();
}

export async function getAccessToken(accountId: string) {
  const response = await fetch(`/api/accounts/${accountId}/token`);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch access token');
  }
  return response.json();
}

export async function getZohoFields(accountId: string, module: string = 'Contacts') {
  const response = await fetch(`/api/zoho/fields/${accountId}?module=${module}`);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch fields');
  }
  return response.json();
}

export async function getWorkflowRules(accountId: string, module?: string) {
  const url = new URL(`/api/zoho/workflow-rules/${accountId}`, window.location.origin);
  if (module) url.searchParams.append('module', module);
  
  const response = await fetch(url.toString());
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch workflow rules');
  }
  return response.json();
}

export async function getWorkflowRuleDetails(accountId: string, ruleId: string) {
  const response = await fetch(`/api/zoho/workflow-rules/${accountId}/${ruleId}`);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch workflow rule details');
  }
  return response.json();
}

export async function getWorkflowUsage(accountId: string, ruleId: string, fromDate: string, toDate: string) {
  const response = await fetch(`/api/zoho/workflow-rules/${accountId}/${ruleId}/usage?executed_from=${fromDate}&executed_till=${toDate}`);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch workflow usage');
  }
  return response.json();
}