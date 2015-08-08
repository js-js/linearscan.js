'use strict';

var d3 = require('d3');

function Intervals(selector) {
  this.elem = d3.select(selector);

  this.axis = {
    width: 0,
    padding: 0,
    trail: 8
  };
  this.column = {
    width: 8,
    padding: -4,
    groupPadding: 8,
    height: 24,
    tick: 0,
    use: 4
  };

  this.multiplier = 2;
  this.column.tick = this.column.height / this.multiplier;
}
module.exports = Intervals;

Intervals.prototype.update = function update(config) {
  var self = this;

  var groups = this.build(config);
  var scaleY = this.createAxis(config, groups);

  // Create groups
  var groups = this.elem
      .select('.intervals')
      .attr('transform',
            'translate(' + (this.axis.width + this.axis.padding) + ', 0)')
      .selectAll('g.group').data(groups.list);
  groups.exit().remove();
  groups.enter().append('g');

  groups
      .attr('class', function d(group, i) {
        return i < config.intervals.length ? 'group' : 'group group-fixed';
      })
      .transition()
      .attr('transform', function(d, i) {
        var offset = d.offset * (self.column.width + self.column.padding);
        offset += i * self.column.groupPadding;
        return 'translate(' + offset + ', 0)';
      });

  // Create intervals
  var intervals = groups.selectAll('g.interval').data(function(d) {
    return d.list;
  });
  intervals.exit().remove();
  intervals.enter().append('g');

  intervals
      .attr('class', function(d) {
        var out = 'interval';
        out += ' ' + (d.alive ? 'interval-alive' : 'interval-dead');
        if (d.value === null)
          return out;

        if (d.value.kind === 'register')
          out += ' interval-reg-' + d.value.value;
        else if (d.value.kind === 'spill')
          out += ' interval-spill';

        return out;
      })
      .transition()
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
      .attr('class', 'range')
      .transition()
      .attr('x', 0)
      .attr('y', function(d) {
        return scaleY(d.start);
      })
      .attr('width', this.column.width)
      .attr('height', function(d) {
        if (scaleY(d.end) - scaleY(d.start) < 0)
          console.log(d);
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
      .transition()
      .attr('x', 0)
      .attr('y', function(d) {
        return scaleY(d.pos);
      })
      .attr('width', this.column.width)
      .attr('height', this.column.use);
};

Intervals.prototype.createAxis = function createAxis(config, groups) {
  var self = this;

  var lines = [];
  var maxLine = 0;
  for (var i = 0; i < config.input.blocks.length; i++) {
    var block = config.input.blocks[i];
    maxLine = Math.max(maxLine, block.loc.end);

    // Gap at block start
    lines.push(block.loc.line);
    for (var j = 0; j < block.nodes.length; j++) {
      var node = block.nodes[j];
      lines.push(node.loc.line);

      // Gap after instruction
      lines.push(node.loc.line + (1 / this.multiplier));
    }

    // Gap at block end
    lines.push(block.loc.end);
  }
  lines.push(maxLine);
  var domain = d3.range(0, lines.length);

  var blocks = new Array(maxLine);
  config.input.blocks.forEach(function(block) {
    blocks[block.loc.line - 1] = true;
  }, this);

  var scaleY = d3.scale.ordinal()
      .domain(domain)
      .range(lines.map(function(line) {
        return (line - 1) * this.column.tick * this.multiplier;
      }, this));

  var fakeDomain = d3.range(0, maxLine * this.multiplier);
  var fakeY = d3.scale.ordinal()
      .domain(fakeDomain)
      .range(fakeDomain.map(function(pos) {
        return pos * this.column.tick;
      }, this));

  var axis = d3.svg.axis()
      .scale(fakeY)
      .orient('left')
      .tickFormat('');

  var intervalsWidth = groups.totalCount *
                           (this.column.width + this.column.padding) +
                       groups.list.length * this.column.groupPadding +
                       this.axis.trail;

  this.elem.selectAll('.scale')
      .attr('transform', 'translate(' + this.axis.width + ', 0)')
      .call(axis)
      .selectAll('.tick line')
      .attr('class', function(d) {
        if (d % self.multiplier === 0) {
          if (blocks[(d / self.multiplier) | 0])
            return 'block';
          else
            return 'major';
        } else {
          return 'minor';
        }
      })
      .attr('x2', intervalsWidth);

  this.elem.attr('width',
                 this.axis.width + this.axis.padding + intervalsWidth);
  this.elem.attr('height', this.column.tick * maxLine * this.multiplier);

  return scaleY;
};

Intervals.prototype.build = function build(config) {
  var totalCount = 0;
  var list = config.intervals.map(function(interval) {
    var res = {
      offset: totalCount,
      list: [ interval ].concat(interval.children)
    };

    totalCount += 1 + interval.children.length;

    return res;
  }).concat(config.registers.map(function(interval) {
    return {
      offset: totalCount++,
      list: [ interval ]
    };
  }));

  return {
    totalCount: totalCount,
    list: list
  };
};
