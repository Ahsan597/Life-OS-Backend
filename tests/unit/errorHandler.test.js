const { Prisma } = require("@prisma/client");
const { errorHandler } = require("../../src/middlewares/errorHandler");
const AppError = require("../../src/utils/AppError");

function run(err) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  errorHandler(err, {}, res, jest.fn());
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

function prismaError(code) {
  return new Prisma.PrismaClientKnownRequestError("db error", { code, clientVersion: "test" });
}

describe("errorHandler", () => {
  it("returns an AppError's status, message and details", () => {
    const details = [{ field: "email", message: "bad" }];
    expect(run(new AppError("Validation failed", 400, details))).toEqual({
      status: 400,
      body: { error: "Validation failed", details },
    });
  });

  it("hides the message of unexpected errors behind a 500", () => {
    expect(run(new Error("db password is hunter2"))).toEqual({
      status: 500,
      body: { error: "Internal server error" },
    });
  });

  it("maps a malformed JSON body to a 400", () => {
    const err = Object.assign(new SyntaxError("Unexpected end"), {
      status: 400,
      expose: true,
      type: "entity.parse.failed",
    });
    expect(run(err)).toEqual({ status: 400, body: { error: "Malformed JSON body" } });
  });

  it("maps an oversized payload to a 413", () => {
    const err = Object.assign(new Error("request entity too large"), {
      status: 413,
      expose: true,
      type: "entity.too.large",
    });
    expect(run(err).status).toBe(413);
  });

  it("maps Prisma unique-constraint and not-found errors to 409 / 404", () => {
    expect(run(prismaError("P2002")).status).toBe(409);
    expect(run(prismaError("P2025")).status).toBe(404);
  });

  it("treats other Prisma errors as unexpected", () => {
    expect(run(prismaError("P1001")).status).toBe(500);
  });
});
