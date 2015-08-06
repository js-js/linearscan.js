'use strict';

var util = require('util');
var d3 = require('d3');
var autosize = require('autosize');
var EventEmitter = require('events').EventEmitter;

function Input(selector) {
  EventEmitter.call(this);

  this.elem = d3.select(selector);

  var self = this;
  function change() {
    self.change(this);
  }
  this.elem.on('keyup', change)
           .on('keydown', change)
           .on('keypress', change)
           .on('blur', change);

  // Set initial height
  this.elem.each(function() {
    autosize(this);
  });
}
util.inherits(Input, EventEmitter);
module.exports = Input;

Input.prototype.change = function change(elem) {
  this.emit('change', elem.value);
};

Input.prototype.update = function update(text) {
  this.elem.text(text);
  this.elem.each(function() {
    autosize.update(this);
  });
};
