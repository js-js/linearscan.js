'use strict';

var BitField = require('bitfield.js');

function Builder(input) {
  this.input = input;

  this.intervals = new Array(this.input.nodes.length);
  for (var i = 0; i < this.intervals.length; i++)
    this.intervals[i] = new Builder.Interval(this.input.nodes[i]);

  this.liveKill = new Array(this.input.blocks.length);
  this.liveGen = new Array(this.liveKill.length);
  for (var i = 0; i < this.liveKill.length; i++)
    this.liveKill[i] = new BitField(this.intervals.length);
  for (var i = 0; i < this.liveGen.length; i++)
    this.liveGen[i] = new BitField(this.intervals.length);
}
module.exports = Builder;

Builder.Interval = require('./interval');
Builder.Range = require('./range');
Builder.Use = require('./use');

Builder.create = function create(input) {
  return new Builder(input);
};

Builder.prototype.build = function build() {
  // In-bock liveness analysis
  this.buildLocal();
};

Builder.prototype.buildLocal = function buildLocal() {
  for (var i = 0; i < this.input.blocks.length; i++) {
    var block = this.input.blocks[i];
    var liveKill = this.liveKill[i];
    var liveGen = this.liveGen[i];

    for (var j = 0; j < block.nodes.length; j++) {
      var node = block.nodes[j];

      this.buildLocalNode(liveKill, liveGen, node);
    }
  }
};

Builder.prototype.buildLocalNode = function buildLocalNode(kill, gen, node) {
  kill.set(node.index);

  // Propagate inputs that come from different block
  for (var k = 0; k < node.inputs.length; k++)
    if (!kill.check(node.inputs[k].index))
      gen.set(node.inputs[k].index);
};
