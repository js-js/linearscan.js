'use strict';

function Range(start, end) {
  this.start = start;
  this.end = end;
}
module.exports = Range;

Range.sort = function sort(a, b) {
  return a.start - b.start;
};

Range.coverSort = function coverSort(haystack, needle) {
  return haystack.start > needle ? 1 : haystack.end <= needle ? -1 : 0;
};

Range.prototype.covers = function covers(pos) {
  return this.start <= pos && pos < this.end;
};

Range.prototype.inspect = function inspect() {
  return '[' + this.start + ';' + this.end + ')';
};

Range.prototype.intersect = function intersect(other) {
  if (other.covers(this.end - 1))
    return Math.max(this.start, other.start);
  if (this.covers(other.end - 1))
    return Math.max(other.start, this.start);
  return false;
};
