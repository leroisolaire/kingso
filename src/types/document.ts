export type DocumentType = 'PUBLIC' | 'INTERNAL' | 'FRANCHISE'
export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'ERROR'

export interface Document {
  id: string
  title: string
  content: string
  type: DocumentType
  categoryId: string | null
  categoryName?: string | null
  fileUrl: string | null
  storagePath?: string | null
  fileName?: string | null
  fileSize?: number | null
  pageCount?: number | null
  status?: DocumentStatus
  statusMessage?: string | null
  chunkCount?: number
  driveFileId?: string | null
  /** Emplacement dans le Drive, ex. « Public/PAC/Hitachi/Yutaki 2016 » */
  drivePath?: string | null
  createdAt: string
  updatedAt: string
}

/** Données saisies dans le formulaire du back-office */
export type DocumentInput = Pick<Document, 'title' | 'content' | 'type' | 'categoryId'>
