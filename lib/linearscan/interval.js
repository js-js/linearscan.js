'use strict';

var linearscan = require('../linearscan');
/* jshint -W079 */
var Range = linearscan.Range;
var Use = linearscan.Use;

var binarySearch = require('binary-search');

function Interval(node) {
  this.node = node;
  this.ranges = [];
  this.uses = [];

  this.value = null;
  this.alive = true;
}
module.exports = Interval;

Interval.prototype.addRange = function addRange(start, end) {
  if (start === end)
    return;

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

Interval.prototype.fillRange = function fillRange(start, end) {
  if (start === end)
    return;

  var index = binarySearch(this.ranges, start, Range.coverSort);

  var grow;

  // No existing range cover the `start`
  if (index < 0) {
    index = -1 - index;
    if (index > 0 && this.ranges[index - 1].end === start) {
      index--;
      grow = this.ranges[index];
      grow.end = end;
    } else {
      grow = new Range(start, end);
      this.ranges.splice(index, 0, grow);
    }

  // Existing range already covers `start`
  } else {
    grow = this.ranges[index];
    grow.end = Math.max(grow.end, end);
  }

  // Union next ranges if intersected
  index++;
  while (index < this.ranges.length) {
    var next = this.ranges[index];

    // No intersection
    if (next.start > grow.end)
      break;

    // Union
    if (next.end > grow.end)
      grow.end = next.end;

    // Remove consumed range
    this.ranges.splice(index, 1);
  }
};

Interval.prototype.updateStart = function updateStart(start) {
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

Interval.prototype.kill = function kill() {
  this.alive = false;
};
