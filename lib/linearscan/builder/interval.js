'use strict';

var binarySearch = require('binary-search');

/* jshint -W079 */
var Range = require('./range');
var Use = require('./use');

function Interval(node) {
  this.node = node;
  this.ranges = [];
  this.uses = [];

  this.value = null;
}
module.exports = Interval;

Interval.prototype.addRange = function addRange(start, end) {
  var range = new Range(start, end);
  var index = binarySearch(this.ranges, range, Range.sort);

  // We are only inserting here
  index = -1 - index;

  // Possibly coalesce with existing range
  if (index > 0 && this.ranges[index - 1].end === range.start) {
    this.ranges[index - 1].end = range.end;
    return;
  }
  if (index < this.ranges.length && this.ranges[index].start === range.end) {
    this.ranges[index].start = range.start;
    return;
  }

  // Insert new range
  this.ranges.splice(index, 0, range);
};

Interval.prototype.updateStart = function updateStart(start) {
  if (this.ranges.length === 0)
    this.addRange(start, start + 1);
  else
    this.ranges[0].start = start;
};

Interval.prototype.covers = function covers(pos) {
  var index = binarySearch(this.ranges, pos, Range.coverSort);
  return index >= 0;
};

Interval.prototype.start = function start() {
  return this.ranges[0].start;
};

Interval.prototype.end = function end() {
  return this.ranges[this.ranges.length - 1].end;
};

Interval.prototype.use = function use(pos, value) {
  var use = new Use(pos, value);

  var index = binarySearch(this.uses, use, Use.sort);
  index = -1 - index;

  this.uses.splice(index, 0, use);

  return use;
};

Interval.prototype.firstUseAfter = function firstUseAfter(pos) {
  var index = binarySearch(this.uses, pos, Use.needleSort);
  if (index >= 0)
    index++;
  else
    index = -1 - index;

  if (index >= this.uses.length)
    return null;

  return this.uses[index];
};
