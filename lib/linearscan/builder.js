'use strict';

var assert = require('assert');
var BitSet = require('bit-set.js');

function Builder(input, config) {
  this.input = input;
  this.config = config;

  this.config.setInput(this.input);

  this.intervals = this.config.intervals;

  this.initBlockRanges();
}
module.exports = Builder;

Builder.create = function create(input, config) {
  return new Builder(input, config);
};

Builder.prototype.inputPos = function inputPos(index) {
  return index * 1 + 0;
};

Builder.prototype.spillPos = function spillPos(index) {
  return index * 1 + 0;
};

Builder.prototype.outputPos = function outputPos(index) {
  return index * 1 + 0;
};

Builder.prototype.initBlockRanges = function initBlockRanges() {
  var offset = this.input.blocks.length;
  var start = offset;
  for (var i = 1; i < this.input.blocks.length; i++) {
    var block = this.input.blocks[i];
    assert(block.nodes.length > 0, 'Empty blocks are not allowed');

    var end = block.nodes[0].index;
    this.intervals[i - 1].fillRange(this.inputPos(start), this.inputPos(end));
    start = end;
  }

  var last = this.input.blocks[i - 1];
  var end = last.nodes[last.nodes.length - 1].index + 1;
  this.intervals[i - 1].fillRange(this.inputPos(start), this.inputPos(end));

  // Kill block intervals
  for (var i = 0; i < this.input.blocks.length; i++)
    this.intervals[i].kill();
};

Builder.prototype.build = function build() {
  this.buildIntervals();
};

Builder.prototype.buildIntervals = function buildIntervals() {
  var liveIn = new Array(this.input.blocks.length);
  for (var i = 0; i < liveIn.length; i++)
    liveIn[i] = new BitSet(this.intervals.length);

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

    this.killPhis(live, block);

    if (block.predecessors.length === 2 &&
        block.predecessors[1].index > block.index) {
      this.buildLoopHeader(live, block, blockInterval);
    }
  }
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

  var inputPos = this.inputPos(node.index);
  var outPos = this.outputPos(node.index);

  var out = this.intervals[node.index];
  if (out.ranges.length === 0)
    out.fillRange(outPos, outPos + 1);
  else
    out.updateStart(outPos);

  if (opcode.output === null)
    out.kill();
  else
    out.use(outPos, opcode.output);

  live.remove(node.index);

  assert.equal(node.inputs.length,
               opcode.inputs.length,
               'Opcode definition does not match CFG node');
  for (var i = 0; i < node.inputs.length; i++) {
    var input = node.inputs[i];
    var interval = this.intervals[input.index];

    interval.fillRange(blockInterval.start(), inputPos);
    interval.use(inputPos, opcode.inputs[i]);
    live.add(input.index, input);
  }

  var spillPos = this.spillPos(node.index);
  for (var i = 0; i < opcode.spills.length; i++) {
    var spill = opcode.spills[i];
    this.config.registers[spill.value].fillRange(spillPos, spillPos + 1);
  }
};

Builder.prototype.killPhis = function killPhis(live, block) {
  var opcode = this.config.opcodes['ssa:phi'];
  assert(opcode.output !== null, 'ssa:phi should have defined output');

  for (var i = 0; i < block.nodes.length; i++) {
    var node = block.nodes[i];

    // Phis MUST be at the block start
    if (node.opcode !== 'ssa:phi')
      break;

    var out = this.intervals[node.index];
    out.use(this.outputPos(node.index), opcode.output);
    live.remove(node.index);

    assert.equal(node.inputs.length,
                 opcode.inputs.length,
                 'Opcode definition does not match CFG node');

    var inputPos = this.inputPos(node.index);
    for (var j = 0; j < node.inputs.length; j++) {
      var input = this.intervals[node.inputs[j].index];
      input.use(inputPos, opcode.inputs[j]);
    }
  }
};

Builder.prototype.buildLoopHeader = function buildLoopHeader(live,
                                                             block,
                                                             blockInterval) {
  var loopEnd = this.intervals[block.predecessors[1].index];

  for (var i = 0; i < live.list.length; i++) {
    var node = live.list[i].value;

    this.intervals[node.index].fillRange(blockInterval.start(), loopEnd.end());
  }
};
