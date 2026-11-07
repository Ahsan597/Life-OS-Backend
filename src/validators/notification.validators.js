const { z } = require("zod");
const { idParam } = require("./common.validators");

const listNotificationsQuerySchema = z.object({
  unreadOnly: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Cursor: `nextCursor` from the previous page.
  before: idParam.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const updateNotificationSchema = z.object({
  isRead: z.boolean(),
});

module.exports = { listNotificationsQuerySchema, updateNotificationSchema };
