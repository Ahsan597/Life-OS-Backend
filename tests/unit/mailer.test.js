const logger = require("../../src/config/logger");
const mailer = require("../../src/services/mailer");

describe("mailer", () => {
  afterEach(() => jest.restoreAllMocks());

  it("masks addresses so logs don't hold full emails", () => {
    expect(mailer.maskEmail("ahsan@example.com")).toBe("a***@example.com");
  });

  it("log transport writes the email to the log instead of sending it", async () => {
    const info = jest.spyOn(logger, "info").mockImplementation(() => {});

    await mailer.send({ to: "ahsan@example.com", subject: "Hi", text: "Body" });

    expect(info).toHaveBeenCalledTimes(1);
    const [fields, message] = info.mock.calls[0];
    expect(message).toMatch(/not actually sent/);
    expect(fields.mail).toMatchObject({ to: "a***@example.com", subject: "Hi", text: "Body" });
    expect(JSON.stringify(fields)).not.toContain("ahsan@example.com");
  });
});
