/**
 * A Set with a maximum capacity (LRU eviction).
 * When inserting beyond maxSize, the oldest entry is evicted.
 * Useful for keeping processed message/roll ID history bounded during long sessions.
 */
export class BoundedSet {
  #set;
  #maxSize;

  /**
   * @param {number} [maxSize=500]
   */
  constructor(maxSize = 500) {
    if (typeof maxSize !== "number" || maxSize <= 0) {
      throw new Error("maxSize must be a positive number.");
    }
    this.#maxSize = maxSize;
    this.#set = new Set();
  }

  /**
   * Current number of elements in the set.
   * @returns {number}
   */
  get size() {
    return this.#set.size;
  }

  /**
   * Maximum capacity of the set.
   * @returns {number}
   */
  get maxSize() {
    return this.#maxSize;
  }

  /**
   * Checks if an element exists in the set.
   * @param {*} value
   * @returns {boolean}
   */
  has(value) {
    return this.#set.has(value);
  }

  /**
   * Adds an element to the set. If capacity is exceeded, the oldest element is removed.
   * @param {*} value
   * @returns {BoundedSet}
   */
  add(value) {
    if (this.#set.has(value)) {
      this.#set.delete(value);
      this.#set.add(value);
      return this;
    }

    if (this.#set.size >= this.#maxSize) {
      const oldest = this.#set.keys().next().value;
      this.#set.delete(oldest);
    }

    this.#set.add(value);
    return this;
  }

  /**
   * Removes an element from the set.
   * @param {*} value
   * @returns {boolean}
   */
  delete(value) {
    return this.#set.delete(value);
  }

  /**
   * Clears all elements from the set.
   */
  clear() {
    this.#set.clear();
  }

  /**
   * Returns an iterable of values in the set.
   * @returns {IterableIterator<*>}
   */
  values() {
    return this.#set.values();
  }
}
