export interface User {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "STAFF" | "CLIENT";
  createdAt: Date;
}

export interface Account {
  id: string;
  userId: string;
  accountNumber: string;
  balance: number;
  createdAt: Date;
}

export interface Wallet {
  id: string;
  userId: string;
  balance: number;
}

export interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  type: "credit" | "debit";
  description: string;
  createdAt: Date;
}
