// The scope rule: a person reads only their own company's records. Owner authority, operator role and every other
// role are irrelevant here. A person with no company reads no company.

export type Identity = { userId: string; companyId: string | null; role: string; displayName: string };

export function canReadCompany(identity: Identity | null, requestedCompanyId: string): boolean {
  return identity !== null && identity.companyId !== null && identity.companyId === requestedCompanyId;
}
