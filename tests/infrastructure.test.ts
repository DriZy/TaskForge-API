describe("test infrastructure", () => {
  it("runs tests under ts-jest", () => {
    const add = (a: number, b: number): number => a + b;
    expect(add(2, 3)).toBe(5);
  });
});
