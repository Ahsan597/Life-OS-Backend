const { mean, standardDeviation, round, slope, pearson } = require("../../src/utils/stats");

const pts = (xs, ys) => xs.map((x, i) => ({ x, y: ys[i] }));

describe("stats utils", () => {
  it("mean is null for no values", () => {
    expect(mean([])).toBeNull();
    expect(mean([1, 2, 3])).toBe(2);
  });

  it("standardDeviation is the sample deviation, null below 2 values", () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(standardDeviation([3])).toBeNull();
  });

  it("round keeps null and rounds to the given places", () => {
    expect(round(null)).toBeNull();
    expect(round(1.23456, 3)).toBe(1.235);
  });

  it("slope is the least-squares change per unit of x", () => {
    expect(slope(pts([0, 1, 2], [1, 3, 5]))).toBe(2);
    expect(slope(pts([1], [1]))).toBeNull();
    expect(slope(pts([2, 2], [1, 5]))).toBeNull();
  });

  describe("pearson", () => {
    it("is 1 / -1 for perfectly linear data", () => {
      expect(pearson(pts([1, 2, 3, 4], [2, 4, 6, 8]))).toBeCloseTo(1);
      expect(pearson(pts([1, 2, 3, 4], [8, 6, 4, 2]))).toBeCloseTo(-1);
    });

    it("matches a hand-computed value", () => {
      // x = [1,2,3,4,5], y = [2,4,5,4,5] -> r = 0.7746
      expect(pearson(pts([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]))).toBeCloseTo(0.7746, 4);
    });

    it("is null when a side never varies or there are too few pairs", () => {
      expect(pearson(pts([1, 2, 3], [1, 1, 1]))).toBeNull();
      expect(pearson(pts([1], [1]))).toBeNull();
    });
  });
});
