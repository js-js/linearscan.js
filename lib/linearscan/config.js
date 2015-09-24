'use strict';

var assert = require('assert');
var pipeline = require('json-pipeline');

var linearscan = require('../linearscan');
var Opcode = linearscan.Opcode;
var Operand = linearscan.Operand;
var Interval = linearscan.Interval;
var Gap = linearscan.Gap;

function Config(options) {
  this.input = null;
  this.options = options || {};
  this.registerMap = {};
  this.registers = [];
  this.registerGroup = {};
  this.spills = null;

  this.liveIn = null;
  this.intervals = null;
  this.intervalGroup = null;
  this.positions = null;
  this.instructions = null;

  // Create intervals for the spills
  this.groups = Object.keys(this.options.registers);
  for (var i = 0; i < this.groups.length; i++) {
    var groupName = this.groups[i];
    var group = this.options.registers[groupName];

    var regs = [];
    for (var j = 0; j < group.length; j++) {
      var name = group[j];

      var reg = new Interval(null);
      reg.fixed = true;
      reg.value = new Operand('register', groupName, j);

      regs.push(reg);
      this.registers.push(reg);
      this.registerMap[name] = reg.value.value;
    }

    this.registerGroup[groupName] = regs;
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

  this.intervalGroup = {};
  for (var i = 0; i < this.groups.length; i++)
    this.intervalGroup[this.groups[i]] = [];

  this.positions = new Array(this.input.nodes.length);
  this.intervals = new Array(this.input.nodes.length);
  for (var i = 0; i < this.intervals.length; i++) {
    var node = this.input.nodes[i];
    var opcode = this.opcodes[node.opcode];

    var group = null;

    // There is no opcode for `ssa:phi`
    if (opcode && opcode.output !== null)
      group = opcode.output.group;

    var interval = new Interval(node, group);
    this.intervals[i] = interval;
  }
};

Config.prototype.createOperand = function createOperand(options) {
  // Use numeric register index
  if (options.kind === 'register') {
    return new Operand(options.kind,
                       options.group,
                       this.registerMap[options.value]);
  }

  return new Operand(options.kind, options.group, options.value);
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

Config.prototype.registerName = function registerName(group, index) {
  return this.options.registers[group][index];
};

Config.prototype.getOutput = function getOutput() {
  var output = pipeline.create('register');

  var map = new Array(this.instructions.length);
  for (var i = 0; i < this.instructions.length; i++) {
    var instr = this.instructions[i];
    if (instr === null)
      continue;

    if (instr instanceof Gap) {
      map[instr.pos] = this.renderGap(instr, output);
      continue;
    }

    var current = output.add(instr.opcode);
    map[instr.pos] = current;

    if (instr.output !== null)
      current.setOutput(instr.output.toPipeline(this, output));

    for (var j = 0; j < instr.inputs.length; j++)
      current.addInput(instr.inputs[j].toPipeline(this, output));

    var literals = instr.node.literals;
    for (var j = 0; j < literals.length; j++)
      current.addLiteral(literals[j]);
  }

  // Link together
  for (var i = 0; i < this.instructions.length; i++) {
    var instr = this.instructions[i];
    if (instr === null)
      continue;

    var current = map[instr.pos];
    for (var j = 0; j < instr.links.length; j++)
      current.link(map[instr.links[j].pos]);
  }

  return output;
};

Config.prototype.renderGap = function renderGap(gap, pipeline) {
  gap.resolve();

  var first = this.renderGapMove(gap.resolved[0], pipeline);
  for (var i = 1; i < gap.resolved.length; i++)
    this.renderGapMove(gap.resolved[i], pipeline);

  return first;
};

Config.prototype.renderGapMove = function renderGapMove(move, pipeline) {
  var src;
  var dst;

  if (move.src >= 0)
    src = pipeline.reg(move.src);
  else
    src = pipeline.spill(-1 - move.src);

  if (move.dst >= 0)
    dst = pipeline.reg(move.dst);
  else
    dst = pipeline.spill(-1 - move.dst);

  return pipeline.add('ls:' + move.kind, dst, src);
};
