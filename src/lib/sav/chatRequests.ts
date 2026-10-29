import type { Prisma } from '@prisma/client'

/** Détail de l'événement ajouté quand un client utilise « Transmettre au SAV » dans un chat. */
export const CHAT_REQUEST_DETAIL = 'Demande depuis le chat (formulaire SAV)'

/** Dossiers venus du formulaire « Transmettre au SAV » des chats (nouveau dossier ou relance d'un dossier ouvert). */
export const CHAT_REQUEST_WHERE: Prisma.SavCaseWhereInput = {
  events: { some: { kind: 'CALLBACK_REQUESTED', detail: CHAT_REQUEST_DETAIL } },
}

/** Demandes des chats encore à traiter (client à rappeler) : pastille du menu « Demandes SAV ». */
export const CHAT_REQUESTS_TO_HANDLE: Prisma.SavCaseWhereInput = {
  AND: [CHAT_REQUEST_WHERE, { status: { in: ['NEW', 'TO_CALL'] } }],
}
