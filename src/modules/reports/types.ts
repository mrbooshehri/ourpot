export type ReportRange = { from: string; to: string };
export type HouseholdReport = {
  range: ReportRange;
  household: { income: number; expense: number; net: number };
  byEntrant: Record<string, { income: number; expense: number }>;
  byCategory: Record<string, number>;
  accountBalances: Array<{ accountId: string; name: string; balance: number }>;
  monthly: Array<{ month: string; income: number; expense: number; net: number }>;
};
