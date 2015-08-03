'use strict';

var BitSet = require('bit-set.js');

function Builder(input) {
  this.input = input;

  this.blockRange = new Array(this.input.blocks.length);
  this.initBlockRanges();

  this.intervals = new Array(this.input.nodes.length);
  for (var i = 0; i < this.intervals.length; i++)
    this.intervals[i] = new Builder.Interval(this.input.nodes[i], i);

  this.liveIn = new Array(this.input.blocks.length);
  for (var i = 0; i < this.liveIn.length; i++)
    this.liveIn[i] = new BitSet(this.intervals.length);
}
module.exports = Builder;

Builder.Interval = require('./interval');
Builder.Range = require('./range');
Builder.Use = require('./use');

Builder.create = function create(input) {
  return new Builder(input);
};

Builder.prototype.initBlockRanges = function initBlockRanges() {
  var offset = this.input.blocks.length;
  var start = offset;
  for (var i = 1; i < this.input.blocks.length; i++) {
    var block = this.input.blocks[i];

    var end = block.nodes[0].index;
    this.blockRange[i - 1] = {
      start: start,
      end: end
    };
    start = end;
  }

  var last = this.input.blocks[i - 1];
  this.blockRange[i - 1] = {
    start: start,
    end: last.nodes[last.nodes.length - 1].index + 1
  };
};

Builder.prototype.build = function build() {
  this.buildIntervals();
};

Builder.prototype.buildIntervals = function buildIntervals() {
  for (var i = this.input.blocks.length - 1; i >= 0; i--) {
    var block = this.input.blocks[i];
    var range = this.blockRange[block.blockIndex];
    var live = this.liveIn[block.blockIndex];

    live.wipe();
    for (var j = 0; j < block.successors.length; j++) {
      var succ = block.successors[j];
      live.union(this.liveIn[succ.blockIndex]);
      this.addLivePhis(live, succ, j);
    }

    for (var j = 0; j < live.list.length; j++) {
      var node = live.list[j].value;
      var interval = this.intervals[node.index];

      interval.addRange(range.start, range.end);
    }

    for (var j = block.nodes.length - 1; j >= 0; j--) {
      var node = block.nodes[j];

      this.buildNodeIntervals(block, range, live, node);
    }

    this.killPhis(live, block);

    if (block.predecessors.length === 2 &&
        block.predecessors[1].index > block.index) {
      this.buildLoopHeader(live, block, range);
    }
  }
};

Builder.prototype.addLivePhis = function addLivePhis(live, block, index) {
  for (var i = 0; i < block.nodes.length; i++) {
    var node = block.nodes[i];

    // Phis MUST be at the block start
    if (node.opcode !== 'ssa:phi')
      break;

    var input = node.inputs[index];
    live.add(input.index, input);
  }
};

Builder.prototype.buildNodeIntervals = function buildNodeIntervals(block,
                                                                   range,
                                                                   live,
                                                                   node) {
  var out = this.intervals[node.index];
  out.updateStart(node.index);
  live.remove(node.index);

  for (var i = 0; i < node.inputs.length; i++) {
    var input = node.inputs[i];
    var interval = this.intervals[input.index];

    interval.addRange(range.start, input.index);
    live.add(input.index, input);
  }
};

Builder.prototype.killPhis = function killPhis(live, block) {
  for (var i = 0; i < block.nodes.length; i++) {
    var node = block.nodes[i];

    // Phis MUST be at the block start
    if (node.opcode !== 'ssa:phi')
      break;

    live.remove(node.index);
  }
};

Builder.prototype.buildLoopHeader = function buildLoopHeader(live,
                                                             block,
                                                             range) {
  var loopEnd = this.blockRange[block.predecessors[1].blockIndex];

  for (var i = 0; i < live.list.length; i++) {
    var node = live.list[i].value;

    this.intervals[node.index].addRange(range.from, loopEnd.end);
  }
};
