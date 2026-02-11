/**
 * Cloudflare Email Worker for FeedGlow Newsletter
 * 
 * Setup:
 * 1. Go to CF Dashboard → Email Routing → Enable
 * 2. Add catch-all route → Send to Worker → this worker
 * 3. Set env vars in Worker settings:
 *    - FEEDGLOW_API: https://your-domain.com (or your API URL)
 *    - WEBHOOK_SECRET: (generate a random string, same as server-side NEWSLETTER_WEBHOOK_SECRET)
 */

/**
 * Decode base64 to UTF-8 string (handles CJK characters correctly)
 * atob() only handles Latin1, so we need to go through Uint8Array → TextDecoder
 */
function decodeBase64(b64) {
  const binaryStr = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Decode quoted-printable to UTF-8 string
 * Handles soft line breaks and hex-encoded bytes, then decodes UTF-8
 */
function decodeQuotedPrintable(qp) {
  // Remove soft line breaks
  const cleaned = qp.replace(/=\r?\n/g, '');
  // Convert hex sequences to bytes
  const bytes = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '=' && i + 2 < cleaned.length) {
      const hex = cleaned.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(cleaned.charCodeAt(i));
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

/**
 * Decode MIME part body based on Content-Transfer-Encoding
 */
function decodePart(body, headers) {
  if (headers.includes('content-transfer-encoding: base64')) {
    try {
      return decodeBase64(body);
    } catch { /* fall through */ }
  }
  if (headers.includes('content-transfer-encoding: quoted-printable')) {
    try {
      return decodeQuotedPrintable(body);
    } catch { /* fall through */ }
  }
  return body;
}

/**
 * Extract text/html and text/plain from a MIME part (handles nested multipart)
 */
function extractParts(mimeText, parentContentType) {
  let html = '';
  let text = '';

  const boundaryMatch = parentContentType.match(/boundary="?([^";\s]+)"?/i);
  if (!boundaryMatch) {
    return { html: '', text: '' };
  }

  const boundary = boundaryMatch[1];
  const parts = mimeText.split(`--${boundary}`);

  for (const part of parts) {
    if (part.startsWith('--')) continue; // closing boundary

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const partHeaders = part.slice(0, headerEnd).toLowerCase();
    const partBody = part.slice(headerEnd + 4).replace(/--\s*$/, '').trim();

    // Handle nested multipart (e.g., multipart/alternative inside multipart/mixed)
    if (partHeaders.includes('content-type: multipart/')) {
      const ctLine = part.slice(0, headerEnd).split(/\r?\n/).find(l => l.toLowerCase().includes('content-type:'));
      if (ctLine) {
        const nested = extractParts(partBody, ctLine);
        if (nested.html) html = nested.html;
        if (nested.text) text = nested.text;
      }
      continue;
    }

    const decoded = decodePart(partBody, partHeaders);

    if (partHeaders.includes('content-type: text/html')) {
      html = decoded;
    } else if (partHeaders.includes('content-type: text/plain')) {
      text = decoded;
    }
  }

  return { html, text };
}

export default {
  async email(message, env) {
    try {
      // Extract local part of recipient address
      const toAddress = message.to.split('@')[0];
      const fromEmail = message.from;
      const subject = message.headers.get('subject') || '(untitled)';
      const date = message.headers.get('date') || new Date().toISOString();

      // Read the raw email body
      const rawEmail = await new Response(message.raw).arrayBuffer();
      const rawText = new TextDecoder().decode(rawEmail);

      // Extract HTML and text from raw MIME
      let html = '';
      let text = '';

      const contentType = message.headers.get('content-type') || '';

      if (contentType.includes('multipart/')) {
        // Multipart email — extract parts recursively
        const result = extractParts(rawText, contentType);
        html = result.html;
        text = result.text;
      } else {
        // Single-part email
        const bodyStart = rawText.indexOf('\r\n\r\n');
        if (bodyStart > -1) {
          let body = rawText.slice(bodyStart + 4);
          const headerBlock = rawText.slice(0, bodyStart).toLowerCase();
          body = decodePart(body, headerBlock);
          
          if (contentType.includes('text/html')) {
            html = body.trim();
          } else {
            text = body.trim();
          }
        }
      }

      // Forward to FeedGlow API
      const resp = await fetch(`${env.FEEDGLOW_API}/api/newsletter/inbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': env.WEBHOOK_SECRET,
        },
        body: JSON.stringify({
          to: toAddress,
          from: fromEmail,
          subject,
          html,
          text,
          date,
        }),
      });

      if (!resp.ok) {
        console.log(`[Newsletter] Rejected: ${toAddress} from ${fromEmail}, status ${resp.status}`);
      } else {
        console.log(`[Newsletter] Delivered: ${subject} from ${fromEmail} to ${toAddress}`);
      }
    } catch (err) {
      console.error(`[Newsletter] Error processing email:`, err);
    }
  },
};
