'use strict';

var linearscan = require('../../');
var d3 = require('d3');
var pipeline = require('json-pipeline');

var Input = require('./input');
var Intervals = require('./intervals');

function App(options) {
  var self = this;

  this.config = linearscan.config.create(options.config);

  this.input = new Input(options.input, options.initial);
  this.reindexed = new Input(options.reindexed);

  this.allocate = false;
  d3.select(options.allocate).on('change', function() {
    self.allocate = this.checked;
    self.input.emit('change', self.lastText);
  });

  this.lastText = null;
  this.input.on('change', function(text) {
    try {
      self.lastText = text;
      self.onChange(text);
    } catch (e) {
      console.error(e);
    }
  });

  this.intervals = new Intervals(options.intervals);
}
module.exports = App;

App.prototype.onChange = function onChange(text) {
  var p = pipeline.create('dominance');
  var reindexed;
  try {
    text = 'pipeline {\n' + text + '\n}';
    p.parse(text, { cfg: true, dominance: true }, 'printable');
    p.reindex();

    reindexed = p.render({ cfg: true, dominance: true }, 'printable');
  } catch (e) {
    return;
  }

  // Unpad data and remove `pipeline {}` wrap
  this.reindexed.update(reindexed.replace(/\n  /g, '\n')
                                 .replace(/^[^\n]+\n|\n[^\n]+$/g, ''));

  p = pipeline.create('dominance');
  p.parse(reindexed, { cfg: true, dominance: true }, 'printable');
  p.reindex();

  var builder = linearscan.builder.create(p, this.config);

  builder.buildIntervals();

  if (this.allocate) {
    var allocator = linearscan.allocator.create(this.config);

    allocator.allocate();
  }

  this.render();
};

App.prototype.render = function render() {
  this.intervals.update(this.config);
};
