'use strict';

var assert = require('assert');
var util = require('util');

var Reduction = require('json-pipeline-reducer').Reduction;

function PhiGroupReduction(intervals) {
  Reduction.call(this);

  this.intervals = intervals;
}
util.inherits(PhiGroupReduction, Reduction);
module.exports = PhiGroupReduction;

PhiGroupReduction.prototype.reduce = function reduce(node, reducer) {
  if (node.opcode !== 'ssa:phi')
    return;

  var out = this.intervals[node.index];
  if (out.group !== null)
    return;

  var left = this.intervals[node.inputs[0].index];
  var right = this.intervals[node.inputs[1].index];
  if (left.group === null || right.group === null)
    return;

  assert.equal(left.group, right.group, 'Inconsistent phi group');
  out.group = left.group;
  reducer.change(node);
};
