// Lecture minimale d'un email brut (fichier .eml, ou message « raw » de l'API Gmail) :
// en-têtes utiles et partie texte, sans dépendance. Suffisant pour les emails Connectel.

export interface ParsedEmail {
  messageId: string | null
  from: string
  subject: string
  text: string
}

function decodeHeader(value: string): string {
  // « =?UTF-8?B?...?= » / « =?UTF-8?Q?...?= »
  return value.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, charset: string, enc: string, data: string) => {
    const bytes = enc.toUpperCase() === 'B'
      ? Buffer.from(data, 'base64')
      : Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1')
    return new TextDecoder(/8859-1|latin/i.test(charset) ? 'latin1' : 'utf-8').decode(bytes)
  }).replace(/\?=\s+=\?/g, '')
}

function splitHead(raw: string): { headers: Record<string, string>; body: string } {
  const idx = raw.search(/\r?\n\r?\n/)
  const head = idx >= 0 ? raw.slice(0, idx) : raw
  const body = idx >= 0 ? raw.slice(idx).replace(/^\r?\n\r?\n/, '') : ''
  const headers: Record<string, string> = {}
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = line.match(/^([\w-]+):\s*(.*)$/)
    if (m) headers[m[1].toLowerCase()] = m[2]
  }
  return { headers, body }
}

function decodeBody(body: string, headers: Record<string, string>): string {
  const encoding = (headers['content-transfer-encoding'] ?? '').toLowerCase()
  const charset = headers['content-type']?.match(/charset="?([^";]+)"?/i)?.[1] ?? 'utf-8'
  const decoder = new TextDecoder(/8859-1|latin|windows-1252/i.test(charset) ? 'latin1' : 'utf-8')
  if (encoding === 'base64') return decoder.decode(Buffer.from(body.replace(/\s/g, ''), 'base64'))
  if (encoding === 'quoted-printable') {
    const bytes = Buffer.from(body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1')
    return decoder.decode(bytes)
  }
  return body
}

/** Première partie text/plain trouvée (en parcourant les parties multipart). */
function findText(raw: string): string {
  const { headers, body } = splitHead(raw)
  const type = headers['content-type'] ?? 'text/plain'
  const boundary = type.match(/boundary="?([^";]+)"?/i)?.[1]
  if (/^multipart\//i.test(type) && boundary) {
    for (const part of body.split(`--${boundary}`).slice(1)) {
      if (part.startsWith('--')) break
      const text = findText(part.replace(/^\r?\n/, ''))
      if (text) return text
    }
    return ''
  }
  return /^text\/plain/i.test(type) ? decodeBody(body, headers) : ''
}

export function parseRawEmail(raw: string): ParsedEmail {
  const { headers } = splitHead(raw)
  return {
    messageId: headers['message-id']?.trim() ?? null,
    from: decodeHeader(headers.from ?? ''),
    subject: decodeHeader(headers.subject ?? ''),
    text: findText(raw),
  }
}
