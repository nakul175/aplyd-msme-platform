// The scope rule: a person reads only their own company's records. Owner authority, operator role and every other
// role are irrelevant here. A person with no company reads no company.

export type Identity = { userId: string; companyId: string | null; role: string; displayName: string };

/**
 * Writing a company's records needs the same company match as reading, and the owner role. Another role of the same
 * company can read but not write; no other company's person, and no person without a company, can do either.
 */
export function canWriteOwnCompany(identity: Identity | null, requestedCompanyId: string): boolean {
  return canReadCompany(identity, requestedCompanyId) && identity!.role === "owner";
}

export function canReadCompany(identity: Identity | null, requestedCompanyId: string): boolean {
  return identity !== null && identity.companyId !== null && identity.companyId !== "" && identity.companyId === requestedCompanyId;
}
