'use strict';

function Use(pos, value) {
  this.pos = pos;
  this.value = value;
}
module.exports = Use;

Use.sort = function sort(a, b) {
  return a.pos - b.pos;
};

Use.needleSort = function needleSort(a, b) {
  return a.pos - b;
};
