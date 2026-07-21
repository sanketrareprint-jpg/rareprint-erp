// backend/src/complaints/dto/add-comment.dto.ts
export type ComplaintCommentVisibility = 'INTERNAL' | 'CUSTOMER';

export interface AddCommentDto {
  authorId?: string;
  authorName: string;
  visibility?: ComplaintCommentVisibility;
  message: string;
}

export interface AddAttachmentDto {
  url: string;
  fileName: string;
  fileType?: string;
  uploadedById?: string;
}
