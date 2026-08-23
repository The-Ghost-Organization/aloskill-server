interface ResetPasswordProps {
  name: string;
  resetLink: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character] ?? character;
  });
}

function safeHttpUrl(value: string): string {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('Reset link must use HTTP or HTTPS');
  }
  return escapeHtml(url.toString());
}

const resetPasswordTemplate = ({ name, resetLink }: ResetPasswordProps): string => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Reset your password</title>
  </head>
  <body style="margin:0;background:#f8fafc;color:#1e293b;font-family:Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px">
        <h1 style="margin:0 0 16px;font-size:24px">Hello, ${escapeHtml(name)}</h1>
        <p style="line-height:1.6">We received a request to reset your password.</p>
        <p style="margin:24px 0">
          <a href="${safeHttpUrl(resetLink)}" style="display:inline-block;padding:12px 20px;background:#f97316;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Reset password</a>
        </p>
        <p style="color:#64748b;line-height:1.6">If you did not request this, you can safely ignore this email.</p>
      </div>
    </div>
  </body>
</html>`;

export default resetPasswordTemplate;
