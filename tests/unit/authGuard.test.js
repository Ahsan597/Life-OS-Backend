const jwt = require("jsonwebtoken");
const authGuard = require("../../src/middlewares/authGuard");
const tokenService = require("../../src/services/token.service");
const env = require("../../src/config/env");

function run(authorization) {
  const req = { headers: authorization ? { authorization } : {} };
  const next = jest.fn();
  authGuard(req, {}, next);
  return { req, err: next.mock.calls[0][0] };
}

describe("authGuard", () => {
  it("attaches req.user for a valid access token", () => {
    const token = tokenService.signAccessToken(42n);
    const { req, err } = run(`Bearer ${token}`);

    expect(err).toBeUndefined();
    expect(req.user).toEqual({ id: 42n });
  });

  it("rejects a request with no Authorization header", () => {
    expect(run().err.statusCode).toBe(401);
  });

  it("rejects a non-Bearer scheme", () => {
    const token = tokenService.signAccessToken(1n);
    expect(run(`Basic ${token}`).err.statusCode).toBe(401);
  });

  it("rejects a refresh token used as an access token", () => {
    const token = tokenService.signRefreshToken(1n);
    expect(run(`Bearer ${token}`).err.statusCode).toBe(401);
  });

  it("rejects an expired access token", () => {
    const token = jwt.sign({ sub: "1" }, env.jwt.accessSecret, { expiresIn: -10 });
    expect(run(`Bearer ${token}`).err.statusCode).toBe(401);
  });
});
