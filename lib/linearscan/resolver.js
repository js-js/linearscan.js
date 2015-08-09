'use strict';

var linearscan = require('../linearscan');
var Gap = linearscan.Gap;
var Operand = linearscan.Operand;

var assert = require('assert');

function Resolver(config) {
  this.config = config;

  this.intervals = config.intervals;
  this.instructions = config.instructions;
  this.positions = config.positions;
}
module.exports = Resolver;

Resolver.create = function create(config) {
  return new Resolver(config);
};

Resolver.prototype.resolve = function resolve() {
  this.resolveUses();
  this.resolveSplits();
  this.resolveJumps();
};

Resolver.prototype.resolveUses = function resolveUses() {
  for (var i = 0; i < this.instructions.length; i++) {
    var instr = this.instructions[i];
    if (instr === null)
      continue;

    var node = instr.node;
    if (node.opcode === 'ssa:phi') {
      this.instructions[i] = null;
      continue;
    }

    if (node.opcode === 'jump' ||
        node.opcode === 'if') {
      continue;
    }

    var out = this.intervals[node.index];
    if (out.value !== null)
      instr.output = out.value;

    for (var j = 0; j < node.inputs.length; j++) {
      var input = node.inputs[j];
      instr.inputs.push(this.intervals[input.index].childAt(instr.pos).value);
    }

    // TODO(indutny): scratches
  }
};

Resolver.prototype.resolveJumps = function resolveJumps() {
  for (var i = 0; i < this.instructions.length; i++) {
    var instr = this.instructions[i];
    if (instr === null)
      continue;
    if (instr instanceof Gap)
      continue;

    var node = instr.node;
    if (node.opcode === 'jump' ||
        node.opcode === 'if') {
      this.resolveControl(node, instr);
    }
  }
};

Resolver.prototype.resolveControl = function resolveControl(node, instr) {
  for (var i = 0; i < node.controlUses.length; i += 2) {
    var control = node.controlUses[i];

    var pos = this.positions[control.index];
    while (this.instructions[pos] === null)
      pos++;

    instr.inputs.push(new Operand('link', this.instructions[pos]));
  }
};

Resolver.prototype.resolveSplits = function resolveSplits() {
  for (var i = 0; i < this.intervals.length; i++) {
    var interval = this.intervals[i];

    var prev = interval;
    for (var j = 0; j < interval.children.length; j++) {
      var next = interval.children[j];
      this.resolveSplit(prev, next);
      prev = next;
    }
  }
};

Resolver.prototype.resolveSplit = function resolveSplit(from, to) {
  if (from.value.isEqual(to.value))
    return;

  assert.equal(from.end(), to.start(), 'Split in the lifetime hole');

  var gap = this.gap(from.end());
  gap.addMove(from.value, to.value);
};

Resolver.prototype.gap = function gap(pos) {
  var gapPos;
  if (this.instructions[pos] === null)
    gapPos = pos;
  else if (this.instructions[pos].opcode === 'ls:gap')
    gapPos = pos;
  else
    gapPos = pos - 1;

  if (this.instructions[gapPos] === null)
    this.instructions[gapPos] = new Gap(gapPos);
  return this.instructions[gapPos];
};
