import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BoundedSet } from "../scripts/domain/bounded-set.mjs";

describe("BoundedSet (Domain Service)", () => {
  it("stores elements up to maxSize and tracks size", () => {
    const set = new BoundedSet(3);
    assert.equal(set.size, 0);
    assert.equal(set.maxSize, 3);

    set.add("id1");
    set.add("id2");
    assert.equal(set.size, 2);
    assert.equal(set.has("id1"), true);
    assert.equal(set.has("id2"), true);
    assert.equal(set.has("id3"), false);
  });

  it("evicts the oldest element when capacity is exceeded", () => {
    const set = new BoundedSet(3);
    set.add("id1");
    set.add("id2");
    set.add("id3");
    assert.equal(set.size, 3);

    // Adding 4th element should evict id1
    set.add("id4");
    assert.equal(set.size, 3);
    assert.equal(set.has("id1"), false);
    assert.equal(set.has("id2"), true);
    assert.equal(set.has("id3"), true);
    assert.equal(set.has("id4"), true);
  });

  it("refreshes element position upon re-insertion (LRU)", () => {
    const set = new BoundedSet(3);
    set.add("id1");
    set.add("id2");
    set.add("id3");

    // Re-add id1 to refresh it to the newest position
    set.add("id1");
    assert.equal(set.size, 3);

    // Adding id4 should now evict id2, not id1
    set.add("id4");
    assert.equal(set.size, 3);
    assert.equal(set.has("id1"), true);
    assert.equal(set.has("id2"), false);
    assert.equal(set.has("id3"), true);
    assert.equal(set.has("id4"), true);
  });

  it("supports delete and clear methods", () => {
    const set = new BoundedSet(5);
    set.add("a");
    set.add("b");
    assert.equal(set.delete("a"), true);
    assert.equal(set.has("a"), false);
    assert.equal(set.size, 1);

    set.clear();
    assert.equal(set.size, 0);
    assert.equal(set.has("b"), false);
  });

  it("throws when initialized with non-positive or invalid maxSize", () => {
    assert.throws(() => new BoundedSet(0), /maxSize must be a positive number/);
    assert.throws(() => new BoundedSet(-5), /maxSize must be a positive number/);
    assert.throws(() => new BoundedSet("invalid"), /maxSize must be a positive number/);
  });
});
