'use strict';

function Resolver(config) {
  this.intervals = config.intervals;
  this.instructions = config.instructions;
}
module.exports = Resolver;

Resolver.prototype.resolve = function resolve() {
  this.resolveSplits();
};

Resolver.prototype.resolveSplits = function resolveSplits() {
  for (var i = 0; i < this.intervals.length; i++) {
    var interval = this.intervals[i];

    if (!interval.alive)
      continue;

    var prev = interval;
    for (var j = 0; j < interval.children.length; j++) {
      var child = interval.children[j];
      this.resolveSplit(prev, i);
      prev = child;
    }
  }
};

Resolver.prototype.resolveSplit = function resolveSplit() {
};

Resolver.prototype.gap = function gap() {
};
