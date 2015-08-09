'use strict';

var linearscan = require('../linearscan');
var Operand = linearscan.Operand;
var Instruction = linearscan.Instruction;

var assert = require('assert');
var BitSet = require('bit-set.js');

function Builder(input, config) {
  this.input = input;
  this.config = config;

  this.config.setInput(this.input);

  this.positions = this.config.positions;
  this.instructions = new Array(this.input.nodes.length * 2);
  this.intervals = this.config.intervals;
  this.unhandled = this.config.unhandled;
  this.registers = this.config.registers;
  this.liveIn = new Array(this.input.blocks.length);
  for (var i = 0; i < this.liveIn.length; i++)
    this.liveIn[i] = new BitSet(this.intervals.length);

  this.config.instructions = this.instructions;
  this.config.liveIn = this.liveIn;

  this.initBlockRanges();
}
module.exports = Builder;

Builder.create = function create(input, config) {
  return new Builder(input, config);
};

Builder.prototype.initBlockRanges = function initBlockRanges() {
  var offset = 0;
  for (var i = 0; i < this.input.blocks.length; i++) {
    var block = this.input.blocks[i];
    var start = offset;

    this.positions[block.index] = offset;

    // Gap at block start
    this.instructions[offset] = null;
    offset++;

    for (var j = 0; j < block.nodes.length; j++) {
      var node = block.nodes[j];
      var instr = new Instruction(node.opcode, node, offset);

      this.instructions[offset] = instr;
      this.positions[node.index] = offset++;

      // Gap after node
      this.instructions[offset] = null;
      offset++;
    }

    // Gap at block end
    this.instructions[offset] = null;
    offset++;

    this.intervals[block.index].fillRange(start, offset);
    this.intervals[block.index].kill();
  }
};

Builder.prototype.build = function build() {
  this.buildIntervals();
};

Builder.prototype.buildIntervals = function buildIntervals() {
  var liveIn = this.liveIn;

  for (var i = this.input.blocks.length - 1; i >= 0; i--) {
    var block = this.input.blocks[i];
    var blockInterval = this.intervals[block.index];
    var live = liveIn[block.blockIndex];

    for (var j = 0; j < block.successors.length; j++) {
      var succ = block.successors[j];
      live.union(liveIn[succ.blockIndex]);
      this.addLivePhis(live, block, succ);
    }

    for (var j = 0; j < live.list.length; j++) {
      var node = live.list[j].value;
      var interval = this.intervals[node.index];

      interval.fillRange(blockInterval.start(), blockInterval.end());
    }

    for (var j = block.nodes.length - 1; j >= 0; j--) {
      var node = block.nodes[j];

      this.buildNodeIntervals(block, blockInterval, live, node);
    }

    var loopStart = block.predecessors.length === 2 &&
                    block.predecessors[1].index > block.index;
    this.killPhis(loopStart, live, block);

    if (loopStart)
      this.buildLoopHeader(live, block, blockInterval);
  }

  this.splitFixed();
};

Builder.prototype.addLivePhis = function addLivePhis(live, block, succ) {
  var index = null;
  for (var i = 0; i < succ.predecessors.length; i++) {
    if (succ.predecessors[i] === block) {
      index = i;
      break;
    }
  }

  for (var i = 0; i < succ.nodes.length; i++) {
    var node = succ.nodes[i];

    // Phis MUST be at the block start
    if (node.opcode !== 'ssa:phi')
      break;

    var input = node.inputs[index];
    live.add(input.index, input);
  }
};

Builder.prototype.buildNodeIntervals = function buildNodeIntervals(
    block,
    blockInterval,
    live,
    node) {
  if (node.opcode === 'ssa:phi')
    return;

  var opcode = this.config.opcodes[node.opcode];
  assert(opcode, 'Failed to find definition for: ' + node.opcode);

  var pos = this.positions[node.index];

  var out = this.intervals[node.index];
  if (out.ranges.length === 0)
    out.fillRange(pos, pos + 1);
  else
    out.updateStart(pos);

  if (opcode.output === null)
    out.kill();
  else
    out.use(pos, opcode.output);

  live.remove(node.index);

  assert.equal(node.inputs.length,
               opcode.inputs.length,
               'Opcode definition does not match CFG node');
  for (var i = 0; i < node.inputs.length; i++) {
    var input = node.inputs[i];
    var interval = this.intervals[input.index];

    interval.fillRange(blockInterval.start(), pos);
    interval.use(pos, opcode.inputs[i]);
    live.add(input.index, input);
  }

  for (var i = 0; i < opcode.spills.length; i++) {
    var spill = opcode.spills[i];
    this.registers[spill.value].fillRange(pos, pos + 1);
  }
};

Builder.prototype.killPhis = function killPhis(loopStart, live, block) {
  var opcode = this.config.opcodes['ssa:phi'];
  assert(opcode.output !== null, 'ssa:phi should have defined output');
  var loopEnd;
  if (loopStart)
    loopEnd = this.intervals[block.predecessors[1].index].end();

  for (var i = 0; i < block.nodes.length; i++) {
    var node = block.nodes[i];

    // Phis MUST be at the block start
    if (node.opcode !== 'ssa:phi')
      break;

    var out = this.intervals[node.index];
    out.use(this.positions[node.index], opcode.output);
    live.remove(node.index);

    assert.equal(node.inputs.length,
                 opcode.inputs.length,
                 'Opcode definition does not match CFG node');

    var pos = this.positions[node.index];
    for (var j = 0; j < node.inputs.length; j++) {
      var input = this.intervals[node.inputs[j].index];

      input.use(pos, opcode.inputs[j]);
      if (loopStart)
        input.use(loopEnd, new Operand('any', null));
    }
  }
};

Builder.prototype.buildLoopHeader = function buildLoopHeader(live,
                                                             block,
                                                             blockInterval) {
  var loopStart = blockInterval.start();
  var loopEnd = this.intervals[block.predecessors[1].index].end();

  for (var i = 0; i < live.list.length; i++) {
    var node = live.list[i].value;

    var interval = this.intervals[node.index];
    interval.fillRange(loopStart, loopEnd);
    interval.use(loopEnd, new Operand('any', null));
  }
};

Builder.prototype.splitFixed = function splitFixed() {
  for (var i = this.intervals.length - 1; i >= 0; i--) {
    var interval = this.intervals[i];

    // Splitting from the end is easier: we always split the root interval
    for (var j = interval.fixedUses.length - 1; j >= 0; j--) {
      var use = interval.fixedUses[j];

      this.splitFixedWithUse(interval, use);

      // Killed
      if (!interval.alive)
        break;
    }
  }
};

Builder.prototype.splitFixedWithUse = function splitFixedWithUse(interval,
                                                                 use) {
  // Fixed output
  if (use.pos === interval.start()) {
    this.registers[use.value.value].fillRange(use.pos, use.pos + 1);

    if (use.pos + 1 < interval.end())
      this.unhandled.push(interval.split(use.pos + 1));

    interval.value = use.value;
    interval.kill();
    return;
  }

  // Fixed use in the middle or end of the interval
  this.registers[use.value.value].fillRange(use.pos - 1, use.pos);

  var fixed = interval;
  // Divide into three: head, middle, and tail
  if (use.pos !== interval.end()) {
    fixed = interval.split(use.pos);
    this.unhandled.push(fixed);
  }
  if (use.pos - 1 > interval.start()) {
    fixed = interval.split(use.pos - 1);
    this.unhandled.push(fixed);
  }

  fixed.value = use.value;
  if (fixed === interval)
    interval.kill();
  else
    fixed.kill();
};
