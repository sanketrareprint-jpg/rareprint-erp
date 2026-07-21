// backend/src/complaints/dto/update-complaint.dto.ts
import { ComplaintStatus } from '../complaints.calc';

export interface AssignComplaintDto {
  assignedToId?: string;
  assignedTeam?: string;
  reason?: string;
}

export interface UpdateStatusDto {
  toStatus: ComplaintStatus;
  reason?: string;
}

export interface ComplaintFilters {
  status?: ComplaintStatus;
  priority?: string;
  category?: string;
  assignedToId?: string;
  customerId?: string;
  orderId?: string;
  overdue?: boolean;
}
