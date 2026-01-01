import { create } from 'zustand';

export const initialFormData = {
  fromEmail: "",
  lastName: "",
  emails: "",
  subject: "",
  content: "",
  delay: 1,
  sendEmail: true,
  checkStatus: false,
  checkDelay: 10,
  customFields: {} as Record<string, any>,
};

// Advanced Timer Structure
interface TimerData {
  startTime: number | null;
  endTime: number | null;
  totalPausedTime: number;
  lastPauseTime: number | null; // If set, it means currently paused
}

interface BulkContactsState {
  forms: Record<string, typeof initialFormData>;
  timers: Record<string, TimerData>; // Store advanced timer data per job key
  
  updateFormData: (accountId: string, field: keyof typeof initialFormData, value: any) => void;
  setFromEmail: (accountId: string, email: string) => void;
  updateCustomField: (accountId: string, fieldName: string, value: any) => void;
  
  // Timer Actions
  startTimer: (key: string) => void;
  pauseTimer: (key: string) => void;
  resumeTimer: (key: string) => void;
  stopTimer: (key: string) => void;
  resetTimer: (key: string) => void;
}

const useBulkContactsStore = create<BulkContactsState>((set) => ({
  forms: {},
  timers: {},

  updateFormData: (accountId, field, value) =>
    set((state) => ({
      forms: {
        ...state.forms,
        [accountId]: {
          ...(state.forms[accountId] || initialFormData),
          [field]: value,
        },
      },
    })),

  setFromEmail: (accountId, email) =>
    set((state) => ({
      forms: {
        ...state.forms,
        [accountId]: {
          ...(state.forms[accountId] || initialFormData),
          fromEmail: email,
        },
      },
    })),

  updateCustomField: (accountId, fieldName, value) =>
    set((state) => {
      const currentForm = state.forms[accountId] || initialFormData;
      const currentCustomFields = currentForm.customFields || {};
      const newCustomFields = { ...currentCustomFields };
      if (value === undefined) delete newCustomFields[fieldName];
      else newCustomFields[fieldName] = value;

      return {
        forms: { ...state.forms, [accountId]: { ...currentForm, customFields: newCustomFields } }
      };
    }),

  // --- SMART TIMER LOGIC ---

  startTimer: (key) =>
    set((state) => ({
      timers: {
        ...state.timers,
        [key]: { startTime: Date.now(), endTime: null, totalPausedTime: 0, lastPauseTime: null }
      }
    })),

  pauseTimer: (key) =>
    set((state) => {
      const timer = state.timers[key];
      if (!timer || timer.lastPauseTime) return state; // Already paused or not started
      return {
        timers: {
          ...state.timers,
          [key]: { ...timer, lastPauseTime: Date.now() } // Mark when we paused
        }
      };
    }),

  resumeTimer: (key) =>
    set((state) => {
      const timer = state.timers[key];
      if (!timer || !timer.lastPauseTime) return state; // Not paused
      const pauseDuration = Date.now() - timer.lastPauseTime;
      return {
        timers: {
          ...state.timers,
          [key]: { 
            ...timer, 
            lastPauseTime: null, 
            totalPausedTime: timer.totalPausedTime + pauseDuration // Add to total skipped time
          }
        }
      };
    }),

  stopTimer: (key) =>
    set((state) => {
      const timer = state.timers[key];
      if (!timer) return state;
      
      // If stopped while paused, calculate that final segment
      let extraPaused = 0;
      if (timer.lastPauseTime) {
          extraPaused = Date.now() - timer.lastPauseTime;
      }

      return {
        timers: {
          ...state.timers,
          [key]: { 
            ...timer, 
            endTime: Date.now(), 
            lastPauseTime: null, // Clear pause status
            totalPausedTime: timer.totalPausedTime + extraPaused 
          }
        }
      };
    }),

  resetTimer: (key) =>
    set((state) => {
      const newTimers = { ...state.timers };
      delete newTimers[key];
      return { timers: newTimers };
    }),
}));

export default useBulkContactsStore;