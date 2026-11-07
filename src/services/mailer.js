/**
 * Outgoing email.
 *
 * Only the "log" transport exists for now (a placeholder): it writes the email
 * to the application log instead of sending it, so the reminder pipeline works
 * end to end without an email provider. To send real mail, add a transport
 * (nodemailer SMTP, SES, Resend, ...) selected by MAIL_TRANSPORT, keeping the
 * same `send` signature; callers don't change.
 */
const env = require("../config/env");
const logger = require("../config/logger");

// "ahsan@example.com" -> "a***@example.com": enough to debug, not PII in logs.
function maskEmail(email) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

const transports = {
  async log({ to, subject, text }) {
    logger.info(
      { mail: { from: env.mail.from, to: maskEmail(to), subject, text } },
      "Email (log transport: not actually sent)"
    );
  },
};

/** Resolves once the transport accepted the message; rejects if it failed. */
function send(message) {
  return transports[env.mail.transport](message);
}

module.exports = { send, maskEmail };
