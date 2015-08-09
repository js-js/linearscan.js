'use strict';

var assert = require('assert');

var linearscan = require('../linearscan');
var Opcode = linearscan.Opcode;
var Operand = linearscan.Operand;
var Interval = linearscan.Interval;

function Config(options) {
  this.input = null;
  this.options = options || {};
  this.registerMap = {};
  this.registers = [];
  this.spills = null;

  this.liveIn = null;
  this.intervals = null;
  this.positions = null;
  this.instructions = null;
  this.unhandled = null;

  // Create intervals for the spills
  for (var i = 0; i < this.options.registers.length; i++) {
    var name = this.options.registers[i];

    this.registerMap[name] = i;
    var reg = new Interval(null);
    reg.fixed = true;
    this.registers.push(reg);
    reg.value = new Operand('register', i);
  }

  this.opcodes = {};
  if (this.options.opcodes) {
    var keys = Object.keys(this.options.opcodes);

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      this.defineOpcode(key, this.options.opcodes[key]);
    }
  }
}
module.exports = Config;

Config.create = function create(options) {
  return new Config(options);
};

Config.prototype.setInput = function setInput(input) {
  this.input = input;
  this.spills = [];

  // Remove intervals and uses from previous iterations
  for (var i = 0; i < this.registers.length; i++)
    this.registers[i].wipe();

  this.positions = new Array(this.input.nodes.length);
  this.intervals = new Array(this.input.nodes.length);
  for (var i = 0; i < this.intervals.length; i++)
    this.intervals[i] = new Interval(this.input.nodes[i]);

  // Fixed splits will be pushed here
  this.unhandled = [];
};

Config.prototype.createOperand = function createOperand(options) {
  if (typeof options === 'string')
    return new Operand(options, null);

  // Use numeric register index
  if (options.kind === 'register')
    return new Operand(options.kind, this.registerMap[options.value]);

  return new Operand(options.kind, options.value);
};

Config.prototype.defineOpcode = function defineOpcode(name, options) {
  var opcode = new Opcode(name);

  this.opcodes[opcode.name] = opcode;

  // TODO(indutny): distinct output

  if (options.output)
    opcode.output = this.createOperand(options.output);

  if (options.inputs)
    for (var i = 0; i < options.inputs.length; i++)
      opcode.inputs.push(this.createOperand(options.inputs[i]));

  if (options.spills) {
    for (var i = 0; i < options.spills.length; i++) {
      var spill = this.createOperand(options.spills[i]);
      assert.equal(spill.kind, 'register', 'Non-register spill requested');
      assert(spill.value !== null, 'Any register spill requested');

      opcode.spills.push(this.createOperand(options.spills[i]));
    }
  }

  return opcode;
};
