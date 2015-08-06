'use strict';

var d3 = require('d3');

function Intervals(selector) {
  this.elem = d3.select(selector);

  this.axis = {
    width: 24,
    padding: 4,
    trail: 8
  };
  this.column = {
    width: 8,
    padding: 2,
    tick: 8,
    use: 4
  };
}
module.exports = Intervals;

Intervals.prototype.update = function update(config) {
  var self = this;

  var max = 0;
  var domain = d3.range(0, config.input.nodes.length * 3 + 1);
  var lines = domain.map(function(pos) {
    var node = config.input.nodes[Math.floor(pos / 3)];
    var loc;

    if (node)
      loc = node.loc;
    else
      loc = { line: max };

    var off = pos % 3;
    max = Math.max(max, loc.line);
    if (loc.end)
      max = Math.max(max, loc.end);

    // We emulate `pipeline {}`
    var line = loc.line - 1;
    return (line * 3 + off) * this.column.tick;
  }, this);

  var blocks = new Array(max);
  config.input.blocks.forEach(function(block) {
    blocks[block.loc.line * 3] = true;
  });

  var intervalsWidth = config.intervals.length *
                           (this.column.width + this.column.padding) +
                       this.axis.trail;
  this.elem.attr('width',
                 this.axis.width + this.axis.padding + intervalsWidth);
  this.elem.attr('height', this.column.tick * 3 * max);

  // Create scale
  var scaleY = d3.scale.ordinal()
      .domain(domain)
      .range(lines);

  var fakeDomain = d3.range(0, max * 3);
  var fakeY = d3.scale.ordinal()
      .domain(fakeDomain)
      .range(fakeDomain.map(function(pos) {
        return pos * this.column.tick;
      }, this));

  var axis = d3.svg.axis()
      .scale(fakeY)
      .orient('left');

  this.elem.selectAll('.scale')
      .attr('transform', 'translate(' + this.axis.width + ', 0)')
      .call(axis)
      .selectAll('.tick line')
      .attr('class', function(d) {
        if (d % 3 === 0) {
          if (blocks[d])
            return 'block';
          else
            return 'major';
        } else {
          return 'minor';
        }
      })
      .attr('x2', intervalsWidth);

  // Create intervals
  var intervals = this.elem
      .select('.intervals')
      .attr('transform',
            'translate(' + (this.axis.width + this.axis.padding) + ', 0)')
      .selectAll('g.interval').data(config.intervals);
  intervals.exit().remove();
  intervals.enter().append('g');

  intervals
      .attr('class', function(d) {
        return 'interval ' + (d.alive ? 'interval-alive' : 'interval-dead');
      })
      .attr('transform', function (d, i) {
        var x = i * (self.column.width + self.column.padding);
        return 'translate(' + x + ', 0)';
      });

  // Create ranges
  var ranges = intervals.selectAll('rect.range').data(function data(d, i) {
    return d.ranges;
  });
  ranges.exit().remove();
  ranges.enter().append('rect');

  ranges
      .transition()
      .attr('class', 'range')
      .attr('x', 0)
      .attr('y', function(d) {
        return scaleY(d.start);
      })
      .attr('width', this.column.width)
      .attr('height', function(d) {
        return scaleY(d.end) - scaleY(d.start);
      });

  // Create uses
  var uses = intervals.selectAll('rect.use').data(function data(d, i) {
    return d.uses;
  }, function key(use) {
    return use.pos;
  });
  uses.exit().remove();
  uses.enter().append('rect');

  uses
      .transition()
      .attr('class', function(d) {
        var out = 'use ';
        if (d.value.kind === 'any') {
          out += 'use-any';
        } else if (d.value.kind === 'register') {
          if (d.value.value !== null)
            out += 'use-fixed';
          else
            out += 'use-register';
        }
        return out;
      })
      .attr('x', 0)
      .attr('y', function(d) {
        return scaleY(d.pos);
      })
      .attr('width', this.column.width)
      .attr('height', this.column.use);
};
