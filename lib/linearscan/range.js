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
