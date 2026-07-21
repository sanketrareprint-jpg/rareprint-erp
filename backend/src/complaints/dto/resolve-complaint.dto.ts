// backend/src/complaints/dto/resolve-complaint.dto.ts
export type ComplaintResolutionType =
  | 'REPRINT'
  | 'REFUND'
  | 'PARTIAL_REFUND'
  | 'REPLACEMENT'
  | 'DISCOUNT_CREDIT'
  | 'APOLOGY_ONLY'
  | 'NO_FAULT_FOUND'
  | 'GOODWILL';

export interface ResolveComplaintDto {
  resolutionType: ComplaintResolutionType;
  resolutionNotes?: string;
  rootCause?: string;
  vendorId?: string;
}

export interface ReopenComplaintDto {
  reason?: string;
}

export interface CsatDto {
  rating: number;
  feedback?: string;
}
