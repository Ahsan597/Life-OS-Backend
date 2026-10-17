const { z } = require("zod");
const validateRequest = require("../../src/middlewares/validateRequest");
const AppError = require("../../src/utils/AppError");

describe("validateRequest", () => {
  const schema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) });

  it("replaces req.body with parsed data and calls next() on valid input", () => {
    const req = { body: { email: "  Foo@Example.com ", extra: "stripped" } };
    const next = jest.fn();

    validateRequest(schema)(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ email: "foo@example.com" });
  });

  it("passes a 400 AppError with field details on invalid input", () => {
    const req = { body: { email: "not-an-email" } };
    const next = jest.fn();

    validateRequest(schema)(req, {}, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.details[0].field).toBe("email");
  });

  it("treats a missing body as an empty object", () => {
    const next = jest.fn();

    validateRequest(schema)({}, {}, next);

    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });
});
