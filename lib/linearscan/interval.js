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
  this.fixedUses = [];

  this.value = null;
  this.alive = true;
  this.fixed = false;

  // Split tree
  this.parent = null;
  this.children = [];
}
module.exports = Interval;

Interval.sort = function sort(a, b) {
  var diff = a.start() - b.start();

  // Prefer longer intervals
  if (diff === 0)
    return b.end() - a.end();

  return diff;
};

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

  var list = value.isFixed() ? this.fixedUses : this.uses;
  var index = binarySearch(list, use, Use.sort);
  if (index < 0)
    index = -1 - index;

  list.splice(index, 0, use);

  return use;
};

Interval.prototype.firstUseAfter = function firstUseAfter(pos, kind) {
  var index = binarySearch(this.uses, pos, Use.needleSort);
  if (index < 0)
    index = -1 - index;

  if (index >= this.uses.length)
    return null;

  if (!kind)
    return this.uses[index];

  while (index < this.uses.length) {
    if (this.uses[index].value.kind === kind)
      return this.uses[index];
    index++;
  }

  return null;
};

Interval.prototype.kill = function kill() {
  this.alive = false;
};

Interval.prototype.getRoot = function getRoot() {
  var current = this;
  while (current.parent !== null)
    current = current.parent;
  return current;
};

Interval.prototype.addChild = function addChild(child) {
  var index = binarySearch(this.children, child, Interval.sort);
  if (index < 0)
    index = -1 - index;
  this.children.splice(index, 0, child);
};

Interval.prototype.splitRanges = function splitRanges(child, pos) {
  var index = binarySearch(this.ranges, pos, Range.coverSort);

  if (index < 0) {
    // No coverage - just slice and push
    index = -1 - index;
  } else {
    // Some range was covered by the `pos`, split it
    var covered = this.ranges[index];
    if (covered.start !== pos) {
      var head = new Range(covered.start, pos);
      var tail = new Range(pos, covered.end);
      this.ranges[index] = head;
      index++;
      this.ranges.splice(index, 0, tail);
    }
  }

  child.ranges = this.ranges.slice(index);
  this.ranges = this.ranges.slice(0, index);
};

Interval.prototype.splitUses = function splitUses(child, pos) {
  var index = binarySearch(this.uses, pos, Use.needleSort);

  if (index < 0)
    index = -1 - index;

  child.uses = this.uses.slice(index);
  this.uses = this.uses.slice(0, index);
};

Interval.prototype.split = function split(pos) {
  var child = new Interval(this.node);
  var root = this.getRoot();

  child.parent = root;

  this.splitRanges(child, pos);
  this.splitUses(child, pos);

  // NOTE: add child after splitting ranges to make sure that it sort won't fail
  root.addChild(child);

  return child;
};

Interval.prototype.remove = function remove() {
  var root = this.getRoot();
  if (root === this)
    return;

  var index = binarySearch(root.children, this, Interval.sort);
  if (index < 0)
    return;

  root.children.splice(index, 1);
  this.parent = null;
};

Interval.prototype.wipe = function wipe() {
  this.remove();
  this.uses = [];
  this.ranges = [];
  this.fixedUses = [];
};

Interval.prototype.intersect = function intersect(other) {
  if (this.ranges.length === 0 || other.ranges.length === 0)
    return false;

  if (this.start() < other.start())
    return other.intersect(this);

  var j = binarySearch(other.ranges, this.start(), Range.coverSort);
  if (j >= 0)
    return this.start();

  var i = 0;
  j = -1 - j;
  while (i < this.ranges.length && j < other.ranges.length) {
    var a = this.ranges[i];

    while (j < other.ranges.length && other.ranges[j].start < a.start)
      j++;

    if (j >= other.ranges.length)
      return false;

    var check = other.ranges[j].intersect(a);
    if (check !== false)
      return check;

    var b = other.ranges[j];
    while (i < this.ranges.length && this.ranges[i].start < b.start)
      i++;

    if (i >= this.ranges.length)
      return false;

    var check = this.ranges[i].intersect(b);
    if (check !== false)
      return check;
  }

  return false;
};

Interval.prototype.childAt = function childAt(pos) {
  var root = this.getRoot();

  if (root.covers(pos))
    return root;

  for (var i = 0; i < root.children.length; i++)
    if (root.children[i].covers(pos))
      return root.children[i];

  return null;
};

Interval.prototype.prevChild = function prevChild() {
  var root = this.getRoot();
  if (root.children.length === 0)
    return null;

  if (this === root)
    return null;

  var index = binarySearch(root.children, this, Interval.sort);
  index--;

  if (index < 0)
    return root;

  return root.children[index];
};

Interval.prototype.nextChild = function nextChild() {
  var root = this.getRoot();
  if (root.children.length === 0)
    return null;

  if (this === root)
    return root.children[0];

  var index = binarySearch(root.children, this, Interval.sort);
  index++;

  if (index >= root.children.length)
    return null;

  return root.children[index];
};
