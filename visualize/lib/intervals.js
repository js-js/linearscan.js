'use strict';

var d3 = require('d3');

function Intervals(selector) {
  this.elem = d3.select(selector);
  this.column = {
    width: 8,
    padding: 2,
    tick: 8
  };

  this.loc = null;
}
module.exports = Intervals;

Intervals.prototype.update = function update(config) {
  var self = this;

  // Fill `loc` array for each node of the input
  var max = this.fillLoc(config.input);

  this.elem.style('width',
                  config.intervals.length *
                      (this.column.width + this.column.padding));
  this.elem.style('height', this.column.tick * max * 3);

  // Create intervals
  var join = this.elem.selectAll('g').data(config.intervals);

  var intervals = join.enter().append('g');

  // Create ranges
  var ranges = intervals.selectAll('rect').data(function data(d, i) {
    return d.ranges.map(function(range) {
      return {
        interval: d,
        index: i,
        range: range
      };
    });
  }, function key(d) {
    return d.index + '/' + d.range.start;
  }).enter().append('rect');

  ranges
      .style('x', function (d) {
        return d.index * (self.column.width + self.column.padding);
      })
      .style('y', function(d) {
        return self.getY(d.range.start);
      })
      .style('width', self.column.width)
      .style('height', function(d) {
        return self.getY(d.range.end) - self.getY(d.range.start);
      });
};

Intervals.prototype.fillLoc = function fillLoc(input) {
  var loc = new Array(input.nodes.length + 1);
  var max = 0;
  for (var i = 0; i < input.nodes.length; i++) {
    var node = input.nodes[i];
    loc[i] = node.loc;
    max = Math.max(node.loc.line, max);
    if (node.loc.end)
      max = Math.max(node.loc.end, max);
  }
  loc[i] = { line: max };
  this.loc = loc;

  return max;
};

Intervals.prototype.getY = function getY(pos) {
  var loc = this.loc[Math.floor(pos / 3)];
  var off = pos % 3;

  // We emulate `pipeline {`
  var line = loc.line - 1;
  return (line * 3 + off) * this.column.tick;
};
