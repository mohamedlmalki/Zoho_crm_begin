const initialFormData = {
  fromEmail: "",
  lastName: "",
  emails: "",
  subject: "",
  content: "",
  delay: 5,
  sendEmail: true,
  checkStatus: false, // New option for Live Status Check
  customFields: {} as Record<string, any>,
};

type FormData = typeof initialFormData;

class BulkContactsState {
  private static instance: BulkContactsState;
  private subscribers: Array<(state: Record<string, FormData>) => void> = [];
  private state: Record<string, FormData> = {};

  private constructor() {}

  public static getInstance(): BulkContactsState {
    if (!BulkContactsState.instance) {
      BulkContactsState.instance = new BulkContactsState();
    }
    return BulkContactsState.instance;
  }

  public subscribe(callback: (state: Record<string, FormData>) => void) {
    this.subscribers.push(callback);
    callback(this.state);
  }

  public unsubscribe(callback: (state: Record<string, FormData>) => void) {
    this.subscribers = this.subscribers.filter(cb => cb !== callback);
  }

  private notify() {
    this.subscribers.forEach(cb => cb({ ...this.state }));
  }

  public getState() {
    return this.state;
  }
  
  public updateFormData(accountId: string, field: keyof FormData, value: any) {
    if (!this.state[accountId]) {
      this.state[accountId] = { ...initialFormData };
    }
    this.state[accountId] = {
      ...this.state[accountId],
      [field]: value
    };
    this.notify();
  }

  public updateCustomField(accountId: string, fieldName: string, value: any) {
    if (!this.state[accountId]) {
      this.state[accountId] = { ...initialFormData };
    }
    
    const currentCustomFields = this.state[accountId].customFields || {};
    
    this.state[accountId] = {
      ...this.state[accountId],
      customFields: {
        ...currentCustomFields,
        [fieldName]: value
      }
    };
    this.notify();
  }
  
  public setFromEmail(accountId: string, email: string) {
      if (!this.state[accountId]) {
        this.state[accountId] = { ...initialFormData };
      }
      if (!this.state[accountId].fromEmail) {
        this.state[accountId].fromEmail = email;
        this.notify();
      }
  }
}

export { initialFormData };
export default BulkContactsState.getInstance();