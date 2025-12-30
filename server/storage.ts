import { type User, type InsertUser, type Account, type InsertAccount } from "@shared/schema";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getAllAccounts(): Promise<Account[]>;
  getAccount(id: number): Promise<Account | undefined>;
  createAccount(account: InsertAccount): Promise<Account>;
  updateAccount(id: number, account: Partial<InsertAccount>): Promise<Account | undefined>;
  deleteAccount(id: number): Promise<boolean>;
}

const ACCOUNTS_FILE_PATH = path.join(process.cwd(), 'accounts.json');

export class FileStorage implements IStorage {
  private users: Map<string, User>;
  private accounts: Account[];

  constructor() {
    this.users = new Map();
    this.accounts = [];
    this.loadAccounts();
  }
  
  private async loadAccounts() {
    try {
      const data = await fs.readFile(ACCOUNTS_FILE_PATH, 'utf8');
      this.accounts = JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('accounts.json not found, creating a new file.');
        await fs.writeFile(ACCOUNTS_FILE_PATH, '[]', 'utf8');
        this.accounts = [];
      } else {
        console.error('Error loading accounts:', error);
      }
    }
  }

  private async saveAccounts() {
    await fs.writeFile(ACCOUNTS_FILE_PATH, JSON.stringify(this.accounts, null, 2), 'utf8');
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getAllAccounts(): Promise<Account[]> {
    await this.loadAccounts();
    return this.accounts;
  }

  async getAccount(id: number): Promise<Account | undefined> {
    await this.loadAccounts();
    return this.accounts.find(acc => acc.id === id);
  }

  async createAccount(insertAccount: InsertAccount): Promise<Account> {
    await this.loadAccounts();
    const newAccount: Account = { ...insertAccount, id: Date.now() };
    this.accounts.push(newAccount);
    await this.saveAccounts();
    return newAccount;
  }

  async updateAccount(id: number, updateData: Partial<InsertAccount>): Promise<Account | undefined> {
    await this.loadAccounts();
    const accountIndex = this.accounts.findIndex(acc => acc.id === id);
    if (accountIndex === -1) {
      return undefined;
    }
    
    this.accounts[accountIndex] = { ...this.accounts[accountIndex], ...updateData };
    await this.saveAccounts();
    return this.accounts[accountIndex];
  }

  async deleteAccount(id: number): Promise<boolean> {
    await this.loadAccounts();
    const initialLength = this.accounts.length;
    this.accounts = this.accounts.filter(acc => acc.id !== id);
    
    if (this.accounts.length < initialLength) {
      await this.saveAccounts();
      return true;
    }
    return false;
  }
}

export const storage = new FileStorage();