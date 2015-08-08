'use strict';

var assert = require('assert');
var binarySearch = require('binary-search');

var linearscan = require('../linearscan');
var Interval = linearscan.Interval;
var Operand = linearscan.Operand;

function notEmpty(interval) {
  return interval.ranges.length !== 0;
}

function Allocator(config) {
  this.config = config;

  this.intervals = this.config.intervals;
  this.registers = this.config.registers;

  this.registerOperands = new Array(this.registers.length);
  for (var i = 0; i < this.registerOperands.length; i++)
    this.registerOperands[i] = new Operand('register', i);

  // TODO(indutny): use array with register id as index
  this.active = [];

  this.inactive = this.config.registers.filter(notEmpty);
  this.unhandled = this.config.unhandled.concat(this.intervals);
  this.unhandled = this.unhandled.filter(notEmpty).sort(Interval.sort);

  // See `allocateFree` and `allocateBlocked`
  this.free = new Array(this.registers.length);
  this.blocked = new Array(this.registers.length);
}
module.exports = Allocator;

Allocator.create = function create(config) {
  return new Allocator(config);
};

Allocator.prototype.allocate = function allocate() {
  while (this.unhandled.length !== 0) {
    var current = this.unhandled.shift();
    if (!current.alive)
      continue;

    var position = current.start();

    this.checkActive(position);
    this.checkInactive(position);

    var success = this.allocateFree(current, position);
    if (!success)
      success = this.allocateBlocked(current, position);

    if (success)
      this.active.push(current);
  }
};

Allocator.prototype.checkActive = function checkActive(pos) {
  for (var i = this.active.length - 1; i >= 0; i--) {
    var interval = this.active[i];

    var remove = false;
    if (interval.end() <= pos) {
      remove = true;
    } else if (!interval.covers(pos)) {
      remove = true;
      this.inactive.push(interval);
    }

    if (!remove)
      continue;

    this.active.splice(i, 1);
  }
};

Allocator.prototype.checkInactive = function checkInactive(pos) {
  for (var i = this.inactive.length - 1; i >= 0; i--) {
    var interval = this.inactive[i];

    var remove = false;
    if (interval.end() <= pos) {
      remove = true;
    } else if (interval.covers(pos)) {
      remove = true;
      this.active.push(interval);
    }

    if (!remove)
      continue;

    this.inactive.splice(i, 1);
  }
};

Allocator.prototype.pushUnhandled = function pushUnhandled(interval) {
  var index = binarySearch(this.unhandled, interval, Interval.sort);
  if (index < 0)
    index = -1 - index;

  this.unhandled.splice(index, 0, interval);
};

Allocator.prototype.allocateFree = function allocateFree(current) {
  for (var i = 0; i < this.free.length; i++)
    this.free[i] = Number.MAX_SAFE_INTEGER;

  // Can't allocate against active registers
  for (var i = 0; i < this.active.length; i++)
    this.free[this.active[i].value.value] = 0;

  // No conflicts with inactive either
  // TODO(indutny): do it only if `current` is a split child
  for (var i = 0; i < this.inactive.length; i++) {
    var intersect = this.inactive[i].intersect(current);
    if (intersect === false)
      continue;

    var reg = this.inactive[i].value.value;
    this.free[reg] = Math.min(this.free[reg], intersect);
  }

  var reg = this.hintedSelect(current, this.free);
  var maxPos = this.free[reg];
  if (maxPos === 0)
    return false;

  // Conflict, split
  if (current.end() > maxPos)
    this.split(current, current.start(), maxPos);

  current.value = this.registerOperands[reg];
  return true;
};

Allocator.prototype.allocateBlocked = function allocateBlocked(current, pos) {
  for (var i = 0; i < this.blocked.length; i++)
    this.blocked[i] = Number.MAX_SAFE_INTEGER;

  for (var i = 0; i < this.active.length; i++) {
    var use = this.active[i].firstUseAfter(pos);
    if (use === null)
      continue;

    this.blocked[this.active[i].value.value] = use.pos;
  }

  // TODO(indutny): do it only if `current` is a split child
  for (var i = 0; i < this.inactive.length; i++) {
    var intersect = this.inactive[i].intersect(current);
    if (intersect === false)
      continue;

    var use = this.inactive[i].firstUseAfter(pos);
    if (use === null)
      continue;

    var index = this.inactive[i].value.value;
    this.blocked[index] = Math.min(this.blocked[index], use.pos);
  }

  var reg = this.hintedSelect(current, this.blocked);
  var maxPos = this.blocked[reg];

  // Split before the fixed use of that register, there is no point in
  // splitting other intervals after it
  var fixedIntersect = this.registers[reg].intersect(current);
  if (fixedIntersect !== false) {
    // Blocked by fixed register at interval start
    if (current.start() === fixedIntersect) {
      this.spill(current);
      return false;
    }

    // TODO(indutny): figure out split range
    this.split(current, fixedIntersect, fixedIntersect);
  }

  // Do not count use at start, this is not what we are here for
  var firstUse = current.firstUseAfter(pos);
  if (firstUse === null || firstUse.pos >= maxPos) {
    // Spill itself
    this.spill(current);
    var regUse = current.firstUseAfter(pos, 'register');

    // No register use - no point in splitting
    if (regUse === null)
      return false;

    // Split before next register use
    assert(pos !== regUse.pos, 'Failed to allocate blocked register');

    // TODO(indutny): figure out split range
    this.split(current, regUse.pos, regUse.pos);

    return false;
  }

  // Spill other
  current.value = this.registerOperands[reg];
  this.splitOther(current, pos);

  return true;
};

Allocator.prototype.split = function split(interval, from, to) {
  var child = interval.split(to);

  assert(child.ranges.length > 0, 'Split child empty');
  assert(interval.ranges.length > 0, 'Split parent empty');

  this.pushUnhandled(child);
  return child;
};

Allocator.prototype.spill = function spill(current) {
  // TODO(indutny): spill freelist
  var spill = new Operand('spill', this.config.spills.length);
  this.config.spills.push(spill);
  current.value = spill;
};

Allocator.prototype.splitOther = function splitOther(current, pos) {
  for (var i = 0; i < this.active.length; i++) {
    if (this.active[i].value.value !== current.value.value)
      continue;
    if (this.active[i].fixed)
      continue;

    assert(this.active[i].start() < pos, 'Can\'t make progress');
    this.split(this.active[i], pos, pos);
  }

  for (var i = 0; i < this.inactive.length; i++) {
    if (this.inactive[i].value.value !== current.value.value)
      continue;
    if (this.inactive[i].fixed)
      continue;

    this.split(this.inactive[i], pos, pos);
  }
};

Allocator.prototype.hintedSelect = function hintedSelect(current, list) {
  // Try to coalesce with previous or next child
  var hint = current.prevChild();
  if (hint === null || hint.value === null || hint.value.kind !== 'register')
    hint = current.nextChild();
  if (hint === null || hint.value === null || hint.value.kind !== 'register')
    hint = null;
  if (hint !== null)
    hint = hint.value.value;

  if (list[hint] > 0)
    return hint;

  var reg = 0;
  var maxPos = 0;
  for (var i = 0; i < list.length; i++) {
    if (list[i] <= maxPos)
      continue;

    reg = i;
    maxPos = list[i];
  }

  return reg;
};
