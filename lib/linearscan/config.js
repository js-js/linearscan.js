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
  this.registerRange = {};
  this.registerName = [];
  this.spills = null;
  this.spillRange = null;

  this.liveIn = null;
  this.intervals = null;
  this.intervalGroup = null;
  this.positions = null;
  this.instructions = null;

  // Create intervals for the spills
  this.groups = Object.keys(this.options.registers);
  for (var i = 0, from = 0; i < this.groups.length; i++) {
    var groupName = this.groups[i];
    var group = this.options.registers[groupName];

    var regs = [];
    for (var j = 0; j < group.length; j++) {
      var name = group[j];

      var reg = new Interval(null, null, null);
      reg.fixed = true;
      reg.value = new Operand('register', groupName, j);

      regs.push(reg);
      this.registers.push(reg);
      this.registerName.push(name);
      this.registerMap[name] = reg.value.value;
    }

    var to = from + regs.length;
    this.registerGroup[groupName] = regs;
    this.registerRange[groupName] = { from: from, to: to };
    from = to;
  }

  this.opcodes = {};
  if (this.options.opcodes)
    this.defineOpcodes(this.options.opcodes);

  // Default opcodes
  this.defineOpcode('start', {});
  this.defineOpcode('region', {});
  this.defineOpcode('ssa:phi', {});
  this.defineOpcode('ls:gap', {});
}
module.exports = Config;

Config.create = function create(options) {
  return new Config(options);
};

Config.prototype.setInput = function setInput(input) {
  this.input = input;
  this.spills = {};

  // Separate spills for each group
  for (var i = 0; i < this.groups.length; i++) {
    var group = this.groups[i];
    this.spills[group] = [];
  }

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
    var opcode = this.getOpcode(node);

    var group = null;

    // There is no opcode for `ssa:phi`
    if (opcode && opcode.output !== null)
      group = opcode.output.group;

    var interval = new Interval(node, opcode, group);
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

Config.prototype.defineOpcodes = function defineOpcodes(opcodes) {
  var keys = Object.keys(opcodes);

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    this.defineOpcode(key, opcodes[key]);
  }
};

Config.prototype.defineOpcode = function defineOpcode(name, options) {
  var opcode = this.createOpcode(name, options);
  this.opcodes[name] = opcode;
};

Config.prototype.createOpcode = function createOpcode(name, options) {
  // Dynamic opcode
  if (typeof options === 'function')
    return options;

  var opcode = new Opcode(name);

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

  opcode.isBranch = !!options.branch;

  return opcode;
};

Config.prototype.getOpcode = function getOpcode(node) {
  var res = this.opcodes[node.opcode];
  // Dynamic opcode
  if (typeof res === 'function')
    res = this.createOpcode(node.opcode, res(node));
  assert(res, 'Failed to find definition for: ' + node.opcode);
  return res;
};

Config.prototype.getRegisterName = function getRegisterName(group, index) {
  return this.options.registers[group][index];
};

Config.prototype.getSpillOffset = function getSpillOffset(group) {
  return this.spillRange[group].from;
};

Config.prototype.getRegOffset = function getRegOffset(group) {
  return this.registerRange[group].from;
};

Config.prototype.computeSpillRange = function computeSpillRange() {
  this.spillRange = {};
  for (var i = 0, from = 0; i < this.groups.length; i++) {
    var group = this.groups[i];
    var spills = this.spills[group];

    var to = from + spills.length;
    this.spillRange[group] = { from: from, to: to };
    from = to;
  }
};

Config.prototype.getOutput = function getOutput() {
  var output = pipeline.create('register');

  this.computeSpillRange();

  var map = new Array(this.instructions.length);
  for (var i = 0; i < this.instructions.length; i++) {
    var instr = this.instructions[i];
    if (instr === null)
      continue;

    if (instr instanceof Gap) {
      map[instr.pos] = this.renderGap(instr, output);
      continue;
    }

    var current = output.add(instr.opcode.name);
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

  // Export spill ranges
  for (var i = 0; i < this.groups.length; i++) {
    var group = this.groups[i];
    var range = this.spillRange[group];
    output.setSpillType(group, range.from, range.to);
  }

  return output;
};

Config.prototype.renderGap = function renderGap(gap, pipeline) {
  assert(!gap.isEmpty(), 'Empty Gap');
  gap.resolve(this);

  var first = null;
  for (var i = 0; i < gap.resolved.length; i++) {
    var group = gap.resolved[i];
    var groupName = group.group;

    var groupFirst = this.renderGapMove(groupName, group.moves[0], pipeline);
    if (first === null)
      first = groupFirst;
    for (var j = 1; j < group.moves.length; j++)
      this.renderGapMove(groupName, group.moves[j], pipeline);
  }

  return first;
};

Config.prototype.renderGapMove = function renderGapMove(group, move, pipeline) {
  var src;
  var dst;

  if (move.src >= 0)
    src = pipeline.reg(this.getRegisterName(group, move.src));
  else
    src = pipeline.spill(-1 - move.src);

  if (move.dst >= 0)
    dst = pipeline.reg(this.getRegisterName(group, move.dst));
  else
    dst = pipeline.spill(-1 - move.dst);

  return pipeline.add('ls:' + move.kind + '.' + group, dst, src);
};

Config.prototype.gap = function gap(pos) {
  var gapPos;
  if (this.instructions[pos] === null)
    gapPos = pos;
  else if (this.instructions[pos].opcode.name === 'ls:gap')
    gapPos = pos;
  else
    gapPos = pos - 1;

  if (this.instructions[gapPos] === null)
    this.instructions[gapPos] = new Gap(this.opcodes['ls:gap'], gapPos);
  return this.instructions[gapPos];
};
